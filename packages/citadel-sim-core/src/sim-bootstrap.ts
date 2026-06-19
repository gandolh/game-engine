import { Scheduler, World, CommandQueue, CommandSystem, OccupancyGrid, checkPlacement, rebuildWalkable, createRng } from "@engine/core";
import type { System, SimContext } from "@engine/core";
import type { CitadelCommand, BuildingSnapshot, VillagerSnapshot, RenderSnapshot } from "./snapshot/index";
import { DayClockSystem } from "./systems/day-clock";
import { generateTerrain, isWalkable, TerrainType, WORLD_WIDTH, WORLD_HEIGHT } from "./world/terrain";
import type { TerrainGrid } from "./world/terrain";
import type { BuildingEntity, BuildingRuntimeState, GoodType } from "./entities/building";
import { getBuildingDef, getProductionDef } from "./entities/building";
import type { VillagerEntity } from "./entities/villager";
import type { SimState, Stockpiles } from "./sim-state";
import { emptyStockpiles, pushEvent } from "./sim-state";
import { RoadConnectivitySystem } from "./systems/road-connectivity";
import { ProductionSystem } from "./systems/production";
import { VillagerSystem, villagerPos } from "./systems/villager-system";
import { ImmigrationSystem } from "./systems/immigration";
import { getSeason } from "./world/seasons";

export interface CitadelSimOptions {
  seed: number;
  ticksPerDay: number;
  maxDays: number;
  /** Starting day offset (default 0). Used to begin the sim partway through the year. */
  startDay?: number;
}

const DAYS_PER_YEAR = 16;

/** Mutable sim state exposed to callers (worker + headless + tests). */
export interface CitadelSimResult {
  scheduler: Scheduler;
  dayClock: DayClockSystem;
  terrain: TerrainGrid;
  world: World<BuildingEntity>;
  villagerWorld: World<VillagerEntity>;
  commands: CommandQueue<CitadelCommand>;
  /** Snapshot of placed buildings — updated synchronously by command handlers. */
  getBuildings(): readonly BuildingSnapshot[];
  /** Full render snapshot for the current tick. */
  getSnapshot(tick?: number): RenderSnapshot;
  /** Global goods pool (live reference). */
  stockpiles: Stockpiles;
  population: number;
  gameOver: boolean;
  /** Road grid — Uint8Array (1=road, 0=not road). */
  roadGrid: Uint8Array;
  /** Current walkable grid — Uint8Array (1=walkable, 0=blocked), rebuilt on change. */
  walkable: Uint8Array;
}

/**
 * Bootstrap the Citadel sim.
 * Worker-agnostic: safe to call on the main thread (headless) or inside a
 * Web Worker. No Worker-specific APIs are referenced here.
 */
export function bootstrapSim(opts: CitadelSimOptions): CitadelSimResult {
  const { seed, ticksPerDay } = opts;

  const terrain = generateTerrain(seed);

  const buildingWorld = new World<BuildingEntity>();
  const villagerWorld = new World<VillagerEntity>();

  const occupancy = new OccupancyGrid(WORLD_WIDTH, WORLD_HEIGHT);

  const buildable = (tx: number, ty: number): boolean => isWalkable(terrain, tx, ty);

  let walkable = rebuildWalkable(WORLD_WIDTH, WORLD_HEIGHT, occupancy, buildable);

  // ---------------------------------------------------------------------------
  // Shared sim state
  // ---------------------------------------------------------------------------
  const state: SimState = {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    ticksPerDay,
    daysPerYear: DAYS_PER_YEAR,
    buildingWorld,
    villagerWorld,
    occupancy,
    roadGrid: new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT),
    buildingTiles: new Set<number>(),
    buildingState: new Map<number, BuildingRuntimeState>(),
    stockpiles: emptyStockpiles(),
    nextVillagerId: 1,
    connectivityDirty: true,
    population: 0,
    popCap: 0,
    hungerDays: 0,
    gameOver: false,
    foodSurplus: 0,
    lastDayBreadStart: 0,
    events: [],
    rng: createRng(seed).fork("citadel-sim"),
    day: 0,
  };

  /** Mark a building's footprint tiles in the buildingTiles set. */
  function addBuildingTiles(x: number, y: number, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx >= 0 && ty >= 0 && tx < WORLD_WIDTH && ty < WORLD_HEIGHT) {
          state.buildingTiles.add(ty * WORLD_WIDTH + tx);
        }
      }
    }
  }
  function removeBuildingTiles(x: number, y: number, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx >= 0 && ty >= 0 && tx < WORLD_WIDTH && ty < WORLD_HEIGHT) {
          state.buildingTiles.delete(ty * WORLD_WIDTH + tx);
        }
      }
    }
  }

  function freshRuntime(): BuildingRuntimeState {
    return { outputBuffer: 0, inputBuffer: 0, workerCount: 0, connected: false, productionTick: 0 };
  }

  // ---------------------------------------------------------------------------
  // Command queue + system
  // ---------------------------------------------------------------------------
  const commands = new CommandQueue<CitadelCommand>();
  const commandSystem = new CommandSystem<CitadelCommand>(commands);

  function placeOne(buildingType: string, x: number, y: number): boolean {
    const def = getBuildingDef(buildingType);
    if (def === undefined) return false;
    const prod = getProductionDef(buildingType);
    const fp = { x, y, w: def.w, h: def.h };

    // Terrain requirement (e.g. woodcutter on forest): at least one footprint
    // tile must match the required terrain.
    const result = checkPlacement(fp, occupancy, buildable);
    if (!result.valid) return false;

    if (prod?.terrainReq === "forest") {
      let onForest = false;
      for (let dy = 0; dy < def.h && !onForest; dy++) {
        for (let dx = 0; dx < def.w; dx++) {
          const t = terrain.cells[(y + dy) * WORLD_WIDTH + (x + dx)];
          if (t === TerrainType.Forest) { onForest = true; break; }
        }
      }
      if (!onForest) return false;
    }

    occupancy.apply(fp);
    walkable = rebuildWalkable(WORLD_WIDTH, WORLD_HEIGHT, occupancy, buildable);
    addBuildingTiles(x, y, def.w, def.h);

    const entity = buildingWorld.spawn({
      building: { type: buildingType, x, y, w: def.w, h: def.h },
    });
    if (entity.id !== undefined) {
      state.buildingState.set(entity.id, freshRuntime());
    }
    if (prod?.isRoad === true) {
      state.roadGrid[y * WORLD_WIDTH + x] = 1;
    }
    if (prod?.isHousing === true && prod.housingCapacity !== undefined) {
      state.popCap += prod.housingCapacity;
    }
    state.connectivityDirty = true;
    return true;
  }

  commandSystem.register("placeBuilding", (cmd) => {
    placeOne(cmd.payload.buildingType, cmd.payload.x, cmd.payload.y);
  });

  commandSystem.register("placeRoad", (cmd) => {
    for (const tile of cmd.payload.tiles) {
      placeOne("road", tile.x, tile.y);
    }
  });

  commandSystem.register("demolish", (cmd) => {
    const { x, y } = cmd.payload;
    for (const entity of buildingWorld.query("building")) {
      const b = entity.building;
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
        occupancy.remove({ x: b.x, y: b.y, w: b.w, h: b.h });
        walkable = rebuildWalkable(WORLD_WIDTH, WORLD_HEIGHT, occupancy, buildable);
        removeBuildingTiles(b.x, b.y, b.w, b.h);
        const prod = getProductionDef(b.type);
        if (prod?.isRoad === true) {
          state.roadGrid[b.y * WORLD_WIDTH + b.x] = 0;
        }
        if (prod?.isHousing === true && prod.housingCapacity !== undefined) {
          state.popCap = Math.max(0, state.popCap - prod.housingCapacity);
        }
        if (entity.id !== undefined) state.buildingState.delete(entity.id);
        buildingWorld.despawn(entity);
        state.connectivityDirty = true;
        break;
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Scheduler + systems
  // ---------------------------------------------------------------------------
  const scheduler = new Scheduler();
  const dayClock = new DayClockSystem(ticksPerDay);
  // Apply starting day offset (used for scenarios that begin mid-year).
  if (opts.startDay !== undefined && opts.startDay > 0) {
    dayClock.day = opts.startDay;
    state.day = opts.startDay;
  }

  // Mirror the day clock into shared state so economy systems can read it.
  const daySync: System = {
    name: "DaySyncSystem",
    run(_ctx: SimContext): void {
      state.day = dayClock.day;
    },
  };

  const roadConnSystem = new RoadConnectivitySystem(state);
  const productionSystem = new ProductionSystem(state);
  const villagerSystem = new VillagerSystem(state);
  const immigrationSystem = new ImmigrationSystem(state);

  scheduler.stage("commands").add(commandSystem);
  scheduler.stage("clock").add(dayClock);
  scheduler.stage("clock").add(daySync);
  scheduler.stage("connectivity").add(roadConnSystem);
  scheduler.stage("economy").add(productionSystem);
  scheduler.stage("villagers").add(villagerSystem);
  scheduler.stage("population").add(immigrationSystem);

  // ---------------------------------------------------------------------------
  // Snapshot helpers
  // ---------------------------------------------------------------------------
  function getBuildings(): readonly BuildingSnapshot[] {
    const result: BuildingSnapshot[] = [];
    for (const entity of buildingWorld.query("building")) {
      const b = entity.building;
      const rs = entity.id !== undefined ? state.buildingState.get(entity.id) : undefined;
      result.push({
        type: b.type,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        connected: rs?.connected ?? false,
        outputBuffer: rs?.outputBuffer ?? 0,
        workerCount: rs?.workerCount ?? 0,
      });
    }
    return result;
  }

  function getVillagers(): readonly VillagerSnapshot[] {
    const result: VillagerSnapshot[] = [];
    for (const entity of villagerWorld.query("villager")) {
      const v = entity.villager;
      const pos = villagerPos(v);
      result.push({ id: v.id, x: pos.x, y: pos.y, fsm: v.fsm, carryGood: v.carryGood });
    }
    return result;
  }

  function getSnapshot(tick = 0): RenderSnapshot {
    const stock: Record<string, number> = {};
    for (const k of Object.keys(state.stockpiles) as GoodType[]) stock[k] = state.stockpiles[k];
    return {
      tick,
      day: dayClock.day,
      season: getSeason(dayClock.day, DAYS_PER_YEAR),
      speed: 1,
      buildings: getBuildings(),
      villagers: getVillagers(),
      stockpiles: stock,
      population: state.population,
      popCap: state.popCap,
      foodSurplus: state.foodSurplus,
      gameOver: state.gameOver,
      recentEvents: [...state.events],
    };
  }

  void pushEvent; // exported via state mutators in systems

  return {
    scheduler,
    dayClock,
    terrain,
    world: buildingWorld,
    villagerWorld,
    commands,
    getBuildings,
    getSnapshot,
    get stockpiles() {
      return state.stockpiles;
    },
    get population() {
      return state.population;
    },
    get gameOver() {
      return state.gameOver;
    },
    get roadGrid() {
      return state.roadGrid;
    },
    get walkable() {
      return walkable;
    },
  };
}
