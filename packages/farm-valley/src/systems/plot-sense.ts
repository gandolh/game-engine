import type { SimContext, System, World } from "@engine/core";
import type { GameEntity, PlotState } from "../components";

/**
 * brief 29 — surface each farmer's owned-plot watering needs into beliefs so
 * the (plot-blind) deliberate* fns can queue `water` actions. Mirrors how
 * market offers are surfaced for trade decisions: deliberation reads beliefs,
 * ActSystem resolves against the real plots.
 *
 * Writes `beliefs.data.plotWater = { planted, due, maxDrySoFar }`:
 *   - planted: number of the farmer's planted plots
 *   - due: how many are not yet watered today (need a `water` action)
 *   - maxDrySoFar: the highest `daysSinceWater` among the farmer's plots
 *     (drives personality-tuned urgency)
 *
 * Runs before DeliberateSystem (after HarvestSystem). Pure read of plot state.
 */
export interface PlotWaterSense {
  planted: number;
  due: number;
  maxDrySoFar: number;
}

export class PlotSenseSystem implements System {
  readonly name = "PlotSenseSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    // Group planted plots by owner once.
    const byOwner = new Map<number, Array<Extract<PlotState, { kind: "planted" }>>>();
    for (const p of this.world.query("plot")) {
      const s = p.plot.state;
      if (s.kind !== "planted") continue;
      const arr = byOwner.get(p.plot.ownerId) ?? [];
      arr.push(s);
      byOwner.set(p.plot.ownerId, arr);
    }

    for (const farmer of this.world.query("beliefs", "farmer")) {
      if (farmer.id === undefined) continue;
      const plots = byOwner.get(farmer.id) ?? [];
      let due = 0;
      let maxDry = 0;
      for (const s of plots) {
        if (s.wateredToday !== true) due += 1;
        const dry = s.daysSinceWater ?? 0;
        if (dry > maxDry) maxDry = dry;
      }
      const sense: PlotWaterSense = { planted: plots.length, due, maxDrySoFar: maxDry };
      farmer.beliefs.data.plotWater = sense;
      farmer.beliefs.revision += 1;
    }
  }
}
