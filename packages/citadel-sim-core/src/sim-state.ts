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

/** Phase 4.5: per-building fire hazard state. */
export interface BuildingFireState {
  burning: boolean;        // currently on fire
  burnTicksLeft: number;   // ticks until destroyed (0 if not burning)
  destroyed: boolean;      // has been burned down already
}

export interface BarterOffer {
  give: GoodType;
  giveQty: number;
  receive: GoodType;
  receiveQty: number;
}

export type Stockpiles = Record<GoodType, number>;

export function emptyStockpiles(): Stockpiles {
  return { grain: 0, flour: 0, bread: 0, wood: 0, stone: 0, planks: 0, tools: 0 };
}

/** Phase 4: an active raider group marching on the citadel. */
export interface RaiderState {
  id: number;
  x: number; // current tile X (float for sub-tile position)
  y: number; // current tile Y (float)
  tileX: number; // integer tile X
  tileY: number; // integer tile Y
  path: Array<{ x: number; y: number }>; // BFS path to keep
  pathStep: number; // current step in path
  strength: number; // raider group strength
  resolved: boolean; // whether this raid has been resolved
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

  // Phase 3: happiness + needs
  happiness: number;          // 0..100
  faithCoverage: number;      // 0..1 fraction of houses in faith range
  safetyCoverage: number;     // 0..1 fraction of houses in safety range
  goodsCoverage: number;      // 0..1 fraction of houses in goods range

  // Decrees
  readonly activeDecrees: Set<string>;

  // Trader
  traderPresent: boolean;
  traderArrivalDay: number;   // -1 if not scheduled
  traderDepartDay: number;
  readonly traderOffers: BarterOffer[];

  // Phase 4: siege state
  readonly wallTiles: Set<number>;    // tile indices that are walls (impassable to raiders)
  readonly gateTiles: Set<number>;    // tile indices that are gates (passable)
  threatLevel: number;                // 0..100, escalates over time
  nextRaidTick: number;               // tick when next raid spawns (-1 = unscheduled)
  raidCount: number;                  // total raids spawned so far
  defensiveStrength: number;          // computed each tick: walls + towers + garrison
  readonly raiders: RaiderState[];    // active raider entities
  keepPosition: { x: number; y: number } | null; // where the keep is (for raider pathing)
  keepSacked: boolean;                // true if keep was destroyed

  // Phase 4.5: hazard state
  readonly fireState: Map<number, BuildingFireState>; // keyed by building ECS id
  sickVillagers: number;    // count of sick villagers
  outbreakActive: boolean;  // true if disease spreading
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
