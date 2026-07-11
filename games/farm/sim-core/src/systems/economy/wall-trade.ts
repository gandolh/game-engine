import type { SimContext, System, MessageBus, World } from "@engine/core";
import type { GameEntity } from "../../components";
import { firstEntity } from "../entity-helpers";
import { ONT_MARKET, type BuyRequestBody } from "../../protocols/market";
import { PERFORMATIVE } from "../../protocols/performatives";
import type { MarketSystem } from "./market";
import type { TradeCompletedBody } from "../event-feed/types";

/**
 * Seller-side consumer of the market wall's forwarded BUY_REQUEST (brief 98).
 *
 * The wall (MarketSystem, ACT band) forwards a buyer's BUY_REQUEST to the
 * offer's seller; InboxDispatchSystem (DISPATCH band) drops it into the seller's
 * inbox on the next tick. This system is the thing that finally reads it: it
 * settles the trade out of the wall's escrow and emits TRADE_COMPLETED back to
 * the wall, which trust/event-feed snoop and which retires the offer.
 *
 * BAND: SNOOP — the only correct slot. It must run *after* DISPATCH (or the
 * message isn't in the inbox yet) and *before* PERCEIVE (which unconditionally
 * clears every farmer inbox). SNOOP is the band that exists for exactly that
 * "read farmer inboxes before Perceive wipes them" contract.
 */
export class WallTradeSystem implements System {
  readonly name = "WallTradeSystem";

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus: MessageBus,
    private readonly market: MarketSystem,
  ) {}

  run(ctx: SimContext): void {
    const wall = firstEntity(this.world, "marketWall", "inbox");
    const wallId = wall?.id;
    if (wallId === undefined) return;

    for (const farmer of this.world.query("farmer", "inbox", "inventory")) {
      if (farmer.id === undefined) continue;
      for (const msg of farmer.inbox.messages) {
        if (msg.ontology !== ONT_MARKET.BUY_REQUEST) continue;
        // Only the wall's forwarded request (sender "world") settles a sale.
        if (msg.sender !== "world") continue;
        const body = msg.body as Partial<BuyRequestBody>;
        if (!body.offerId || typeof body.buyerId !== "number") continue;

        const offer = this.market.getOffer(body.offerId);
        if (!offer || offer.sellerId !== farmer.id) continue;

        const settled = this.market.settleBuy(body.offerId, body.buyerId);
        if (!settled) continue;

        const completed: TradeCompletedBody = {
          offerId: settled.offerId,
          buyerId: settled.buyerId,
          sellerId: settled.sellerId,
          crop: settled.crop,
          quantity: settled.quantity,
          pricePerUnit: settled.pricePerUnit,
        };
        this.bus.send(
          {
            performative: PERFORMATIVE.INFORM,
            ontology: ONT_MARKET.TRADE_COMPLETED,
            sender: farmer.id,
            recipient: wallId,
            body: completed as unknown as Record<string, unknown>,
          },
          ctx.tick,
        );
      }
    }
  }
}
