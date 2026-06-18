import { Scheduler, World, CommandQueue, CommandSystem, OccupancyGrid, checkPlacement, rebuildWalkable } from "@engine/core";
import type { CitadelCommand, BuildingSnapshot } from "./snapshot/index";
import { DayClockSystem } from "./systems/day-clock";
import { generateTerrain, isWalkable, WORLD_WIDTH, WORLD_HEIGHT } from "./world/terrain";
import type { TerrainGrid } from "./world/terrain";
import type { BuildingEntity } from "./entities/building";
import { getBuildingDef } from "./entities/building";

export interface CitadelSimOptions {
  seed: number;
  ticksPerDay: number;
  maxDays: number;
}

/** Mutable sim state exposed to callers (worker + headless + tests). */
export interface CitadelSimResult {
  scheduler: Scheduler;
  dayClock: DayClockSystem;
  terrain: TerrainGrid;
  world: World<BuildingEntity>;
  commands: CommandQueue<CitadelCommand>;
  /** Snapshot of placed buildings — updated synchronously by command handlers. */
  getBuildings(): readonly BuildingSnapshot[];
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

  // Generate deterministic terrain
  const terrain = generateTerrain(seed);

  // ECS world — typed to BuildingEntity (Phase 1 only has buildings)
  const world = new World<BuildingEntity>();

  // Occupancy grid — tracks which tiles are occupied by building footprints
  const occupancy = new OccupancyGrid(WORLD_WIDTH, WORLD_HEIGHT);

  // Terrain buildability predicate (Phase 1: water + rough = unbuildable)
  const buildable = (tx: number, ty: number): boolean =>
    isWalkable(terrain, tx, ty);

  // Initial walkable grid
  let walkable = rebuildWalkable(WORLD_WIDTH, WORLD_HEIGHT, occupancy, buildable);

  // ---------------------------------------------------------------------------
  // Command queue + system
  // ---------------------------------------------------------------------------
  const commands = new CommandQueue<CitadelCommand>();
  const commandSystem = new CommandSystem<CitadelCommand>(commands);

  // placeBuilding handler
  commandSystem.register("placeBuilding", (cmd) => {
    const { buildingType, x, y } = cmd.payload;
    const def = getBuildingDef(buildingType);
    if (def === undefined) return; // unknown type — ignore

    const fp = { x, y, w: def.w, h: def.h };
    const result = checkPlacement(fp, occupancy, buildable);
    if (!result.valid) return; // invalid placement — ignore silently

    occupancy.apply(fp);
    walkable = rebuildWalkable(WORLD_WIDTH, WORLD_HEIGHT, occupancy, buildable);

    world.spawn({
      building: { type: buildingType, x, y, w: def.w, h: def.h },
    });
  });

  // demolish handler — find the building whose footprint covers (x, y)
  commandSystem.register("demolish", (cmd) => {
    const { x, y } = cmd.payload;
    const bq = world.query("building");
    for (const entity of bq) {
      const b = entity.building;
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
        occupancy.remove({ x: b.x, y: b.y, w: b.w, h: b.h });
        walkable = rebuildWalkable(WORLD_WIDTH, WORLD_HEIGHT, occupancy, buildable);
        world.despawn(entity);
        break; // remove the first matching building only
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Scheduler
  // ---------------------------------------------------------------------------
  const scheduler = new Scheduler();
  const dayClock = new DayClockSystem(ticksPerDay);

  // CommandSystem runs FIRST — before any gameplay systems mutate the world
  scheduler.stage("commands").add(commandSystem);
  scheduler.stage("clock").add(dayClock);

  // ---------------------------------------------------------------------------
  // getBuildings helper — snapshot the ECS query into a plain array
  // ---------------------------------------------------------------------------
  function getBuildings(): readonly BuildingSnapshot[] {
    const result: BuildingSnapshot[] = [];
    for (const entity of world.query("building")) {
      const b = entity.building;
      result.push({ type: b.type, x: b.x, y: b.y, w: b.w, h: b.h });
    }
    return result;
  }

  return {
    scheduler,
    dayClock,
    terrain,
    world,
    commands,
    getBuildings,
    get walkable() {
      return walkable;
    },
  };
}
