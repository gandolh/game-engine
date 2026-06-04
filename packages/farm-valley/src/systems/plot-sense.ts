import type { SimContext, System, World } from "@engine/core";
import type { GameEntity, PlotState, TileFeature, FarmDecoration } from "../components";

/**
 * brief 29 — surface each farmer's owned-plot watering needs into beliefs so
 * the (plot-blind) deliberate* fns can queue `water` actions. Mirrors how
 * market offers are surfaced for trade decisions: deliberation reads beliefs,
 * ActSystem resolves against the real plots.
 *
 * Writes `beliefs.data.plotWater = { planted, due, maxDrySoFar, duePlots, emptyPlots, fountainTile }`:
 *   - planted: number of the farmer's planted plots
 *   - due: how many are not yet watered today (need a `water` action)
 *   - maxDrySoFar: the highest `daysSinceWater` among the farmer's plots
 *     (drives personality-tuned urgency)
 *   - duePlots: sorted array of {tileX,tileY} for plots needing water today
 *   - emptyPlots: sorted array of {tileX,tileY} for plots in "empty" state
 *   - fountainTile: the tile coords of the farmer's home fountain (if known)
 *
 * Runs before DeliberateSystem (after HarvestSystem). Pure read of plot state.
 */
export interface PlotWaterSense {
  planted: number;
  due: number;
  maxDrySoFar: number;
  /** Sorted (tileY, tileX) list of plots that need watering today. */
  duePlots: Array<{ tileX: number; tileY: number }>;
  /** Sorted (tileY, tileX) list of empty plots ready to plant. */
  emptyPlots: Array<{ tileX: number; tileY: number }>;
  /** Tile coords of the farmer's home fountain, if found. */
  fountainTile?: { x: number; y: number };
}

export class PlotSenseSystem implements System {
  readonly name = "PlotSenseSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    // Group plots by owner (all states).
    const byOwnerPlanted = new Map<number, Array<{ tileX: number; tileY: number; state: Extract<PlotState, { kind: "planted" }> }>>();
    const byOwnerEmpty   = new Map<number, Array<{ tileX: number; tileY: number }>>();
    // Also track all plot tiles per owner (for till collision avoidance).
    const allTilesByOwner = new Map<number, string[]>();
    for (const p of this.world.query("plot")) {
      const s = p.plot.state;
      const arr = allTilesByOwner.get(p.plot.ownerId) ?? [];
      arr.push(`${p.plot.tileX},${p.plot.tileY}`);
      allTilesByOwner.set(p.plot.ownerId, arr);
      if (s.kind === "planted") {
        const pArr = byOwnerPlanted.get(p.plot.ownerId) ?? [];
        pArr.push({ tileX: p.plot.tileX, tileY: p.plot.tileY, state: s });
        byOwnerPlanted.set(p.plot.ownerId, pArr);
      } else if (s.kind === "empty") {
        const eArr = byOwnerEmpty.get(p.plot.ownerId) ?? [];
        eArr.push({ tileX: p.plot.tileX, tileY: p.plot.tileY });
        byOwnerEmpty.set(p.plot.ownerId, eArr);
      }
    }

    // Collect fountain tiles per farm region.
    const fountainTilesByRegion = new Map<string, { x: number; y: number }>();
    for (const f of this.world.query("fountain")) {
      if (!f.transform) continue;
      fountainTilesByRegion.set(f.fountain.regionId, {
        x: Math.round(f.transform.x),
        y: Math.round(f.transform.y),
      });
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
      const plantedPlots = byOwnerPlanted.get(farmer.id) ?? [];

      // Compute due/maxDry and collect due plot tiles (sorted by tileY, tileX for determinism).
      let due = 0;
      let maxDry = 0;
      const dueTiles: Array<{ tileX: number; tileY: number }> = [];
      for (const p of plantedPlots) {
        if (p.state.wateredToday !== true) {
          due += 1;
          dueTiles.push({ tileX: p.tileX, tileY: p.tileY });
        }
        const dry = p.state.daysSinceWater ?? 0;
        if (dry > maxDry) maxDry = dry;
      }
      dueTiles.sort((a, b) => a.tileY !== b.tileY ? a.tileY - b.tileY : a.tileX - b.tileX);

      // Collect empty plot tiles (sorted by tileY, tileX) for plant deliberation.
      const emptyTiles = (byOwnerEmpty.get(farmer.id) ?? [])
        .slice()
        .sort((a, b) => a.tileY !== b.tileY ? a.tileY - b.tileY : a.tileX - b.tileX);

      const homeRegion = farmer.farmer.homeRegion;
      const fountainTile = homeRegion ? fountainTilesByRegion.get(homeRegion) : undefined;

      const sense: PlotWaterSense = fountainTile !== undefined
        ? { planted: plantedPlots.length, due, maxDrySoFar: maxDry, duePlots: dueTiles, emptyPlots: emptyTiles, fountainTile }
        : { planted: plantedPlots.length, due, maxDrySoFar: maxDry, duePlots: dueTiles, emptyPlots: emptyTiles };
      farmer.beliefs.data.plotWater = sense;

      // Surface occupied tiles (plots + fountain) for till planning.
      const tiles = allTilesByOwner.get(farmer.id) ?? [];
      if (homeRegion && fountainTile) {
        tiles.push(`${fountainTile.x},${fountainTile.y}`);
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
