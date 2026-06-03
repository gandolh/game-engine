import type { SimContext, System, World } from "@engine/core";
import type { GameEntity, PlotState } from "../components";
import { DECORATION_RECIPE, MAX_DECORATION_BOOST } from "../components";

export class HarvestSystem implements System {
  readonly name = "HarvestSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    const plots = this.world.query("plot");
    const farmersById = new Map<number, GameEntity>();
    for (const f of this.world.query("inventory", "farmer")) {
      if (f.id !== undefined) farmersById.set(f.id, f);
    }

    // Build decoration yield boost per owner (sum of all placed decorations, capped).
    const boostByOwner = new Map<number, number>();
    for (const e of this.world.query("farmDecoration")) {
      const id = e.farmDecoration.ownerId;
      const add = DECORATION_RECIPE[e.farmDecoration.kind]?.yieldBoost ?? 0;
      boostByOwner.set(id, Math.min(MAX_DECORATION_BOOST, (boostByOwner.get(id) ?? 0) + add));
    }

    for (const plot of plots) {
      const state = plot.plot.state;
      if (state.kind !== "planted") continue;
      const currentDay = (this.findOwnerDay(plot.plot.ownerId, farmersById) ?? state.daysGrowing) | 0;
      if (currentDay < state.readyAtDay) continue;
      const owner = farmersById.get(plot.plot.ownerId);
      if (!owner || !owner.inventory) continue;

      // Base yield 2, boosted by decorations on this farm.
      const boost = boostByOwner.get(plot.plot.ownerId) ?? 0;
      const yield_ = Math.round(2 * (1 + boost));
      owner.inventory.crops[state.crop] += yield_;
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
