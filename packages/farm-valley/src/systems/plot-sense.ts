import type { SimContext, System, World } from "@engine/core";
import type { GameEntity, PlotState, TileFeature, FarmDecoration, AnimalKind } from "../components";

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

    // brief 42 — collect pen state per owner.
    const pensByOwner = new Map<number, { hasCoop: boolean; hasBarn: boolean; coopFed: boolean; barnFed: boolean; animalCounts: Partial<Record<AnimalKind, number>> }>();
    for (const p of this.world.query("pen")) {
      const oid = p.pen.ownerId;
      const entry = pensByOwner.get(oid) ?? { hasCoop: false, hasBarn: false, coopFed: false, barnFed: false, animalCounts: {} };
      if (p.pen.kind === "coop") { entry.hasCoop = true; entry.coopFed = p.pen.fedToday; }
      if (p.pen.kind === "barn") { entry.hasBarn = true; entry.barnFed = p.pen.fedToday; }
      entry.animalCounts[p.pen.animal] = (entry.animalCounts[p.pen.animal] ?? 0) + p.pen.count;
      pensByOwner.set(oid, entry);
    }

    // brief 42 — collect orchard tree state per owner.
    const orchardsByOwner = new Map<number, { count: number; readyTrees: Array<{ tileX: number; tileY: number; kind: string }> }>();
    for (const t of this.world.query("orchardTree")) {
      const oid = t.orchardTree.ownerId;
      const entry = orchardsByOwner.get(oid) ?? { count: 0, readyTrees: [] };
      entry.count += 1;
      if (t.orchardTree.mature && t.orchardTree.fruitReady > 0) {
        entry.readyTrees.push({ tileX: t.orchardTree.tileX, tileY: t.orchardTree.tileY, kind: t.orchardTree.kind });
      }
      orchardsByOwner.set(oid, entry);
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

      // brief 42 — surface pen/orchard state into beliefs for agent deliberation.
      const penState = pensByOwner.get(farmer.id);
      farmer.beliefs.data["hasPen_coop"] = penState?.hasCoop ?? false;
      farmer.beliefs.data["hasPen_barn"] = penState?.hasBarn ?? false;
      farmer.beliefs.data["coopFedToday"] = penState?.coopFed ?? false;
      farmer.beliefs.data["barnFedToday"] = penState?.barnFed ?? false;
      farmer.beliefs.data["penCount_chicken"] = penState?.animalCounts["chicken"] ?? 0;
      farmer.beliefs.data["penCount_cow"]     = penState?.animalCounts["cow"] ?? 0;
      farmer.beliefs.data["penCount_sheep"]   = penState?.animalCounts["sheep"] ?? 0;

      const orchState = orchardsByOwner.get(farmer.id);
      farmer.beliefs.data["orchardCount"] = orchState?.count ?? 0;
      farmer.beliefs.data["orchardFruitReady"] = orchState?.readyTrees ?? [];

      farmer.beliefs.revision += 1;
    }
  }
}
