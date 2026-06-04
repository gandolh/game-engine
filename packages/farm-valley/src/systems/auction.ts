import type { SimContext, System, MessageBus, World, Rng, AgentMessage } from "@engine/core";
import type { GameEntity } from "../components";
import {
  ONT_SHOP,
  type AuctionCfpBody,
  type AuctionBidBody,
  type AuctionResultBody,
} from "../protocols/shop";
import { PERFORMATIVE } from "../protocols/performatives";
import { firstEntity } from "./entity-helpers";

type SealedBid = { bidderId: number; amount: number; tickReceived: number };

/** Deterministic sealed-bid comparator: amount desc, tickReceived asc, bidderId asc.
 *  This ordering is the determinism anchor — do not alter it. */
const compareSealedBids = (x: SealedBid, y: SealedBid): number => {
  if (y.amount !== x.amount) return y.amount - x.amount;
  if (x.tickReceived !== y.tickReceived) return x.tickReceived - y.tickReceived;
  return x.bidderId - y.bidderId;
};

interface VickreyState {
  type: "vickrey";
  cfp: AuctionCfpBody;
  bids: SealedBid[];
  resolved: boolean;
}

interface FpsbState {
  type: "fpsb";
  cfp: AuctionCfpBody;
  /** Same sealed-bid shape as Vickrey — only the price rule differs. */
  bids: SealedBid[];
  resolved: boolean;
}

interface DutchState {
  type: "dutch";
  cfp: AuctionCfpBody;
  /** Starting price = reservePrice for our simple model. */
  startPrice: number;
  /** How much the price drops per tick. */
  decrementPerTick: number;
  /** Floor below which the price will not go. */
  floor: number;
  /** First tick at which this auction was observed; `null` until anchored. */
  startTick: number | null;
  /** First-accept wins — null if open. */
  winner: { bidderId: number; paidPrice: number } | null;
  participants: Set<number>;
  resolved: boolean;
}

interface EnglishState {
  type: "english";
  cfp: AuctionCfpBody;
  /** Opening price = reservePrice. */
  startPrice: number;
  /** How much the asking price rises per tick. */
  incrementPerTick: number;
  /** Close the auction after this many ticks with no affirming bid. */
  noBidTimeout: number;
  /** First tick at which this auction was observed; `null` until anchored. */
  startTick: number | null;
  /**
   * Highest affirming bidder so far. Each affirm at the current ask replaces
   * this; the last/highest affirmer wins at the price they affirmed.
   */
  leader: { bidderId: number; paidPrice: number } | null;
  /** Tick of the most recent affirming bid (drives the no-bid timeout). */
  lastBidTick: number | null;
  participants: Set<number>;
  resolved: boolean;
}

type AuctionState = VickreyState | FpsbState | DutchState | EnglishState;

export interface DutchAuctionOptions {
  startPrice?: number;
  decrementPerTick?: number;
  floor?: number;
}

export interface EnglishAuctionOptions {
  incrementPerTick?: number;
  noBidTimeout?: number;
}

/**
 * AuctionSystem — state machine for four auction formats:
 *   - Vickrey: second-price sealed bid.
 *   - FPSB: first-price sealed bid (winner pays their own bid).
 *   - Dutch: descending clock; first accept wins at the current price.
 *   - English: ascending clock; bidders affirm while the ask is within their
 *     valuation; the last/highest affirmer wins at the current price.
 *
 * The system does NOT subscribe to the bus directly (the production
 * `InboxDispatchSystem` never calls `bus.notifySubscribers()`). Instead:
 *   - Auctions are opened by the ShopkeeperSystem calling `openAuction(cfp)`
 *     directly. The shopkeeper also broadcasts an `AUCTION_CFP` on the bus
 *     for farmer awareness.
 *   - Bids are read from the shopkeeper entity's inbox each tick (farmers
 *     send `ONT_SHOP.AUCTION_BID` direct-addressed to the shopkeeper).
 *   - Results are broadcast on the bus when an auction closes.
 *
 * For tests, callers can also invoke `submitBid()` directly to bypass the
 * inbox plumbing.
 */
export class AuctionSystem implements System {
  readonly name = "AuctionSystem";

  readonly auctions = new Map<string, AuctionState>();
  private readonly _rng: Rng;
  private readonly dutchDefaults: Required<DutchAuctionOptions>;
  private readonly englishDefaults: Required<EnglishAuctionOptions>;

  constructor(
    private readonly bus: MessageBus,
    private readonly world: World<GameEntity>,
    rng: Rng,
    dutchDefaults: DutchAuctionOptions = {},
    englishDefaults: EnglishAuctionOptions = {},
  ) {
    // Fork even if unused today so future Dutch jitter stays deterministic.
    this._rng = rng.fork("auction");
    void this._rng;
    this.dutchDefaults = {
      startPrice: dutchDefaults.startPrice ?? 200,
      decrementPerTick: dutchDefaults.decrementPerTick ?? 5,
      floor: dutchDefaults.floor ?? 10,
    };
    this.englishDefaults = {
      incrementPerTick: englishDefaults.incrementPerTick ?? 5,
      noBidTimeout: englishDefaults.noBidTimeout ?? 3,
    };
  }

  run(ctx: SimContext): void {
    // 1. Drain AUCTION_BID messages from the shopkeeper inbox.
    const shop = firstEntity(this.world, "shopkeeper", "inbox");
    if (shop?.inbox) {
      const remaining: AgentMessage[] = [];
      for (const msg of shop.inbox.messages) {
        if (msg.ontology === ONT_SHOP.AUCTION_BID) {
          this.handleBidMessage(msg, ctx);
        } else {
          remaining.push(msg);
        }
      }
      shop.inbox.messages = remaining;
    }

    // 2. Resolve closed sealed-bid auctions; advance the Dutch/English clocks.
    for (const auction of this.auctions.values()) {
      if (auction.resolved) continue;
      switch (auction.type) {
        case "vickrey": {
          if (ctx.tick >= auction.cfp.closesAtTick) this.resolveVickrey(auction, ctx);
          break;
        }
        case "fpsb": {
          if (ctx.tick >= auction.cfp.closesAtTick) this.resolveFpsb(auction, ctx);
          break;
        }
        case "dutch": {
          // Anchor startTick on the first run-pass that observes this auction
          // so that the descending clock counts from when the system sees it,
          // not from whenever the first bid happens to arrive.
          if (auction.startTick === null) auction.startTick = ctx.tick;
          if (auction.winner !== null) {
            this.resolveDutch(auction, ctx);
          } else if (ctx.tick >= auction.cfp.closesAtTick) {
            this.resolveDutch(auction, ctx); // no taker → null winner
          }
          break;
        }
        case "english": {
          // Anchor startTick on the first observation, mirroring Dutch, so the
          // ascending clock counts from when the system sees the auction.
          if (auction.startTick === null) auction.startTick = ctx.tick;
          if (this.englishShouldClose(auction, ctx.tick)) {
            this.resolveEnglish(auction, ctx);
          }
          break;
        }
      }
    }
  }

  // ---- public API (callable by ShopkeeperSystem and tests) --------------

  /**
   * Open a new auction. Idempotent — re-opening with an existing id is a
   * no-op so duplicate CFP broadcasts don't reset state.
   */
  openAuction(
    cfp: AuctionCfpBody,
    dutch?: DutchAuctionOptions,
    english?: EnglishAuctionOptions,
  ): void {
    if (this.auctions.has(cfp.auctionId)) return;
    switch (cfp.type) {
      case "vickrey": {
        const state: VickreyState = { type: "vickrey", cfp, bids: [], resolved: false };
        this.auctions.set(cfp.auctionId, state);
        return;
      }
      case "fpsb": {
        const state: FpsbState = { type: "fpsb", cfp, bids: [], resolved: false };
        this.auctions.set(cfp.auctionId, state);
        return;
      }
      case "dutch": {
        const opts = { ...this.dutchDefaults, ...dutch };
        const state: DutchState = {
          type: "dutch",
          cfp,
          startPrice: Math.max(opts.startPrice, cfp.reservePrice),
          decrementPerTick: opts.decrementPerTick,
          floor: Math.max(opts.floor, cfp.reservePrice),
          startTick: null, // anchored on first observation via currentDutchPrice
          winner: null,
          participants: new Set<number>(),
          resolved: false,
        };
        this.auctions.set(cfp.auctionId, state);
        return;
      }
      case "english": {
        const opts = { ...this.englishDefaults, ...english };
        const state: EnglishState = {
          type: "english",
          cfp,
          startPrice: cfp.reservePrice,
          incrementPerTick: opts.incrementPerTick,
          noBidTimeout: opts.noBidTimeout,
          startTick: null, // anchored on first observation via currentEnglishPrice
          leader: null,
          lastBidTick: null,
          participants: new Set<number>(),
          resolved: false,
        };
        this.auctions.set(cfp.auctionId, state);
        return;
      }
    }
  }

  /**
   * Submit a bid for an existing auction.
   *   - Vickrey/FPSB: stored (sealed) until close.
   *   - Dutch: the first call with `amount >= currentPrice` wins at `currentPrice`.
   *   - English: an affirm with `amount >= currentPrice` becomes the new leader
   *     at the current ask; the last/highest affirmer wins on close.
   * Returns false if the auction does not exist or is already resolved.
   */
  submitBid(bid: AuctionBidBody, tick: number): boolean {
    const a = this.auctions.get(bid.auctionId);
    if (!a || a.resolved) return false;
    switch (a.type) {
      case "vickrey":
      case "fpsb": {
        if (tick >= a.cfp.closesAtTick) return false;
        a.bids.push({ bidderId: bid.bidderId, amount: bid.amount, tickReceived: tick });
        return true;
      }
      case "dutch": {
        a.participants.add(bid.bidderId);
        if (a.winner !== null) return false;
        if (tick >= a.cfp.closesAtTick) return false;
        const current = this.currentDutchPrice(a, tick);
        if (bid.amount >= current) {
          a.winner = { bidderId: bid.bidderId, paidPrice: current };
          return true;
        }
        return false;
      }
      case "english": {
        a.participants.add(bid.bidderId);
        if (tick >= a.cfp.closesAtTick) return false;
        const current = this.currentEnglishPrice(a, tick);
        // Affirm only counts while the ask is within the bidder's valuation.
        if (bid.amount >= current) {
          a.leader = { bidderId: bid.bidderId, paidPrice: current };
          a.lastBidTick = tick;
          return true;
        }
        return false;
      }
    }
  }

  /** Current price of a Dutch auction at the given tick. */
  currentDutchPrice(a: DutchState, tick: number): number {
    if (a.startTick === null) a.startTick = tick;
    const elapsed = Math.max(0, tick - a.startTick);
    const raw = a.startPrice - a.decrementPerTick * elapsed;
    return Math.max(a.floor, raw);
  }

  /** Current ask of an English auction at the given tick. */
  currentEnglishPrice(a: EnglishState, tick: number): number {
    if (a.startTick === null) a.startTick = tick;
    const elapsed = Math.max(0, tick - a.startTick);
    return a.startPrice + a.incrementPerTick * elapsed;
  }

  // ---- internals --------------------------------------------------------

  private handleBidMessage(msg: AgentMessage, ctx: SimContext): void {
    const body = msg.body as Partial<AuctionBidBody>;
    if (!body.auctionId || typeof body.amount !== "number") return;
    if (msg.sender === "world") return;
    const bidderId = body.bidderId ?? msg.sender;
    this.submitBid(
      { auctionId: body.auctionId, bidderId, amount: body.amount },
      ctx.tick,
    );
  }

  private resolveVickrey(a: VickreyState, ctx: SimContext): void {
    a.resolved = true;
    const participants = uniqueParticipants(a.bids.map((b) => b.bidderId));
    if (a.bids.length === 0) {
      this.broadcastResult(a.cfp.auctionId, {
        auctionId: a.cfp.auctionId,
        winnerId: null,
        paidPrice: a.cfp.reservePrice,
        participants,
      }, ctx.tick);
      return;
    }

    // Sort by amount desc, tie-break by earliest tickReceived, then lowest
    // bidderId (brief 24 — final stable key so resolution never depends on
    // inbox insertion order; matches the FPSB ordering below).
    const sorted = a.bids.slice().sort(compareSealedBids);

    const top = sorted[0]!;
    if (top.amount < a.cfp.reservePrice) {
      this.broadcastResult(a.cfp.auctionId, {
        auctionId: a.cfp.auctionId,
        winnerId: null,
        paidPrice: a.cfp.reservePrice,
        participants,
      }, ctx.tick);
      return;
    }

    let paid: number;
    if (sorted.length === 1) {
      paid = a.cfp.reservePrice;
    } else {
      const second = sorted[1]!;
      paid = Math.max(second.amount, a.cfp.reservePrice);
    }

    this.broadcastResult(a.cfp.auctionId, {
      auctionId: a.cfp.auctionId,
      winnerId: top.bidderId,
      paidPrice: paid,
      participants,
    }, ctx.tick);
  }

  private resolveFpsb(a: FpsbState, ctx: SimContext): void {
    a.resolved = true;
    const participants = uniqueParticipants(a.bids.map((b) => b.bidderId));
    if (a.bids.length === 0) {
      this.broadcastResult(a.cfp.auctionId, {
        auctionId: a.cfp.auctionId,
        winnerId: null,
        paidPrice: a.cfp.reservePrice,
        participants,
      }, ctx.tick);
      return;
    }

    // Sort by amount desc; tie-break by earliest tickReceived then lowest
    // bidder id (matches the Vickrey first-come ordering, with a final stable
    // bidder-id key for fully deterministic resolution).
    const sorted = a.bids.slice().sort(compareSealedBids);

    const top = sorted[0]!;
    if (top.amount < a.cfp.reservePrice) {
      this.broadcastResult(a.cfp.auctionId, {
        auctionId: a.cfp.auctionId,
        winnerId: null,
        paidPrice: a.cfp.reservePrice,
        participants,
      }, ctx.tick);
      return;
    }

    // First-price: the winner pays their OWN bid.
    this.broadcastResult(a.cfp.auctionId, {
      auctionId: a.cfp.auctionId,
      winnerId: top.bidderId,
      paidPrice: top.amount,
      participants,
    }, ctx.tick);
  }

  private resolveDutch(a: DutchState, ctx: SimContext): void {
    a.resolved = true;
    const participants = Array.from(a.participants);
    if (a.winner === null) {
      this.broadcastResult(a.cfp.auctionId, {
        auctionId: a.cfp.auctionId,
        winnerId: null,
        paidPrice: a.cfp.reservePrice,
        participants,
      }, ctx.tick);
      return;
    }
    this.broadcastResult(a.cfp.auctionId, {
      auctionId: a.cfp.auctionId,
      winnerId: a.winner.bidderId,
      paidPrice: a.winner.paidPrice,
      participants,
    }, ctx.tick);
  }

  /**
   * An English auction closes when either the fixed clock runs out
   * (`tick >= closesAtTick`) or no affirming bid has arrived within
   * `noBidTimeout` ticks. The timeout is measured from the most recent
   * affirm, or from the anchored start tick when there have been no bids.
   */
  private englishShouldClose(a: EnglishState, tick: number): boolean {
    if (tick >= a.cfp.closesAtTick) return true;
    const since = a.lastBidTick ?? a.startTick ?? tick;
    return tick - since >= a.noBidTimeout;
  }

  private resolveEnglish(a: EnglishState, ctx: SimContext): void {
    a.resolved = true;
    const participants = Array.from(a.participants);
    if (a.leader === null) {
      this.broadcastResult(a.cfp.auctionId, {
        auctionId: a.cfp.auctionId,
        winnerId: null,
        paidPrice: a.cfp.reservePrice,
        participants,
      }, ctx.tick);
      return;
    }
    this.broadcastResult(a.cfp.auctionId, {
      auctionId: a.cfp.auctionId,
      winnerId: a.leader.bidderId,
      paidPrice: a.leader.paidPrice,
      participants,
    }, ctx.tick);
  }

  private broadcastResult(_id: string, body: AuctionResultBody, tick: number): void {
    this.bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology: ONT_SHOP.AUCTION_RESULT,
        sender: "world",
        recipient: "broadcast",
        body: body as unknown as Record<string, unknown>,
      },
      tick,
    );
  }

}

function uniqueParticipants(ids: readonly number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
