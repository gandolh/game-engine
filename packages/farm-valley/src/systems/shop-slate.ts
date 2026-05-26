import type { SimContext, System, MessageBus, World, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import { generateDailySlate } from "../agents/shop-slate";
import { ONT_SHOP } from "../protocols/shop";
import { ONT_SIMULATION, PERFORMATIVE } from "../protocols";
import type { DailySlateBody } from "../protocols/shop";

/**
 * ShopSlateSystem — generates a fresh daily offer slate for the shopkeeper.
 *
 * Detection strategy: same as WeatherSystem — scan the shopkeeper entity's
 * inbox for ONT_SIMULATION.DAY_START messages each tick, and react only when
 * a new (higher) day number arrives.
 */
export class ShopSlateSystem implements System {
  readonly name = "ShopSlateSystem";

  private lastDayProcessed = -1;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus: MessageBus,
    private readonly rng: Rng,
  ) {}

  run(ctx: SimContext): void {
    const shop = this.findShopkeeper();
    if (!shop || !shop.inbox) return;

    // Scan shopkeeper inbox for a DAY_START signal.
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

    // Generate the daily slate.
    const offers = generateDailySlate(this.rng);

    // Write onto the shopkeeper entity.
    shop.shopkeeper!.dailySlate = offers;

    // Broadcast DAILY_SLATE so the observer panel and farmer perception can read it.
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
