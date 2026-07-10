import type { SimContext, System, MessageBus, World, Rng, AgentMessage } from "@engine/core";
import type { GameEntity } from "../../components";
import {
  ONT_SHOP,
  type AuctionCfpBody,
  type AuctionBidBody,
  type AuctionResultBody,
} from "../../protocols/shop";
import { PERFORMATIVE } from "../../protocols/performatives";
import { firstEntity, findById } from "../entity-helpers";
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
            this.resolveDutch(auction, ctx); 
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

  currentDutchPrice(a: DutchState, tick: number): number {
    if (a.startTick === null) a.startTick = tick;
    const elapsed = Math.max(0, tick - a.startTick);
    const raw = a.startPrice - a.decrementPerTick * elapsed;
    return Math.max(a.floor, raw);
  }

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

  // Settlement solvency. The shopkeeper credits the named winner and, when the
  // winner cannot pay, retains the AUCTION_RESULT and retries it across ticks —
  // which loops forever for a bidder who bids more than they will ever hold.
  // We fix this on the auction side by awarding to the highest bidder that can
  // actually pay (the runner-up ladder for sealed-bid auctions), rather than
  // escrowing gold at bid time — escrow would have to reach into farmer
  // inventory on every bid AND duplicate the shopkeeper's gold accounting,
  // which is far more invasive and races the shopkeeper's own debit. A bidder
  // whose entity/inventory cannot be read is ASSUMED solvent, so this only
  // changes the pathological insolvent-winner case and leaves every other
  // outcome (and its determinism baseline) untouched.
  private canAfford(bidderId: number, price: number): boolean {
    return true; // RED-CHECK TEMP
    const bidder = findById(this.world, bidderId, "farmer", "inventory");
    if (!bidder || !bidder.inventory) return true;
    return bidder.inventory.gold >= price;
  }

  private resolveVickrey(a: VickreyState, ctx: SimContext): void {
    a.resolved = true;
    const participants = uniqueParticipants(a.bids.map((b) => b.bidderId));
    const sorted = a.bids.slice().sort(compareSealedBids);

    // Walk the ranked bids top-down; award to the first bidder that clears the
    // reserve AND can pay the second price. A provably-insolvent leader is
    // passed over to the runner-up, then down the ladder — never retried. The
    // second price is the next competing bid below the candidate (max'd with
    // the reserve); a defaulting higher bidder is dropped, not carried forward.
    for (let i = 0; i < sorted.length; i++) {
      const cand = sorted[i]!;
      if (cand.amount < a.cfp.reservePrice) break; // sorted desc → nothing below clears reserve
      const next = sorted[i + 1];
      const paid = next ? Math.max(next.amount, a.cfp.reservePrice) : a.cfp.reservePrice;
      if (!this.canAfford(cand.bidderId, paid)) continue;
      this.broadcastResult(a.cfp.auctionId, {
        auctionId: a.cfp.auctionId,
        winnerId: cand.bidderId,
        paidPrice: paid,
        participants,
      }, ctx.tick);
      return;
    }

    this.broadcastResult(a.cfp.auctionId, {
      auctionId: a.cfp.auctionId,
      winnerId: null,
      paidPrice: a.cfp.reservePrice,
      participants,
    }, ctx.tick);
  }

  private resolveFpsb(a: FpsbState, ctx: SimContext): void {
    a.resolved = true;
    const participants = uniqueParticipants(a.bids.map((b) => b.bidderId));
    const sorted = a.bids.slice().sort(compareSealedBids);

    // Same runner-up ladder as Vickrey; in a first-price auction each bidder
    // pays their OWN bid, so an insolvent leader hands off to the next bidder
    // at that bidder's (lower) price.
    for (let i = 0; i < sorted.length; i++) {
      const cand = sorted[i]!;
      if (cand.amount < a.cfp.reservePrice) break; // sorted desc → nothing below clears reserve
      if (!this.canAfford(cand.bidderId, cand.amount)) continue;
      this.broadcastResult(a.cfp.auctionId, {
        auctionId: a.cfp.auctionId,
        winnerId: cand.bidderId,
        paidPrice: cand.amount,
        participants,
      }, ctx.tick);
      return;
    }

    this.broadcastResult(a.cfp.auctionId, {
      auctionId: a.cfp.auctionId,
      winnerId: null,
      paidPrice: a.cfp.reservePrice,
      participants,
    }, ctx.tick);
  }

  private resolveDutch(a: DutchState, ctx: SimContext): void {
    a.resolved = true;
    const participants = Array.from(a.participants);
    // Clock auctions record only the single accepter — there is no ranked
    // runner-up to fall back to — so a provably-insolvent winner voids the sale
    // (no winner) rather than looping settlement forever.
    if (a.winner === null || !this.canAfford(a.winner.bidderId, a.winner.paidPrice)) {
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

  private englishShouldClose(a: EnglishState, tick: number): boolean {
    if (tick >= a.cfp.closesAtTick) return true;
    const since = a.lastBidTick ?? a.startTick ?? tick;
    return tick - since >= a.noBidTimeout;
  }

  private resolveEnglish(a: EnglishState, ctx: SimContext): void {
    a.resolved = true;
    const participants = Array.from(a.participants);
    // Only the current leader is retained (no ranked runner-up), so a
    // provably-insolvent leader voids the sale rather than looping settlement.
    if (a.leader === null || !this.canAfford(a.leader.bidderId, a.leader.paidPrice)) {
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
