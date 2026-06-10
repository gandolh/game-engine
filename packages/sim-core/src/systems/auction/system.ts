import type { SimContext, System, MessageBus, World, Rng, AgentMessage } from "@engine/core";
import type { GameEntity } from "../../components";
import {
  ONT_SHOP,
  type AuctionCfpBody,
  type AuctionBidBody,
  type AuctionResultBody,
} from "../../protocols/shop";
import { PERFORMATIVE } from "../../protocols/performatives";
import { firstEntity } from "../entity-helpers";
import {
  type SealedBid,
  compareSealedBids,
  type VickreyState,
  type FpsbState,
  type DutchState,
  type EnglishState,
  type AuctionState,
  type DutchAuctionOptions,
  type EnglishAuctionOptions,
  uniqueParticipants,
} from "./state";

export type { DutchAuctionOptions, EnglishAuctionOptions };

/**
 * State machine for four auction formats (Vickrey, FPSB, Dutch, English).
 * ShopkeeperSystem opens auctions via openAuction(); bids arrive in the shopkeeper inbox.
 * Tests may call submitBid() directly. Results broadcast on the bus when closed.
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
    this._rng = rng.fork("auction"); // forked now so any future use stays deterministic
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
          if (auction.startTick === null) auction.startTick = ctx.tick;
          if (auction.winner !== null) {
            this.resolveDutch(auction, ctx);
          } else if (ctx.tick >= auction.cfp.closesAtTick) {
            this.resolveDutch(auction, ctx); // no taker → null winner
          }
          break;
        }
        case "english": {
          if (auction.startTick === null) auction.startTick = ctx.tick;
          if (this.englishShouldClose(auction, ctx.tick)) {
            this.resolveEnglish(auction, ctx);
          }
          break;
        }
      }
    }
  }

  /** Idempotent — re-opening an existing auctionId is a no-op. */
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
          startTick: null,
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
          startTick: null,
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

  /** Returns false if the auction doesn't exist or is already resolved. */
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

    // compareSealedBids: amount desc, tickReceived asc, bidderId asc — deterministic regardless of inbox order.
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

  // Closes on fixed timeout OR noBidTimeout ticks after the last affirm.
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
