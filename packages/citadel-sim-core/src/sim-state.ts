/**
 * Shared mutable sim state for Citadel Phase 2.
 *
 * The SimContext from @engine/core only carries `tick`, so cross-system state
 * (stockpiles, road grid, building runtime state, population) lives here. The
 * bootstrap constructs one SimState and hands a reference to every system;
 * systems read & mutate it in place. Everything in here is deterministic —
 * no wall-clock, no Math.random.
 */
import type { World } from "@engine/core";
import { OccupancyGrid } from "@engine/core";
import type { GoodType, BuildingRuntimeState, BuildingEntity } from "./entities/building";
import type { VillagerEntity } from "./entities/villager";
import type { Rng } from "@engine/core";

export type Stockpiles = Record<GoodType, number>;

export function emptyStockpiles(): Stockpiles {
  return { grain: 0, flour: 0, bread: 0, wood: 0 };
}

export interface SimState {
  readonly width: number;
  readonly height: number;
  readonly ticksPerDay: number;
  readonly daysPerYear: number;

  /** ECS worlds (separate for buildings vs villagers). */
  readonly buildingWorld: World<BuildingEntity>;
  readonly villagerWorld: World<VillagerEntity>;

  /** Footprint occupancy (buildings + roads). */
  readonly occupancy: OccupancyGrid;

  /** Road grid: 1 = road tile, 0 = not road. Length width*height. */
  readonly roadGrid: Uint8Array;

  /** Set of tile indices (ty*width+tx) covered by building footprints. */
  readonly buildingTiles: Set<number>;

  /** Per-building runtime economy state, keyed by ECS entity id. */
  readonly buildingState: Map<number, BuildingRuntimeState>;

  /** Global goods pool. */
  readonly stockpiles: Stockpiles;

  /** Monotonic id allocator for villagers. */
  nextVillagerId: number;

  /** Connectivity dirty flag — set when buildings/roads change. */
  connectivityDirty: boolean;

  /** Population bookkeeping. */
  population: number;
  popCap: number;
  hungerDays: number;
  gameOver: boolean;

  /** Food surplus (bread produced minus consumed) over the last day. */
  foodSurplus: number;

  /** Per-day bread consumption snapshot (for surplus reporting). */
  lastDayBreadStart: number;

  /** Event ring buffer (max 20 entries). */
  readonly events: string[];

  /** Seeded RNG root (forked per-system by label). */
  readonly rng: Rng;

  /** Current day, mirrored from the day clock for systems that need it. */
  day: number;
}

const MAX_EVENTS = 20;

export function pushEvent(state: SimState, msg: string): void {
  state.events.push(msg);
  while (state.events.length > MAX_EVENTS) state.events.shift();
}

/** Walkability predicate for villagers: road tiles OR building footprint tiles. */
export function villagerWalkable(state: SimState, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) return false;
  const idx = ty * state.width + tx;
  return state.roadGrid[idx] === 1 || state.buildingTiles.has(idx);
}
