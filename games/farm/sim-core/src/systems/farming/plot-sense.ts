import type { SimContext, System, World } from "@engine/core";
import type { GameEntity, PlotState, TileFeature, FarmDecoration, AnimalKind } from "../../components";

export interface PlotWaterSense {
  planted: number;
  due: number;
  maxDrySoFar: number;

  duePlots: Array<{ tileX: number; tileY: number }>;

  emptyPlots: Array<{ tileX: number; tileY: number }>;

  fountainTile?: { x: number; y: number };
}

export class PlotSenseSystem implements System {
  readonly name = "PlotSenseSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    const byOwnerPlanted = new Map<number, Array<{ tileX: number; tileY: number; state: Extract<PlotState, { kind: "planted" }> }>>();
    const byOwnerEmpty   = new Map<number, Array<{ tileX: number; tileY: number }>>();

    const byOwnerGreenhouseEmpty = new Map<number, Array<{ tileX: number; tileY: number }>>();
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
        if (p.plot.greenhouse === true) {
          const gArr = byOwnerGreenhouseEmpty.get(p.plot.ownerId) ?? [];
          gArr.push({ tileX: p.plot.tileX, tileY: p.plot.tileY });
          byOwnerGreenhouseEmpty.set(p.plot.ownerId, gArr);
        }
      }
    }

    const fountainTilesByRegion = new Map<string, { x: number; y: number }>();
    for (const f of this.world.query("fountain")) {
      if (!f.transform) continue;
      fountainTilesByRegion.set(f.fountain.regionId, {
        x: Math.round(f.transform.x),
        y: Math.round(f.transform.y),
      });
    }

    const featuresByOwner = new Map<number, TileFeature[]>();
    for (const f of this.world.query("tileFeature")) {
      const arr = featuresByOwner.get(f.tileFeature.ownerId) ?? [];
      arr.push(f.tileFeature);
      featuresByOwner.set(f.tileFeature.ownerId, arr);
    }

    const decorationsAll: FarmDecoration[] = [];
    for (const e of this.world.query("farmDecoration")) {
      decorationsAll.push(e.farmDecoration);
    }

    const pensByOwner = new Map<number, { hasCoop: boolean; hasBarn: boolean; coopFed: boolean; barnFed: boolean; animalCounts: Partial<Record<AnimalKind, number>> }>();
    for (const p of this.world.query("pen")) {
      const oid = p.pen.ownerId;
      const entry = pensByOwner.get(oid) ?? { hasCoop: false, hasBarn: false, coopFed: false, barnFed: false, animalCounts: {} };
      if (p.pen.kind === "coop") { entry.hasCoop = true; entry.coopFed = p.pen.fedToday; }
      if (p.pen.kind === "barn") { entry.hasBarn = true; entry.barnFed = p.pen.fedToday; }
      entry.animalCounts[p.pen.animal] = (entry.animalCounts[p.pen.animal] ?? 0) + p.pen.count;
      pensByOwner.set(oid, entry);
    }

    const greenhouseOwners = new Set<number>();
    for (const g of this.world.query("greenhouse")) {
      greenhouseOwners.add(g.greenhouse.ownerId);
    }

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

      const emptyTiles = (byOwnerEmpty.get(farmer.id) ?? [])
        .slice()
        .sort((a, b) => a.tileY !== b.tileY ? a.tileY - b.tileY : a.tileX - b.tileX);

      const homeRegion = farmer.farmer.homeRegion;
      const fountainTile = homeRegion ? fountainTilesByRegion.get(homeRegion) : undefined;

      const sense: PlotWaterSense = fountainTile !== undefined
        ? { planted: plantedPlots.length, due, maxDrySoFar: maxDry, duePlots: dueTiles, emptyPlots: emptyTiles, fountainTile }
        : { planted: plantedPlots.length, due, maxDrySoFar: maxDry, duePlots: dueTiles, emptyPlots: emptyTiles };
      farmer.beliefs.data.plotWater = sense;

      const tiles = allTilesByOwner.get(farmer.id) ?? [];
      if (homeRegion && fountainTile) {
        tiles.push(`${fountainTile.x},${fountainTile.y}`);
      }
      farmer.beliefs.data.occupiedTiles = tiles;

      farmer.beliefs.data.tileFeatures = featuresByOwner.get(farmer.id) ?? [];
      farmer.beliefs.data.decorations = decorationsAll;

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

      farmer.beliefs.data["hasGreenhouse"] = greenhouseOwners.has(farmer.id);
      farmer.beliefs.data["greenhouseEmptyPlots"] = (byOwnerGreenhouseEmpty.get(farmer.id) ?? [])
        .slice()
        .sort((a, b) => a.tileY !== b.tileY ? a.tileY - b.tileY : a.tileX - b.tileX);

      farmer.beliefs.revision += 1;
    }
  }
}
