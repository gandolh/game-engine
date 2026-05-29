import type { SimContext, System, World, MessageBus } from "@engine/core";
import type { GameEntity, CropKind, PlotState } from "../components";
import {
  PERFORMATIVE,
  ONT_MARKET,
  ONT_CNP,
  type PostOfferBody,
  type ReadOffersBody,
  type BuyRequestBody,
  type CnpTaskBody,
} from "../protocols";
import { ONT_SHOP, type ShopSellBody } from "../protocols/shop";
const SELL_PRICE: Record<CropKind, number> = { radish: 8, wheat: 14, pumpkin: 35 };
const GROWTH_DAYS: Record<CropKind, number> = { radish: 2, wheat: 4, pumpkin: 7 };

export class ActSystem implements System {
  readonly name = "ActSystem";

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus?: MessageBus,
  ) {}

  run(ctx: SimContext): void {
    const farmers = this.world.query("fsm", "intentions", "inventory");
    const plotsByOwner = new Map<number, GameEntity[]>();
    for (const plot of this.world.query("plot")) {
      const arr = plotsByOwner.get(plot.plot.ownerId) ?? [];
      arr.push(plot);
      plotsByOwner.set(plot.plot.ownerId, arr);
    }

    let marketWallId: number | undefined;
    for (const w of this.world.query("marketWall")) {
      marketWallId = w.id;
      break;
    }

    let shopkeeperId: number | undefined;
    for (const s of this.world.query("shopkeeper")) {
      shopkeeperId = s.id;
      break;
    }

    for (const farmer of farmers) {
      if (farmer.fsm.current !== "ACT") continue;
      const intentions = farmer.intentions.queue;
      const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
      const ownedPlots = farmer.id !== undefined ? plotsByOwner.get(farmer.id) ?? [] : [];

      for (const intent of intentions) {
        switch (intent.kind) {
          case "buy-seed": {
            // Seed purchases now go through the shopkeeper's bus channel
            // (ONT_SHOP.SELL = shop sells a seed to the farmer), matching how
            // SELL/POST/READ already work. ShopkeeperSystem.handleSell consumes
            // the daily slate, checks gold, credits seeds, and replies CONFIRM.
            // Because ActSystem runs before ShopkeeperSystem and the message is
            // dispatched by InboxDispatchSystem, the seed lands ~1 tick later
            // rather than synchronously — an accepted behavior change (the
            // former direct slate mutation duplicated handleSell). See
            // corpus/wiki/open-questions.md.
            if (!this.bus || shopkeeperId === undefined || farmer.id === undefined) break;
            const body: ShopSellBody = {
              item: "seed",
              crop: intent.data.crop as CropKind,
              quantity: (intent.data.quantity as number) ?? 1,
            };
            this.bus.send(
              {
                performative: PERFORMATIVE.REQUEST,
                ontology: ONT_SHOP.SELL,
                sender: farmer.id,
                recipient: shopkeeperId,
                body: body as unknown as Record<string, unknown>,
              },
              ctx.tick,
            );
            break;
          }
          case "plant": {
            const crop = intent.data.crop as CropKind;
            const free = ownedPlots.find((p) => p.plot!.state.kind === "empty");
            if (free && farmer.inventory.seeds[crop] > 0) {
              farmer.inventory.seeds[crop] -= 1;
              free.plot!.state = {
                kind: "planted",
                crop,
                daysGrowing: 0,
                readyAtDay: day + GROWTH_DAYS[crop],
                weatherSum: 0,
              } satisfies PlotState;
            }
            break;
          }
          case "sell-shopkeeper": {
            const crop = intent.data.crop as CropKind;
            const qty = (intent.data.quantity as number) ?? 0;
            const available = Math.min(qty, farmer.inventory.crops[crop]);
            if (available > 0) {
              farmer.inventory.crops[crop] -= available;
              farmer.inventory.gold += SELL_PRICE[crop] * available;
            }
            break;
          }
          case "post-offer": {
            if (!this.bus || marketWallId === undefined || farmer.id === undefined) break;
            const body: PostOfferBody = {
              offer: {
                sellerId: farmer.id,
                crop: intent.data.crop as CropKind,
                quantity: intent.data.quantity as number,
                pricePerUnit: intent.data.pricePerUnit as number,
              },
            };
            this.bus.send(
              {
                performative: PERFORMATIVE.INFORM,
                ontology: ONT_MARKET.POST_OFFER,
                sender: farmer.id,
                recipient: marketWallId,
                body: body as unknown as Record<string, unknown>,
              },
              ctx.tick,
            );
            break;
          }
          case "read-offers": {
            if (!this.bus || marketWallId === undefined || farmer.id === undefined) break;
            const filter = intent.data.filter as ReadOffersBody["filter"] | undefined;
            const body: ReadOffersBody = filter === undefined ? {} : { filter };
            this.bus.send(
              {
                performative: PERFORMATIVE.REQUEST,
                ontology: ONT_MARKET.READ_OFFERS,
                sender: farmer.id,
                recipient: marketWallId,
                body: body as unknown as Record<string, unknown>,
              },
              ctx.tick,
            );
            break;
          }
          case "buy-from-wall": {
            if (!this.bus || marketWallId === undefined || farmer.id === undefined) break;
            const body: BuyRequestBody = {
              offerId: intent.data.offerId as string,
              buyerId: farmer.id,
              pricePerUnit: intent.data.pricePerUnit as number,
              quantity: (intent.data.quantity as number) ?? 1,
            };
            this.bus.send(
              {
                performative: PERFORMATIVE.PROPOSE,
                ontology: ONT_MARKET.BUY_REQUEST,
                sender: farmer.id,
                recipient: marketWallId,
                body: body as unknown as Record<string, unknown>,
              },
              ctx.tick,
            );
            break;
          }
          case "cnp-initiate": {
            if (!this.bus || farmer.id === undefined) break;
            const body: CnpTaskBody = {
              taskId: `${farmer.id}-${ctx.tick}`,
              initiatorId: farmer.id,
              buyCrop: intent.data.crop as CropKind,
              quantity: intent.data.quantity as number,
              maxPricePerUnit: intent.data.maxPricePerUnit as number,
              deadlineTick: ctx.tick + ((intent.data.deadlineTicks as number) ?? 2),
            };
            this.bus.send(
              {
                performative: PERFORMATIVE.CFP,
                ontology: ONT_CNP.TASK,
                sender: farmer.id,
                recipient: "broadcast",
                body: body as unknown as Record<string, unknown>,
              },
              ctx.tick,
            );
            break;
          }
        }
      }

      intentions.length = 0;
      farmer.fsm.current = "FINISH_DAY";
    }
  }
}
