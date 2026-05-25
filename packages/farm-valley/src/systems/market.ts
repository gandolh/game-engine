import type { SimContext, System, MessageBus, World, Rng, AgentMessage } from "@engine/core";
import type { GameEntity, CropKind } from "../components";
import {
  ONT_MARKET,
  type MarketOffer,
  type PostOfferBody,
  type ReadOffersBody,
  type OffersListBody,
  type CancelOfferBody,
  type BuyRequestBody,
} from "../protocols/market";
import { PERFORMATIVE } from "../protocols/performatives";

/**
 * MarketSystem — bulletin-board market. Handles ontologies posted to the
 * MarketWall entity's inbox.
 *
 * Design choices:
 *   - Offer store lives here (`offersById: Map<string, MarketOffer>`),
 *     not on the wall entity. This keeps the entity component shape clean
 *     and avoids the `[key: string]: unknown` escape hatch.
 *   - offerId is generated deterministically via `rng.fork("market.offerId")`
 *     once at construction; every POST_OFFER consumes one `nextU32()` from
 *     that forked stream, yielding the same id sequence for the same seed.
 *   - BUY_REQUEST is forwarded directly to the offer's seller as a
 *     REQUEST/BUY_REQUEST direct message; the seller's farmer agent is
 *     expected to react (out of scope here).
 *   - Unknown buyer/seller references are silently ignored — invalid input
 *     should not crash the loop.
 */
export class MarketSystem implements System {
  readonly name = "MarketSystem";

  readonly offersById = new Map<string, MarketOffer>();
  private readonly offerIdRng: Rng;

  constructor(
    private readonly bus: MessageBus,
    private readonly world: World<GameEntity>,
    rng: Rng,
  ) {
    this.offerIdRng = rng.fork("market.offerId");
  }

  run(ctx: SimContext): void {
    const wall = this.findWall();
    if (!wall || !wall.inbox) return;

    const messages = wall.inbox.messages;
    if (messages.length === 0) return;

    // Drain the wall's inbox each tick.
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
          this.handleCancelOffer(msg);
          break;
        case ONT_MARKET.BUY_REQUEST:
          this.handleBuyRequest(msg, ctx);
          break;
        case ONT_MARKET.TRADE_COMPLETED:
          this.handleTradeCompleted(msg);
          break;
        default:
          // Unknown ontology — drop silently.
          break;
      }
    }
  }

  // ---- handlers ----------------------------------------------------------

  private handlePostOffer(msg: AgentMessage, ctx: SimContext): void {
    const body = msg.body as Partial<PostOfferBody>;
    const offer = body.offer;
    if (!offer || typeof offer.quantity !== "number" || typeof offer.pricePerUnit !== "number") {
      return;
    }
    if (msg.sender === "world") return; // world cannot post farmer offers
    const sellerId = msg.sender;

    // Verify seller actually has inventory (silent ignore otherwise).
    const seller = this.findFarmerById(sellerId);
    if (!seller || !seller.inventory) return;
    if (seller.inventory.crops[offer.crop as CropKind] === undefined) return;

    const offerId = this.offerIdRng.nextU32().toString(36);
    const stored: MarketOffer = {
      offerId,
      sellerId,
      crop: offer.crop,
      quantity: offer.quantity,
      pricePerUnit: offer.pricePerUnit,
      postedDay: this.readDay(seller) ?? ctx.tick,
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
      offers.push(o);
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

  private handleCancelOffer(msg: AgentMessage): void {
    const body = msg.body as Partial<CancelOfferBody>;
    if (!body.offerId) return;
    const offer = this.offersById.get(body.offerId);
    if (!offer) return;
    // Only the seller may cancel.
    if (msg.sender === "world" || msg.sender !== offer.sellerId) return;
    this.offersById.delete(body.offerId);
  }

  private handleBuyRequest(msg: AgentMessage, ctx: SimContext): void {
    const body = msg.body as Partial<BuyRequestBody>;
    if (!body.offerId) return;
    const offer = this.offersById.get(body.offerId);
    if (!offer) return;
    if (msg.sender === "world") return;

    const forwarded: BuyRequestBody = {
      offerId: offer.offerId,
      buyerId: msg.sender,
      pricePerUnit: body.pricePerUnit ?? offer.pricePerUnit,
      quantity: body.quantity ?? offer.quantity,
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
    this.offersById.delete(body.offerId);
  }

  // ---- helpers -----------------------------------------------------------

  private findWall(): GameEntity | undefined {
    for (const e of this.world.query("marketWall", "inbox")) return e;
    return undefined;
  }

  private findFarmerById(id: number): GameEntity | undefined {
    for (const f of this.world.query("farmer", "inventory")) {
      if (f.id === id) return f;
    }
    return undefined;
  }

  private readDay(entity: GameEntity): number | undefined {
    const d = entity.beliefs?.data.currentDay;
    return typeof d === "number" ? d : undefined;
  }
}
