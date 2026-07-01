/**
 * Shared mutable sim state for Citadel.
 *
 * The SimContext from @engine/core only carries `tick`, so cross-system state
 * lives here. The bootstrap constructs one SimState and hands a reference to
 * every system; systems read & mutate it in place. Everything in here is
 * deterministic — no wall-clock, no Math.random.
 *
 * Citadel 28 (MP foundation): per-player economy/needs/territory/army/hazard
 * state moved onto a first-class `PlayerState`; `SimState.players` holds one per
 * player. Single-player is the `players.length === 1` case — no separate path.
 * SHARED (not per-player): terrain, the world grid/occupancy/roads, the tick
 * clock, the ECS worlds, the command log, the event ring. Per-player systems
 * iterate `state.players` in stable id order (determinism).
 */
import type { World } from "@engine/core";
import { OccupancyGrid } from "@engine/core";
import type { GoodType, BuildingRuntimeState, BuildingEntity } from "./entities/building";
import type { VillagerEntity } from "./entities/villager";
import type { Rng } from "@engine/core";
import type { SettlementTier } from "./systems/tiers";
import type { CitadelCommand } from "./snapshot/index";

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

/** Sum of all goods in a Stockpiles pool. */
export function totalGoods(s: Stockpiles): number {
  let total = 0;
  for (const k of Object.keys(s) as GoodType[]) total += s[k];
  return total;
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
  strength: number; // raider group strength (mutable: interceptors shave it)
  resolved: boolean; // whether this raid has been resolved
  /**
   * Citadel siege-variance: morale 0..100. Starts high; decays when the player
   * repairs/strengthens defenses mid-march (represents besiegers losing nerve).
   * Low morale biases the seeded outcome toward repel. Optional for back-compat
   * with inline test constructors; raid-spawn always sets it.
   */
  morale?: number;
  /** Peak defensiveStrength seen since spawn — morale decays as defense climbs past it. */
  defenseAtSpawn?: number;
  /** True once a scout has revealed this raider (legible early warning). */
  scouted?: boolean;
  /** True once a garrison sortie has intercepted this raider (one shave per raider). */
  intercepted?: boolean;
}

/**
 * Citadel 32: a PvP army marching from its attacker toward a targeted enemy
 * building / town-hall. Cross-player (spans territories) → lives on SimState,
 * not PlayerState. Resolved by the shared siege math (army strength vs the
 * defender's defensiveStrength). MP-only: solo never launches attacks, so the
 * army list stays empty and the ArmySystem is a no-op (solo determinism intact).
 */
export interface ArmyState {
  id: number;
  attackerId: number;       // player who launched the army
  targetPlayerId: number;   // owner of the targeted building
  targetX: number;          // targeted building's origin tile
  targetY: number;
  x: number;                // current position (float)
  y: number;
  tileX: number;            // integer tile
  tileY: number;
  path: Array<{ x: number; y: number }>;
  pathStep: number;
  strength: number;
  resolved: boolean;
}

/**
 * Citadel 28: all per-player state. One per player; single-player owns exactly
 * one (`id === 0`). Per-player systems loop `state.players` and act on each
 * player's own fields + the buildings/villagers carrying its `ownerId`.
 */
export interface PlayerState {
  /** Stable player id. Solo = 0. Iteration order = ascending id (determinism). */
  readonly id: number;

  /** Goods pool. */
  readonly stockpiles: Stockpiles;
  /**
   * Citadel 09 (tithe decree): a second goods pool, separate from `stockpiles`.
   * Filled daily by the tithe siphon; drawn down to cushion starvation and to
   * improve Trading Post barter terms. NOT money (APR #28: no coin economy).
   */
  readonly reliefReserve: Stockpiles;

  /** Population bookkeeping. */
  population: number;
  popCap: number;
  hungerDays: number;
  /** This player's run is over (starved out / sacked). Solo: the whole game. */
  gameOver: boolean;

  /** Food surplus (bread produced minus consumed) over the last day. */
  foodSurplus: number;
  /** Per-day bread consumption snapshot (for surplus reporting). */
  lastDayBreadStart: number;

  // Phase 3: happiness + needs
  happiness: number;          // 0..100
  faithCoverage: number;      // 0..1 fraction of houses in faith range
  safetyCoverage: number;     // 0..1 fraction of houses in safety range
  goodsCoverage: number;      // 0..1 fraction of houses in goods range

  /**
   * Decrees. Cozy-pivot Phase G RETIRED the `setDecree` player lever — nothing
   * populates this set any more, so it is effectively always empty. It is retained
   * only because ImmigrationSystem (`tithe`/`rationing`) and SiegeResolutionSystem
   * (`conscription`) still branch on membership; those branches are now dead paths
   * (always false) pending their own cozy-pivot removal. The `festival` counterplay
   * moved to the autonomous, spatial public-square (see needs-happiness.ts).
   */
  readonly activeDecrees: Set<string>;

  // Trader (cozy-pivot Phase G: player-driven trading post — no caravan schedule).
  // `traderPresent` == "owns a staffed, connected Trading Post" (trade affordance
  // available); `traderOffers` is the deterministic menu, both refreshed daily by
  // TraderSystem. No arrival/depart scheduling any more.
  traderPresent: boolean;
  readonly traderOffers: BarterOffer[];

  // Phase 4: siege state
  readonly wallTiles: Set<number>;    // tile indices that are walls (impassable to raiders)
  readonly gateTiles: Set<number>;    // tile indices that are gates (passable)
  threatLevel: number;                // 0..100, escalates over time
  nextRaidTick: number;               // tick when next raid spawns (-1 = unscheduled)
  scoutWarned: boolean;               // true once the scout has warned of the pending raid
  raidCount: number;                  // total raids spawned so far
  defensiveStrength: number;          // computed each tick: walls + towers + garrison
  readonly raiders: RaiderState[];    // active raider entities targeting this player
  keepPosition: { x: number; y: number } | null; // where the keep / town-hall is
  keepSacked: boolean;                // true if keep was destroyed

  // Phase 4.5: hazard state
  readonly fireState: Map<number, BuildingFireState>; // keyed by building ECS id
  sickVillagers: number;    // count of sick villagers
  outbreakActive: boolean;  // true if disease spreading

  // Phase 5: settlement tier
  tier: SettlementTier;
  /**
   * Highest tier ever reached (never decreases). Building/upgrade tier-locks
   * gate on this, not on `tier`, so a demotion (pop lost to disease/starvation)
   * never re-locks a building type the player already unlocked.
   */
  peakTier: SettlementTier;

  /**
   * Citadel 30: this player's claimed territory — tile indices (ty*width+tx)
   * within influence radius of the player's owned buildings. Derived pass;
   * empty until brief 30 fills it.
   */
  readonly territory: Set<number>;
}

/** Initial per-player state — matches the historical single-player init. */
export function makePlayerState(id: number): PlayerState {
  return {
    id,
    stockpiles: emptyStockpiles(),
    reliefReserve: emptyStockpiles(),
    population: 0,
    popCap: 0,
    hungerDays: 0,
    gameOver: false,
    foodSurplus: 0,
    lastDayBreadStart: 0,
    happiness: 40,
    faithCoverage: 0,
    safetyCoverage: 0,
    goodsCoverage: 0,
    activeDecrees: new Set<string>(),
    traderPresent: false,
    traderOffers: [],
    wallTiles: new Set<number>(),
    gateTiles: new Set<number>(),
    threatLevel: 0,
    nextRaidTick: -1,
    scoutWarned: false,
    raidCount: 0,
    defensiveStrength: 0,
    raiders: [],
    keepPosition: null,
    keepSacked: false,
    fireState: new Map<number, BuildingFireState>(),
    sickVillagers: 0,
    outbreakActive: false,
    tier: "Hamlet",
    peakTier: "Hamlet",
    territory: new Set<number>(),
  };
}

export interface SimState {
  readonly width: number;
  readonly height: number;
  readonly ticksPerDay: number;
  readonly daysPerYear: number;

  /** ECS worlds (separate for buildings vs villagers). */
  readonly buildingWorld: World<BuildingEntity>;
  readonly villagerWorld: World<VillagerEntity>;

  /** Footprint occupancy (buildings + roads). Shared physical grid. */
  readonly occupancy: OccupancyGrid;

  /** Road grid: 1 = road tile, 0 = not road. Length width*height. Shared. */
  readonly roadGrid: Uint8Array;

  /** Set of tile indices (ty*width+tx) covered by building footprints. Shared. */
  readonly buildingTiles: Set<number>;

  /** Per-building runtime economy state, keyed by ECS entity id. */
  readonly buildingState: Map<number, BuildingRuntimeState>;

  /** Monotonic id allocator for villagers. */
  nextVillagerId: number;

  /** Connectivity dirty flag — set when buildings/roads change. */
  connectivityDirty: boolean;

  /** Event ring buffer (max 20 entries). Shared across players. */
  readonly events: string[];

  /** Seeded RNG root (forked per-system by label). */
  readonly rng: Rng;

  /** Current day, mirrored from the day clock for systems that need it. */
  day: number;

  /** Players (Citadel 28). Solo = `[player0]`. Stable ascending-id order. */
  readonly players: PlayerState[];
  /** The local player's id (the solo player / this client). Default 0. */
  localId: number;

  /** Citadel 32: in-flight PvP armies (cross-player; empty in solo). */
  readonly armies: ArmyState[];
  /** Monotonic id allocator for armies. */
  nextArmyId: number;

  /**
   * Phase 5: command log for save/load.
   * Every CitadelCommand that passes through the CommandSystem is appended here
   * with its tick number, enabling deterministic replay from a fresh bootstrap.
   */
  readonly commandLog: Array<{ tick: number; command: CitadelCommand }>;
}

const MAX_EVENTS = 20;

export function pushEvent(state: SimState, msg: string): void {
  state.events.push(msg);
  while (state.events.length > MAX_EVENTS) state.events.shift();
}

/** The local / single player. In solo this is the one and only player. */
export function localPlayer(state: SimState): PlayerState {
  // citadel-38 P3#17: look up by id, not array index — index==id only holds while
  // ids stay contiguous from 0 (fragile if a player ever leaves and ids reorder).
  const p = state.players.find((q) => q.id === state.localId);
  if (p === undefined) throw new Error(`no local player (id ${state.localId})`);
  return p;
}

/** Look up a player by id (stable). */
export function playerById(state: SimState, id: number): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

/** Walkability predicate for villagers: road tiles OR building footprint tiles. */
export function villagerWalkable(state: SimState, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) return false;
  const idx = ty * state.width + tx;
  return state.roadGrid[idx] === 1 || state.buildingTiles.has(idx);
}

/**
 * Despawn one villager entity owned by `p` and decrement `p.population`, keeping
 * the entity count and the population counter in lockstep. Picks the highest-id
 * owned villager (deterministic — no rng), frees its worker slot if it was
 * assigned, and returns `true` if one was removed.
 *
 * This is the single source of truth for population loss: immigration
 * (starvation / morale departure), disease deaths, and raid casualties all route
 * through it so the on-map villager count always equals `population`. Decrementing
 * `p.population` without going through here (or an equivalent despawn) leaves
 * phantom villagers on the map.
 */
export function removeOneVillager(state: SimState, p: PlayerState): boolean {
  let victimId = -1;
  let victim: VillagerEntity | null = null;
  for (const entity of state.villagerWorld.query("villager")) {
    if (entity.villager.ownerId !== p.id) continue;
    const vid = entity.villager.id;
    if (vid > victimId) {
      victimId = vid;
      victim = entity;
    }
  }
  if (victim === null) return false;
  const v = victim.villager;
  // Free the worker slot if this villager was assigned to a workplace building.
  const idx = v.workY * state.width + v.workX;
  if (idx >= 0 && idx < state.width * state.height) {
    for (const be of state.buildingWorld.query("building")) {
      const b = be.building;
      if (v.workX >= b.x && v.workX < b.x + b.w && v.workY >= b.y && v.workY < b.y + b.h) {
        const bid = be.id;
        if (bid !== undefined) {
          const rs = state.buildingState.get(bid);
          if (rs !== undefined && rs.workerCount > 0) rs.workerCount--;
        }
        break;
      }
    }
  }
  state.villagerWorld.despawn(victim);
  p.population = Math.max(0, p.population - 1);
  return true;
}
