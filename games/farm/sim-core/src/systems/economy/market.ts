import type { SimContext, System, MessageBus, World, Rng, AgentMessage } from "@engine/core";
import type { GameEntity, CropKind, CropQuality, CropQualityCounts } from "../../components";
import { bankHarvest, debitCropDetailed } from "../../economy";
import { firstEntity, findById } from "../entity-helpers";
import {
  ONT_MARKET,
  type MarketOffer,
  type MarketOntology,
  type MarketRejectedBody,
  type PostOfferBody,
  type ReadOffersBody,
  type OffersListBody,
  type CancelOfferBody,
  type BuyRequestBody,
} from "../../protocols/market";
import { PERFORMATIVE } from "../../protocols/performatives";

/**
 * An offer as the wall actually holds it (brief 98). On top of the wire-format
 * {@link MarketOffer} it carries:
 *  - `escrow`: the quality tiers the wall took OFF the seller's inventory when
 *    the offer was posted. The wall — not the seller — owns that stock until the
 *    offer is bought, cancelled, or expires, so an offer can never oversell and
 *    two racing buyers can never be paid out of the same crops.
 *  - `postedTick`: for the TTL sweep that keeps `offersById` bounded.
 */
interface WallOffer extends MarketOffer {
  escrow: CropQualityCounts;
  postedTick: number;
}

/** An offer nobody bought is swept back to its seller after this many days. */
export const OFFER_TTL_DAYS = 3;
const DEFAULT_TICKS_PER_DAY = 1200;

const QUALITY_TIERS: readonly CropQuality[] = ["normal", "silver", "gold"];

export interface MarketSettlement {
  offerId: string;
  sellerId: number;
  buyerId: number;
  crop: CropKind;
  quantity: number;
  pricePerUnit: number;
  totalPrice: number;
}

export class MarketSystem implements System {
  readonly name = "MarketSystem";

  readonly offersById = new Map<string, WallOffer>();
  private readonly offerIdRng: Rng;
  private readonly ttlTicks: number;

  constructor(
    private readonly bus: MessageBus,
    private readonly world: World<GameEntity>,
    rng: Rng,
    opts: { ticksPerDay?: number; ttlDays?: number } = {},
  ) {
    this.offerIdRng = rng.fork("market.offerId");
    this.ttlTicks =
      (opts.ttlDays ?? OFFER_TTL_DAYS) * (opts.ticksPerDay ?? DEFAULT_TICKS_PER_DAY);
  }

  run(ctx: SimContext): void {
    // Sweep first, unconditionally: the wall must stay bounded even on ticks
    // where nobody messages it (brief 98 — `offersById` used to grow all run).
    this.sweepExpiredOffers(ctx);

    const wall = firstEntity(this.world, "marketWall", "inbox");
    if (!wall || !wall.inbox) return;

    const messages = wall.inbox.messages;
    if (messages.length === 0) return;

    const drained = messages.slice();
    messages.length = 0;

    for (const msg of drained) {
      switch (msg.ontology) {
        case ONT_MARKET.POST_OFFER:
          this.handlePostOffer(msg, ctx);
          break;
        case ONT_MARKET.READ_OFFERS:
          this.handleReadOffers(msg, ctx);
          break;
        case ONT_MARKET.CANCEL_OFFER:
          this.handleCancelOffer(msg, ctx);
          break;
        case ONT_MARKET.BUY_REQUEST:
          this.handleBuyRequest(msg, ctx);
          break;
        case ONT_MARKET.TRADE_COMPLETED:
          this.handleTradeCompleted(msg);
          break;
        default:
          break;
      }
    }
  }

  /** Read-only view of a live offer (used by the seller-side settlement system). */
  getOffer(offerId: string): Readonly<MarketOffer> | undefined {
    return this.offersById.get(offerId);
  }

  /**
   * Settle a forwarded BUY_REQUEST on the seller's behalf: all-or-nothing on the
   * offer, at the offer's OWN price (never the price the buyer claimed — a stale
   * belief must not be able to invent value). Moves the escrowed stock (tier for
   * tier) onto the buyer and the coin onto the seller, then retires the offer.
   *
   * Returns the settlement, or `null` if it could not close (offer gone, buyer or
   * seller missing, buyer can't cover the full price) — in which case nothing is
   * mutated and the offer stays on the wall.
   */
  settleBuy(offerId: string, buyerId: number): MarketSettlement | null {
    const offer = this.offersById.get(offerId);
    if (!offer) return null;
    if (offer.sellerId === buyerId) return null;
    if (offer.quantity <= 0) {
      this.offersById.delete(offerId);
      return null;
    }

    const buyer = findById(this.world, buyerId, "farmer", "inventory");
    const seller = findById(this.world, offer.sellerId, "farmer", "inventory");
    if (!buyer?.inventory || !seller?.inventory) return null;

    const totalPrice = offer.pricePerUnit * offer.quantity;
    if (buyer.inventory.gold < totalPrice) return null;

    buyer.inventory.gold -= totalPrice;
    seller.inventory.gold += totalPrice;
    this.credit(buyer, offer.crop, offer.escrow);

    this.offersById.delete(offerId);

    return {
      offerId,
      sellerId: offer.sellerId,
      buyerId,
      crop: offer.crop,
      quantity: offer.quantity,
      pricePerUnit: offer.pricePerUnit,
      totalPrice,
    };
  }

  private handlePostOffer(msg: AgentMessage, ctx: SimContext): void {
    const body = msg.body as Partial<PostOfferBody>;
    const offer = body.offer;
    if (!offer || typeof offer.quantity !== "number" || typeof offer.pricePerUnit !== "number") {
      return;
    }
    if (msg.sender === "world") return;
    const sellerId = msg.sender;

    const seller = findById(this.world, sellerId, "farmer", "inventory");
    if (!seller || !seller.inventory) return;
    if (seller.inventory.crops[offer.crop as CropKind] === undefined) return;

    if (seller.farmer && seller.farmer.currentRegion !== "village") {
      this.sendRejection(sellerId, ONT_MARKET.POST_OFFER, ctx.tick);
      return;
    }
    if (offer.quantity <= 0 || offer.pricePerUnit < 0) return;

    // Escrow: take the goods off the seller NOW (brief 98). A posted offer the
    // seller cannot cover simply never exists, so the wall can never oversell.
    const { taken, tiers } = debitCropDetailed(seller.inventory, offer.crop, offer.quantity);
    if (taken <= 0) return;

    const offerId = this.offerIdRng.nextU32().toString(36);
    const stored: WallOffer = {
      offerId,
      sellerId,
      crop: offer.crop,
      quantity: taken,
      pricePerUnit: offer.pricePerUnit,
      postedDay: this.readDay(seller) ?? ctx.tick,
      postedTick: ctx.tick,
      escrow: tiers,
    };
    this.offersById.set(offerId, stored);
  }

  private handleReadOffers(msg: AgentMessage, ctx: SimContext): void {
    if (msg.sender === "world") return;
    const body = msg.body as Partial<ReadOffersBody>;
    const cropFilter = body.filter?.crop;
    const offers: MarketOffer[] = [];
    for (const o of this.offersById.values()) {
      if (cropFilter && o.crop !== cropFilter) continue;
      // Wire copy: escrow/postedTick are the wall's private bookkeeping.
      offers.push({
        offerId: o.offerId,
        sellerId: o.sellerId,
        crop: o.crop,
        quantity: o.quantity,
        pricePerUnit: o.pricePerUnit,
        postedDay: o.postedDay,
      });
    }
    const replyBody: OffersListBody = { offers };
    this.bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology: ONT_MARKET.OFFERS_LIST,
        sender: "world",
        recipient: msg.sender,
        body: replyBody as unknown as Record<string, unknown>,
      },
      ctx.tick,
    );
  }

  private handleCancelOffer(msg: AgentMessage, ctx: SimContext): void {
    const body = msg.body as Partial<CancelOfferBody>;
    if (!body.offerId) return;
    const offer = this.offersById.get(body.offerId);
    if (!offer) return;
    if (msg.sender === "world" || msg.sender !== offer.sellerId) return;

    const seller = findById(this.world, msg.sender, "farmer", "inventory");
    if (seller?.farmer && seller.farmer.currentRegion !== "village") {
      this.sendRejection(msg.sender, ONT_MARKET.CANCEL_OFFER, ctx.tick);
      return;
    }

    this.refund(offer);
    this.offersById.delete(body.offerId);
  }

  private handleBuyRequest(msg: AgentMessage, ctx: SimContext): void {
    const body = msg.body as Partial<BuyRequestBody>;
    if (!body.offerId) return;
    const offer = this.offersById.get(body.offerId);
    if (!offer) return;
    if (msg.sender === "world") return;
    if (msg.sender === offer.sellerId) return;

    const forwarded: BuyRequestBody = {
      offerId: offer.offerId,
      buyerId: msg.sender,
      pricePerUnit: offer.pricePerUnit,
      quantity: offer.quantity,
    };
    this.bus.send(
      {
        performative: PERFORMATIVE.REQUEST,
        ontology: ONT_MARKET.BUY_REQUEST,
        sender: "world",
        recipient: offer.sellerId,
        body: forwarded as unknown as Record<string, unknown>,
      },
      ctx.tick,
    );
  }

  private handleTradeCompleted(msg: AgentMessage): void {
    const body = msg.body as { offerId?: string };
    if (!body.offerId) return;
    // settleBuy already retired the offer; this is the idempotent wall-side
    // bookkeeping (and the hook trust/event-feed snoop off the wall inbox).
    this.offersById.delete(body.offerId);
  }

  /**
   * TTL sweep: an offer nobody bought within OFFER_TTL_DAYS is retired and its
   * escrowed stock handed back to the seller. Without this the wall would hoard
   * both offer records and real crops for the whole run.
   */
  private sweepExpiredOffers(ctx: SimContext): void {
    if (this.offersById.size === 0) return;
    let expired: string[] | undefined;
    for (const offer of this.offersById.values()) {
      if (ctx.tick - offer.postedTick < this.ttlTicks) continue;
      (expired ??= []).push(offer.offerId);
    }
    if (!expired) return;
    for (const offerId of expired) {
      const offer = this.offersById.get(offerId);
      if (!offer) continue;
      this.refund(offer);
      this.offersById.delete(offerId);
    }
  }

  /** Hand escrowed stock back to the seller, tier for tier. */
  private refund(offer: WallOffer): void {
    const seller = findById(this.world, offer.sellerId, "farmer", "inventory");
    if (!seller?.inventory) return;
    this.credit(seller, offer.crop, offer.escrow);
  }

  private credit(entity: GameEntity, crop: CropKind, tiers: CropQualityCounts): void {
    if (!entity.inventory) return;
    for (const tier of QUALITY_TIERS) {
      const n = tiers[tier];
      if (n > 0) bankHarvest(entity.inventory, crop, n, tier);
    }
  }

  private sendRejection(
    recipientId: number,
    originalOntology: MarketOntology,
    tick: number,
  ): void {
    const body: MarketRejectedBody = {
      reason: "not-in-village",
      originalOntology,
    };
    this.bus.send(
      {
        performative: PERFORMATIVE.REFUSE,
        ontology: ONT_MARKET.REJECTED,
        sender: "world",
        recipient: recipientId,
        body: body as unknown as Record<string, unknown>,
      },
      tick,
    );
  }

  private readDay(entity: GameEntity): number | undefined {
    const d = entity.beliefs?.data.currentDay;
    return typeof d === "number" ? d : undefined;
  }
}
