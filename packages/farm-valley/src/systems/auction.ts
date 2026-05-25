import type { SimContext, System, MessageBus, World, Rng, AgentMessage } from "@engine/core";
import type { GameEntity } from "../components";
import {
  ONT_SHOP,
  type AuctionCfpBody,
  type AuctionBidBody,
  type AuctionResultBody,
  type AuctionType,
} from "../protocols/shop";
import { PERFORMATIVE } from "../protocols/performatives";

interface VickreyState {
  type: "vickrey";
  cfp: AuctionCfpBody;
  bids: Array<{ bidderId: number; amount: number; tickReceived: number }>;
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

type AuctionState = VickreyState | DutchState;

export interface DutchAuctionOptions {
  startPrice?: number;
  decrementPerTick?: number;
  floor?: number;
}

/**
 * AuctionSystem — state machine for Vickrey (second-price sealed bid) and
 * Dutch (descending clock) auctions. English and FPSB are TODO and currently
 * return `null` winners.
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

  constructor(
    private readonly bus: MessageBus,
    private readonly world: World<GameEntity>,
    rng: Rng,
    dutchDefaults: DutchAuctionOptions = {},
  ) {
    // Fork even if unused today so future Dutch jitter stays deterministic.
    this._rng = rng.fork("auction");
    void this._rng;
    this.dutchDefaults = {
      startPrice: dutchDefaults.startPrice ?? 200,
      decrementPerTick: dutchDefaults.decrementPerTick ?? 5,
      floor: dutchDefaults.floor ?? 10,
    };
  }

  run(ctx: SimContext): void {
    // 1. Drain AUCTION_BID messages from the shopkeeper inbox.
    const shop = this.findShop();
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

    // 2. Resolve any closed Vickrey auctions; advance Dutch clocks.
    for (const auction of this.auctions.values()) {
      if (auction.resolved) continue;
      if (auction.type === "vickrey") {
        if (ctx.tick >= auction.cfp.closesAtTick) {
          this.resolveVickrey(auction, ctx);
        }
      } else {
        // Anchor startTick on the first run-pass that observes this auction
        // so that the descending clock counts from when the system sees it,
        // not from whenever the first bid happens to arrive.
        if (auction.startTick === null) auction.startTick = ctx.tick;
        if (auction.winner !== null) {
          this.resolveDutch(auction, ctx);
        } else if (ctx.tick >= auction.cfp.closesAtTick) {
          this.resolveDutch(auction, ctx); // no taker → null winner
        }
      }
    }
  }

  // ---- public API (callable by ShopkeeperSystem and tests) --------------

  /**
   * Open a new auction. Idempotent — re-opening with an existing id is a
   * no-op so duplicate CFP broadcasts don't reset state.
   */
  openAuction(cfp: AuctionCfpBody, dutch?: DutchAuctionOptions): void {
    if (this.auctions.has(cfp.auctionId)) return;
    switch (cfp.type) {
      case "vickrey": {
        const state: VickreyState = { type: "vickrey", cfp, bids: [], resolved: false };
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
      case "english":
      case "fpsb":
        // TODO: not implemented yet. Result will be null winner.
        this.auctions.set(cfp.auctionId, {
          type: "vickrey",
          cfp: { ...cfp, type: cfp.type as AuctionType },
          bids: [],
          resolved: false,
        });
        return;
    }
  }

  /**
   * Submit a bid for an existing auction. For Vickrey: stored. For Dutch:
   * the first call with `amount >= currentPrice` wins at `currentPrice`.
   * Returns false if the auction does not exist or is already resolved.
   */
  submitBid(bid: AuctionBidBody, tick: number): boolean {
    const a = this.auctions.get(bid.auctionId);
    if (!a || a.resolved) return false;
    if (a.type === "vickrey") {
      if (tick >= a.cfp.closesAtTick) return false;
      a.bids.push({ bidderId: bid.bidderId, amount: bid.amount, tickReceived: tick });
      return true;
    }
    // Dutch
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

  /** Current price of a Dutch auction at the given tick. */
  currentDutchPrice(a: DutchState, tick: number): number {
    if (a.startTick === null) a.startTick = tick;
    const elapsed = Math.max(0, tick - a.startTick);
    const raw = a.startPrice - a.decrementPerTick * elapsed;
    return Math.max(a.floor, raw);
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

    // Sort by amount desc, tie-break by earliest tickReceived (deterministic
    // first-come-first-served on equal bids).
    const sorted = a.bids.slice().sort((x, y) => {
      if (y.amount !== x.amount) return y.amount - x.amount;
      return x.tickReceived - y.tickReceived;
    });

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

  private findShop(): GameEntity | undefined {
    for (const e of this.world.query("shopkeeper", "inbox")) return e;
    return undefined;
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
