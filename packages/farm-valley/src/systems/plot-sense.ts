import type { SimContext, System, World } from "@engine/core";
import type { GameEntity, PlotState, TileFeature, FarmDecoration } from "../components";

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
    // Also track all plot tiles per owner (for till collision avoidance).
    const allTilesByOwner = new Map<number, string[]>();
    for (const p of this.world.query("plot")) {
      const s = p.plot.state;
      const arr = allTilesByOwner.get(p.plot.ownerId) ?? [];
      arr.push(`${p.plot.tileX},${p.plot.tileY}`);
      allTilesByOwner.set(p.plot.ownerId, arr);
      if (s.kind !== "planted") continue;
      const pArr = byOwner.get(p.plot.ownerId) ?? [];
      pArr.push(s);
      byOwner.set(p.plot.ownerId, pArr);
    }

    // Collect fountain tiles per farm region.
    const fountainTilesByRegion = new Map<string, string>();
    for (const f of this.world.query("fountain")) {
      if (!f.transform) continue;
      const key = `${Math.round(f.transform.x)},${Math.round(f.transform.y)}`;
      fountainTilesByRegion.set(f.fountain.regionId, key);
    }

    // Collect tile features per owner.
    const featuresByOwner = new Map<number, TileFeature[]>();
    for (const f of this.world.query("tileFeature")) {
      const arr = featuresByOwner.get(f.tileFeature.ownerId) ?? [];
      arr.push(f.tileFeature);
      featuresByOwner.set(f.tileFeature.ownerId, arr);
    }

    // Collect all placed decorations (all farmers share this read).
    const decorationsAll: FarmDecoration[] = [];
    for (const e of this.world.query("farmDecoration")) {
      decorationsAll.push(e.farmDecoration);
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

      // Surface occupied tiles (plots + fountain) for till planning.
      const tiles = allTilesByOwner.get(farmer.id) ?? [];
      const homeRegion = farmer.farmer.homeRegion;
      if (homeRegion) {
        const ftKey = fountainTilesByRegion.get(homeRegion);
        if (ftKey) tiles.push(ftKey);
      }
      farmer.beliefs.data.occupiedTiles = tiles;

      // Surface tile features for gather planning.
      farmer.beliefs.data.tileFeatures = featuresByOwner.get(farmer.id) ?? [];

      // Surface all placed decorations (for boost-cap check in deliberation).
      farmer.beliefs.data.decorations = decorationsAll;

      farmer.beliefs.revision += 1;
    }
  }
}
