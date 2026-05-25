import type { SimContext, System, World } from "@engine/core";
import type { GameEntity, PlotState } from "../components";

export class HarvestSystem implements System {
  readonly name = "HarvestSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    const plots = this.world.query("plot");
    const farmersById = new Map<number, GameEntity>();
    for (const f of this.world.query("inventory", "farmer")) {
      if (f.id !== undefined) farmersById.set(f.id, f);
    }

    for (const plot of plots) {
      const state = plot.plot.state;
      if (state.kind !== "planted") continue;
      const currentDay = (this.findOwnerDay(plot.plot.ownerId, farmersById) ?? state.daysGrowing) | 0;
      if (currentDay < state.readyAtDay) continue;
      const owner = farmersById.get(plot.plot.ownerId);
      if (!owner || !owner.inventory) continue;
      owner.inventory.crops[state.crop] += 2;
      plot.plot.state = { kind: "empty" } satisfies PlotState;
    }
  }

  private findOwnerDay(
    ownerId: number,
    farmersById: Map<number, GameEntity>,
  ): number | undefined {
    const f = farmersById.get(ownerId);
    if (!f || !f.beliefs) return undefined;
    return f.beliefs.data.currentDay as number | undefined;
  }
}
