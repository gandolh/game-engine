import type { SimContext, System, MessageBus, World, Rng } from "@engine/core";
import type { GameEntity } from "../../components";
import { generateDailySlate } from "../../agents/shop-slate";
import { ONT_SHOP } from "../../protocols/shop";
import { ONT_SIMULATION, PERFORMATIVE } from "../../protocols";
import type { DailySlateBody } from "../../protocols/shop";

export class ShopSlateSystem implements System {
  readonly name = "ShopSlateSystem";

  private lastDayProcessed = -1;

  // Named fork instead of the raw top-level Rng: draws from a stable,
  // reorder-independent stream so adding/removing any system ahead of this one
  // in the schedule no longer shifts the daily slate. (⚠️ Moves the baseline
  // by design — the draw sequence differs from the raw-stream version.)
  private readonly rng: Rng;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus: MessageBus,
    rng: Rng,
  ) {
    this.rng = rng.fork("shop-slate");
  }

  run(ctx: SimContext): void {
    const shop = this.findShopkeeper();
    if (!shop || !shop.inbox) return;

    let newDay: number | null = null;
    for (const msg of shop.inbox.messages) {
      if (msg.ontology === ONT_SIMULATION.DAY_START) {
        const day = (msg.body as { day: number }).day;
        if (day > this.lastDayProcessed) {
          newDay = day;
        }
      }
    }

    if (newDay === null) return;
    this.lastDayProcessed = newDay;

    const offers = generateDailySlate(this.rng);
    shop.shopkeeper!.dailySlate = offers;

    const body: DailySlateBody = { offers };
    this.bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology: ONT_SHOP.DAILY_SLATE,
        sender: "world",
        recipient: "broadcast",
        body: body as unknown as Record<string, unknown>,
      },
      ctx.tick,
    );
  }

  private findShopkeeper(): GameEntity | undefined {
    for (const e of this.world.query("shopkeeper", "inbox")) return e;
    return undefined;
  }
}
