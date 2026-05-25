import type { SimContext, System, World } from "@engine/core";
import type { GameEntity, CropKind, PlotState } from "../components";

const SEED_COST: Record<CropKind, number> = { radish: 5, wheat: 10, pumpkin: 20 };
const SELL_PRICE: Record<CropKind, number> = { radish: 8, wheat: 14, pumpkin: 35 };
const GROWTH_DAYS: Record<CropKind, number> = { radish: 2, wheat: 4, pumpkin: 7 };

export class ActSystem implements System {
  readonly name = "ActSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    const farmers = this.world.query("fsm", "intentions", "inventory");
    const plotsByOwner = new Map<number, GameEntity[]>();
    for (const plot of this.world.query("plot")) {
      const arr = plotsByOwner.get(plot.plot.ownerId) ?? [];
      arr.push(plot);
      plotsByOwner.set(plot.plot.ownerId, arr);
    }

    for (const farmer of farmers) {
      if (farmer.fsm.current !== "ACT") continue;
      const intentions = farmer.intentions.queue;
      const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
      const ownedPlots = farmer.id !== undefined ? plotsByOwner.get(farmer.id) ?? [] : [];

      for (const intent of intentions) {
        switch (intent.kind) {
          case "buy-seed": {
            const crop = intent.data.crop as CropKind;
            const qty = (intent.data.quantity as number) ?? 1;
            const cost = SEED_COST[crop] * qty;
            if (farmer.inventory.gold >= cost) {
              farmer.inventory.gold -= cost;
              farmer.inventory.seeds[crop] += qty;
            }
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
        }
      }

      intentions.length = 0;
      farmer.fsm.current = "FINISH_DAY";
    }
  }
}
