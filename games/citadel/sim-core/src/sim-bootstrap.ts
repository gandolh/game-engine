import { Scheduler, World, CommandQueue, CommandSystem, OccupancyGrid, checkPlacement, rebuildWalkable, createRng } from "@engine/core";
import type { System, SimContext } from "@engine/core";
import type { CitadelCommand, BuildingSnapshot, VillagerSnapshot, RenderSnapshot, CitadelSave } from "./snapshot/index";
import { DayClockSystem } from "./systems/day-clock";
import { TierSystem, TIER_LOCK, tierAtLeast, unlockTier } from "./systems/tiers";
import { generateTerrain, isWalkable, TerrainType, findCoreBox, CORE_BOX_W, CORE_BOX_H, WORLD_WIDTH as DEFAULT_WORLD_WIDTH, WORLD_HEIGHT as DEFAULT_WORLD_HEIGHT } from "./world/terrain";
import type { TerrainGrid } from "./world/terrain";
import type { BuildingEntity, BuildingRuntimeState, GoodType } from "./entities/building";
import {
  getBuildingDef,
  getProductionDef,
  effectiveHousingCapacity,
  upgradeCost,
  buildCost,
  BUILDING_MAX_LEVEL,
  jobForBuildingType,
  JOB_IDLE,
} from "./entities/building";
import type { VillagerEntity } from "./entities/villager";
import { isTravellingFsm } from "./entities/villager";
import type { SimState, Stockpiles, ArmyState } from "./sim-state";
import { pushEvent, totalGoods, makePlayerState, localPlayer, playerById, releaseWorkersAt } from "./sim-state";
import { RoadConnectivitySystem } from "./systems/road-connectivity";
import { TerritorySystem, canBuildAt, DEFAULT_TERRITORY_RADIUS } from "./systems/territory";
import { ProductionSystem, SERVICE_BONUS_BAND } from "./systems/production";
import { VillagerSystem, villagerPos } from "./systems/villager-system";
import { ImmigrationSystem } from "./systems/immigration";
import { NeedsHappinessSystem } from "./systems/needs-happiness";
import { TraderSystem } from "./systems/trader";
import { RaidSpawnSystem, computeRaiderPath } from "./systems/raid-spawn";
import { ArmySystem } from "./systems/army";
import { RaiderMovementSystem } from "./systems/raider-movement";
import { SiegeResolutionSystem } from "./systems/siege-resolution";
import { FireSystem, countActiveFires } from "./systems/fire-system";
import { DiseaseSystem } from "./systems/disease-system";
import { getSeason } from "./world/seasons";

export interface CitadelSimOptions {
  seed: number;
  ticksPerDay: number;
  /** Starting day offset (default 0). Used to begin the sim partway through the year. */
  startDay?: number;
  /**
   * Citadel 29: world dimensions. Default to the engine constants (96×96) so
   * solo play + tests + the determinism baseline are unchanged. The MP server
   * passes a larger world (e.g. 256×256) — every grid-sized allocation, the
   * pathfinder, region baking, and the snapshot extents track this size.
   */
  worldWidth?: number;
  worldHeight?: number;
  /**
   * Citadel 30: enforce influence-radius territory build-gating (place only
   * within your territory ∪ adjacent-unclaimed). Default false → solo builds
   * freely (unchanged). The MP server enables it. `territoryRadius` is the
   * influence radius in tiles (Manhattan) per owned building.
   */
  enforceTerritory?: boolean;
  territoryRadius?: number;
  /**
   * Is this a multiplayer match? Decides whether the `town-hall` is each player's keep/raid
   * anchor (MP) or a purely civic coverage building (solo — cozy-pivot Phase G). Default
   * false, so solo, the headless runner, and the determinism baseline are unchanged; the MP
   * server passes true.
   *
   * A bootstrap-time fact on purpose: a room is founded by one peer and grows, so anything
   * derived from a live `players.length` misclassifies the founder (see `actsAsKeepAnchor`).
   */
  multiplayer?: boolean;
  /**
   * Charge the per-type material cost (`BUILD_COST`) to the owner's stockpile when a
   * building is placed, rejecting unaffordable placements with the `"cost"` reason.
   * Default false → placement is free (the determinism baseline + the bulk-place headless
   * demos and tests are unchanged). The real client enables it (paired with `startingStock`).
   */
  chargeBuildCost?: boolean;
  /**
   * A founding stockpile grant applied to every player at bootstrap (e.g. `{ wood: 40 }`).
   * Paired with `chargeBuildCost` so the cozy cold-open has the materials to place the first
   * buildings. Default none (every good starts at 0). Deterministic (a constant grant).
   */
  startingStock?: Partial<Record<GoodType, number>>;
  /**
   * Cozy-pivot Phase D: demote the threat systems (fire / disease / siege) toward a gentler,
   * lower-stakes footing. Default true → the cozy tuning is the intended solo experience. Set
   * false to keep the original harsher threat behavior (e.g. the MP/headless-baseline path).
   * This chunk only THREADS the flag into the three threat systems; no behavior branches on it
   * yet (later chunks add the cozy tuning).
   */
  cozyThreats?: boolean;
  /**
   * MP/PvP army resolution (in-flight armies + siege-adjacent resolution via `ArmySystem`).
   *
   * **Default `false` since 2026-07-10 (decision #23).** Multiplayer is deprecated (#21), so lethal
   * PvP has no consumer: `ArmyState` is PvP down to its fields (`attackerId` is a player), and the
   * PvE job is already done by `applyRaidDamage`. The system and the `launchAttack` handler stay in
   * the tree, frozen and unreached; the marching machinery is being rehomed onto the cozy raid
   * (brief 113). Challenge mode (#24) does **not** turn this back on — there is no second player.
   *
   * ⚠️ The `launchAttack` handler is gated on this flag too. It must be: the handler debits
   * `tools` and pushes an `ArmyState`, and with `ArmySystem` unregistered that army would never
   * resolve and never be removed — tools gone, `state.armies` growing without bound.
   *
   * `army.test.ts` / `pve-gift.test.ts` pass `true` explicitly to exercise the frozen math.
   */
  enableArmy?: boolean;
  /**
   * Cozy cold-open: pre-seed a small, connected, self-sufficient "alive core" of buildings at
   * the map center BEFORE the scheduler's first tick, so the solo game opens on a living town
   * (a bread chain + a house, road-connected) instead of an empty map — making the founding
   * deadlock structurally impossible. Default false → bootstrap output is byte-identical to
   * today (the determinism baseline, headless runs, and all existing tests are unchanged since
   * the flag defaults off). The seed is placed via the SAME `placeOne` funnel used by player
   * commands (occupancy/roadGrid/buildingTiles/popCap stay consistent), is NOT charged to the
   * stockpile even when `chargeBuildCost` is true (it's a gift, not a purchase), and is NOT
   * logged into `state.commandLog` (it's not a player command — it would double-apply on replay;
   * `loadFromSave` re-seeds by threading `seedTown` back into the fresh bootstrap instead).
   * Deterministic: placement is a fixed sequence computed from the world dims (no RNG, no
   * `Math.random`/`Date.now`).
   */
  seedTown?: boolean;
  /**
   * Cozy cold-open threat-defer: suppress fire ignition, disease onset, and raid
   * scheduling for a player until they own at least this many NON-ROAD buildings
   * (the same count the tier ladder uses). The cold-open passes 6 (the seed is 5
   * structures; threats begin only once the player adds their 6th). Default 0 =
   * disabled = today's exact behavior — the gate short-circuits BEFORE any RNG
   * draw when 0, so the determinism baseline, headless runs, and existing tests
   * are byte-identical and unaffected. Persisted so a save re-applies the same gate.
   */
  deferThreatsUntilBuildings?: number;
}

/** True if `stock` holds at least every good in `cost`. */
function canAfford(stock: Stockpiles, cost: Partial<Record<GoodType, number>>): boolean {
  for (const g of Object.keys(cost) as GoodType[]) {
    if (stock[g] < (cost[g] ?? 0)) return false;
  }
  return true;
}

/** Subtract `cost` from `stock` in place (caller has already checked {@link canAfford}). */
function debitStock(stock: Stockpiles, cost: Partial<Record<GoodType, number>>): void {
  for (const g of Object.keys(cost) as GoodType[]) {
    stock[g] -= cost[g] ?? 0;
  }
}

/** Add `grant` to `stock` in place (the founding `startingStock` grant). */
function creditStock(stock: Stockpiles, grant: Partial<Record<GoodType, number>>): void {
  for (const g of Object.keys(grant) as GoodType[]) {
    stock[g] += grant[g] ?? 0;
  }
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
  /**
   * Drain + apply queued commands WITHOUT advancing the simulation (city-builder
   * "plan while paused"): runs the CommandSystem then recomputes connectivity so
   * the snapshot reflects the new layout, but no sim systems or the day clock run.
   */
  applyCommands(ctx: SimContext): void;
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
  /** Full sim state — exposed for Phase 3 tests and systems that need direct access. */
  state: SimState;
  /**
   * Phase 5 Save/Load: serialize the command log to a JSON-compatible object.
   * @param currentTick - The tick at which the save is taken (used by loadFromSave to
   *   replay up to this exact tick, reconstructing identical state).
   */
  serializeSave(currentTick: number): CitadelSave;
}

// ---------------------------------------------------------------------------
// Phase 5: Save / Load via command-log replay
// ---------------------------------------------------------------------------
// CitadelSave is defined in snapshot/index.ts and re-exported from index.ts.

/**
 * Load a saved citadel by replaying its command log into a fresh bootstrapSim().
 *
 * Replay drives the scheduler tick-by-tick from 0 up to the highest tick in
 * the command log, injecting each command at the exact tick it was originally
 * applied.  The final state is identical to the original (deterministic).
 *
 * @param save - The serialized save returned by `serializeSave()`.
 * @returns A fully-bootstrapped CitadelSimResult at the saved tick.
 */
export function loadFromSave(save: CitadelSave): CitadelSimResult {
  const sim = bootstrapSim({
    seed: save.seed,
    ticksPerDay: save.ticksPerDay,
    startDay: save.startDay,
    // Replay with the saved economy rules so the reconstructed state matches the original.
    chargeBuildCost: save.chargeBuildCost ?? false,
    // A save taken with cozy threats on must replay with them on. Absent (pre-feature saves)
    // ⇒ true, matching the bootstrap default (the cozy footing is the intended solo experience).
    cozyThreats: save.cozyThreats ?? true,
    // A save taken with army resolution on/off must replay the same way. Absent (pre-feature
    // saves) ⇒ false, matching the bootstrap default since decision #23.
    //
    // This changed with the default (it was `?? true`), and is safe: only SOLO can load a save
    // (`load-save` is refused in a shared MP room), solo has always passed `enableArmy: false`
    // explicitly, and a one-player sim can never reach `launchAttack` anyway — `defenderId ===
    // attacker.id` short-circuits before any army is created. So no loadable save's replay changes.
    enableArmy: save.enableArmy ?? false,
    // A save taken in an MP match must replay as one: `multiplayer` decides whether the replayed
    // town-hall placements adopt the keep anchor. Absent ⇒ false, the bootstrap default (and the
    // truth for every pre-brief-108 save, since only solo could ever load one).
    multiplayer: save.multiplayer ?? false,
    // Replay on the SAME grid. Absent ⇒ the 96×96 engine defaults (every pre-feature save).
    // Without this, a 256×256 save replayed on a 96×96 world and every command past tile 95 was
    // silently rejected as out-of-bounds. Only pass when present (exactOptionalPropertyTypes).
    ...(save.worldWidth !== undefined ? { worldWidth: save.worldWidth } : {}),
    ...(save.worldHeight !== undefined ? { worldHeight: save.worldHeight } : {}),
    // A save taken with a seeded town must re-seed the SAME core before command replay (the seed
    // is applied at bootstrap, not logged). Absent (pre-feature saves) ⇒ false (empty start).
    seedTown: save.seedTown ?? false,
    // A save taken with the threat-defer gate on must replay with it on. Absent
    // (pre-feature saves) ⇒ 0 (disabled), matching the bootstrap default.
    deferThreatsUntilBuildings: save.deferThreatsUntilBuildings ?? 0,
    ...(save.startingStock !== undefined ? { startingStock: save.startingStock } : {}),
  });

  // Group commands by tick for O(1) lookup during replay.
  const byTick = new Map<number, CitadelCommand[]>();
  for (const entry of save.commandLog) {
    let list = byTick.get(entry.tick);
    if (list === undefined) {
      list = [];
      byTick.set(entry.tick, list);
    }
    list.push(entry.command);
  }

  // Replay: tick 0 .. currentTick.  Inject commands BEFORE the tick that applies them.
  // CommandSystem drains the queue at the start of each tick — so we enqueue
  // just before scheduler.tick(tick) to get the same dispatch tick.
  for (let tick = 0; tick <= save.currentTick; tick++) {
    const cmds = byTick.get(tick);
    if (cmds !== undefined) {
      for (const cmd of cmds) {
        sim.commands.enqueue(cmd);
      }
    }
    sim.scheduler.tick({ tick });
  }

  return sim;
}

/**
 * Bootstrap the Citadel sim.
 * Worker-agnostic: safe to call on the main thread (headless) or inside a
 * Web Worker. No Worker-specific APIs are referenced here.
 */
export function bootstrapSim(opts: CitadelSimOptions): CitadelSimResult {
  const { seed, ticksPerDay } = opts;

  // Citadel 29: configurable world size. These locals shadow the engine
  // defaults so every WORLD_WIDTH/WORLD_HEIGHT use below tracks the configured
  // dimensions (terrain, occupancy, road grid, pathfinder, snapshot extents).
  const WORLD_WIDTH = opts.worldWidth ?? DEFAULT_WORLD_WIDTH;
  const WORLD_HEIGHT = opts.worldHeight ?? DEFAULT_WORLD_HEIGHT;

  // Citadel 30: territory build-gating (opt-in; off in solo so play is unchanged).
  const enforceTerritory = opts.enforceTerritory ?? false;
  const territoryRadius = opts.territoryRadius ?? DEFAULT_TERRITORY_RADIUS;
  // Brief 108: MP match vs solo game — decides the town-hall's keep-anchor role.
  const multiplayer = opts.multiplayer ?? false;
  const chargeBuildCost = opts.chargeBuildCost ?? false;
  const startingStock = opts.startingStock;
  // Cozy-pivot Phase D: threat demotion is on by default (the intended solo footing). Threaded
  // into the three threat systems below; no behavior branches on it yet.
  const cozyThreats = opts.cozyThreats ?? true;
  // MP/PvP army resolution: OFF by default since decision #23 (MP is deprecated, so lethal PvP has
  // no consumer). Gates both `ArmySystem`'s registration and the `launchAttack` handler — they must
  // move together, or the handler queues an army nothing resolves. `army.test.ts` opts back in.
  const enableArmy = opts.enableArmy ?? false;
  // Cozy cold-open: pre-seed an alive town core (opt-in; off by default so the baseline is
  // byte-identical). Applied at the end of bootstrap, before returning.
  const seedTown = opts.seedTown ?? false;
  // Cozy cold-open threat-defer (opt-in; 0 = disabled = byte-identical baseline).
  const deferThreatsUntilBuildings = opts.deferThreatsUntilBuildings ?? 0;

  const terrain = generateTerrain(seed, WORLD_WIDTH, WORLD_HEIGHT);

  const buildingWorld = new World<BuildingEntity>();
  const villagerWorld = new World<VillagerEntity>();

  const occupancy = new OccupancyGrid(WORLD_WIDTH, WORLD_HEIGHT);

  const buildable = (tx: number, ty: number): boolean => isWalkable(terrain, tx, ty);

  // Walkability for the path/raider grid: buildable terrain OR a road/bridge
  // tile. Bridges sit on (non-buildable) water but are crossable once decked, so
  // they must read as walkable here. Placement validity still uses `buildable`.
  // (defined as a function so it can reference `state`, assigned just below,
  // without a temporal-dead-zone hazard at the initial bake — no roads exist yet.)
  function walkablePred(tx: number, ty: number): boolean {
    return buildable(tx, ty) || state.roadGrid[ty * WORLD_WIDTH + tx] === 1;
  }

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
    nextVillagerId: 1,
    connectivityDirty: true,
    events: [],
    eventsSeq: 0,
    rng: createRng(seed).fork("citadel-sim"),
    day: 0,
    // Citadel 28: per-player state. Solo = one player (id 0); all per-player
    // economy/needs/siege/hazard/tier fields now live on this PlayerState.
    players: [makePlayerState(0)],
    localId: 0,
    armies: [],
    nextArmyId: 1,
    commandLog: [],
  };

  // Founding stockpile grant (paired with chargeBuildCost so the cozy cold-open can
  // afford its first buildings). Applied to every player present at bootstrap. Deterministic.
  if (startingStock !== undefined) {
    for (const p of state.players) creditStock(p.stockpiles, startingStock);
  }

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
    return {
      outputBuffer: 0,
      workerCount: 0,
      connected: false,
      productionTick: 0,
      level: 1,
      // Per-house needs/mood (house-only; NeedsHappinessSystem overwrites for houses).
      // Neutral defaults: fully-lacking, base mood 40 (the no-needs-met floor).
      lacksFaith: true,
      lacksSafety: true,
      lacksGoods: true,
      mood: 40,
    };
  }

  // ---------------------------------------------------------------------------
  // Command queue + system
  // ---------------------------------------------------------------------------
  const commands = new CommandQueue<CitadelCommand>();
  const commandSystem = new CommandSystem<CitadelCommand>(commands);

  /**
   * Helper: wrap a command handler to also append the command to state.commandLog
   * at the current tick.  This is the Phase 5 save-log tap — every applied command
   * is recorded so the log can be serialized and replayed verbatim.
   */
  function logged<T extends CitadelCommand["type"]>(
    type: T,
    handler: (cmd: Extract<CitadelCommand, { type: T }>, ctx: import("@engine/core").SimContext) => void,
  ): void {
    commandSystem.register(type, (cmd, ctx) => {
      state.commandLog.push({ tick: ctx.tick, command: cmd as CitadelCommand });
      handler(cmd as Extract<CitadelCommand, { type: T }>, ctx);
    });
  }

  /** Whether tile (tx,ty) is in-bounds and water. */
  function isWaterTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) return false;
    return terrain.cells[ty * WORLD_WIDTH + tx] === TerrainType.Water;
  }

    // Why a placement was rejected — lets callers emit ONE descriptive message
    // (P1-live: silent rejects gave the player no feedback) and coalesce a
    // drag's per-tile rejections into a single summary (P2: tier-locked drags
    // dumped ~20 near-identical toasts). "ok" means the building was placed.
    type PlaceReason = "ok" | "tier" | "territory" | "occupied" | "terrain" | "bounds" | "invalid" | "cost";
    /**
     * Does placing this `isKeep` building adopt the keep/raid anchor (sets `keepPosition`,
     * sacking it ends the player's run)?
     *
     * The `keep` always anchors (the solo siege game). The **town-hall** is each MP player's
     * match anchor (Citadel 29) — but under the cozy-pivot Phase-G direction the town-hall in
     * SOLO is a purely *civic* coverage building (rations/work-hours within its radius), NOT
     * the keep/raid anchor: a player should be able to place one without starting a siege. So
     * the town-hall anchors only in MULTIPLAYER; in solo it's civic-only. Raids are gated
     * entirely on `keepPosition` (raid-spawn), so not adopting it ⇒ no raids.
     *
     * The mode is the bootstrap-time `multiplayer` flag, NOT a live `players.length > 1`
     * count. An MP room is founded by ONE peer and grows: counting players made the founder's
     * hall skip the anchor forever (`keepPosition` is assigned once, at placement), while the
     * snapshot's `keepPresent` — recomputed from the same predicate every tick — flipped to
     * true the moment a second peer joined. The founder read "Keep: standing" and was never
     * raided. Found by the brief-108 live-MP pass.
     */
    function actsAsKeepAnchor(buildingType: string): boolean {
      if (getProductionDef(buildingType)?.isKeep !== true) return false;
      if (buildingType === "town-hall" && !multiplayer) return false;
      return true;
    }

    function placeOne(buildingType: string, x: number, y: number, charge = true): PlaceReason {
    // A road dragged onto water becomes a bridge (a walkable span). This is the
    // ONLY way bridges are created, so a "road" command across a river auto-decks
    // the water tiles and lays plain road on the land tiles. (A bridge command
    // off-water falls through to the normal water/occupancy rejection below.)
    if (buildingType === "road" && isWaterTile(x, y)) buildingType = "bridge";

    const def = getBuildingDef(buildingType);
    if (def === undefined) return "invalid";

    // Citadel 28: solo commands act on the local player. (Brief 35 will route
    // each command to its sender's player; for now there is one writer.)
    const lp = localPlayer(state);

    // Tier-lock: some building types are gated behind a minimum settlement tier.
    const required = TIER_LOCK[buildingType];
    if (required !== undefined && !tierAtLeast(unlockTier(lp), required)) {
      return "tier";
    }

    // Build cost (opt-in). Check affordability UP FRONT so an unaffordable click is rejected
    // cleanly without mutating; the DEBIT happens only on success (below), so a placement that
    // fails a later validity check (occupied/terrain/…) is never charged. Stockpiles don't
    // change between here and the debit (one writer per tick), so the two stay consistent.
    // `charge` lets the founding seed (a gift, not a purchase) bypass the debit even when
    // chargeBuildCost is on — every other caller leaves it defaulted true (unchanged behavior).
    const cost = chargeBuildCost && charge ? buildCost(buildingType) : undefined;
    if (cost !== undefined && !canAfford(lp.stockpiles, cost)) {
      return "cost";
    }

    // Citadel 30: territory build-gating (MP). Place only within your territory
    // ∪ adjacent-unclaimed; never into a rival's claim. Off in solo.
    if (enforceTerritory && !canBuildAt(state, lp, x, y, def.w, def.h)) {
      return "territory";
    }

    const prod = getProductionDef(buildingType);
    const fp = { x, y, w: def.w, h: def.h };

    const isGate = prod?.isGate === true;
    const isBridge = prod?.isBridge === true;

    if (isBridge) {
      // A bridge decks exactly one water tile. It must BE water (else it would
      // just be a road), and must not overlap any existing building/road/bridge
      // footprint — bridges cannot overlap.
      if (!isWaterTile(x, y)) return "terrain";
      if (occupancy.isOccupied(x, y)) return "occupied";
      if (state.buildingTiles.has(y * WORLD_WIDTH + x)) return "occupied";
      occupancy.apply(fp);
      // Mark the deck as road BEFORE rebuilding so walkablePred (which ORs in
      // road tiles) keeps the bridged water tile walkable; the generic isRoad
      // block below re-sets the same cell, harmlessly.
      state.roadGrid[y * WORLD_WIDTH + x] = 1;
      walkable = rebuildWalkable(WORLD_WIDTH, WORLD_HEIGHT, occupancy, walkablePred);
    } else if (isGate) {
      // Gates stay walkable: bounds + terrain check only, no occupancy entry.
      for (let dy = 0; dy < def.h; dy++) {
        for (let dx = 0; dx < def.w; dx++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) return "bounds";
          if (!buildable(tx, ty)) return "terrain";
          // Can't place a gate on an already-occupied tile.
          if (state.buildingTiles.has(ty * WORLD_WIDTH + tx)) return "occupied";
        }
      }
    } else {
      const result = checkPlacement(fp, occupancy, buildable);
      if (!result.valid) {
        return result.reason !== undefined && result.reason.includes("bounds") ? "bounds" : "occupied";
      }

      // Terrain requirement (forest / stone): at least one footprint tile matches.
      if (prod?.terrainReq === "forest") {
        let onForest = false;
        for (let dy = 0; dy < def.h && !onForest; dy++) {
          for (let dx = 0; dx < def.w; dx++) {
            const t = terrain.cells[(y + dy) * WORLD_WIDTH + (x + dx)];
            if (t === TerrainType.Forest) { onForest = true; break; }
          }
        }
        if (!onForest) return "terrain";
      }
      if (prod?.terrainReq === "stone") {
        let onStone = false;
        for (let dy = 0; dy < def.h && !onStone; dy++) {
          for (let dx = 0; dx < def.w; dx++) {
            const t = terrain.cells[(y + dy) * WORLD_WIDTH + (x + dx)];
            if (t === TerrainType.Stone) { onStone = true; break; }
          }
        }
        if (!onStone) return "terrain";
      }

      occupancy.apply(fp);
      walkable = rebuildWalkable(WORLD_WIDTH, WORLD_HEIGHT, occupancy, buildable);
    }

    addBuildingTiles(x, y, def.w, def.h);

    const entity = buildingWorld.spawn({
      building: { type: buildingType, x, y, w: def.w, h: def.h, ownerId: lp.id },
    });
    if (entity.id !== undefined) {
      state.buildingState.set(entity.id, freshRuntime());
    }
    if (prod?.isRoad === true) {
      state.roadGrid[y * WORLD_WIDTH + x] = 1;
    }
    if (prod?.isHousing === true && prod.housingCapacity !== undefined) {
      // New buildings are L1 → base capacity (unchanged behavior).
      lp.popCap += effectiveHousingCapacity(prod, 1);
    }
    // Phase 4: special tile tracking (per-player)
    if (prod?.isGate === true) {
      lp.gateTiles.add(y * WORLD_WIDTH + x);
    }
    if (prod?.isWall === true) {
      lp.wallTiles.add(y * WORLD_WIDTH + x);
    }
    if (actsAsKeepAnchor(buildingType)) {
      // Center of the 3×3 footprint.
      lp.keepPosition = { x: x + Math.floor(def.w / 2), y: y + Math.floor(def.h / 2) };
    }
    // Charge the build cost now that placement has succeeded (affordability was checked above).
    if (cost !== undefined) debitStock(lp.stockpiles, cost);
    state.connectivityDirty = true;
    return "ok";
  }

  /** Human-readable reason for a single-building rejection (P1-live feedback). */
  function describeReject(buildingType: string, reason: PlaceReason): string | null {
    switch (reason) {
      case "tier": {
        const req = TIER_LOCK[buildingType];
        return `Day ${state.day}: a ${buildingType} needs ${req ?? "a higher"} tier — unlock it first.`;
      }
      case "territory":
        return `Day ${state.day}: can't build a ${buildingType} there — outside your territory.`;
      case "occupied":
        return `Day ${state.day}: can't build a ${buildingType} there — those tiles are taken.`;
      case "terrain":
        return `Day ${state.day}: a ${buildingType} can't sit on that ground.`;
      case "bounds":
        return `Day ${state.day}: can't build a ${buildingType} there — off the map.`;
      case "cost": {
        const need = Object.entries(buildCost(buildingType)).map(([g, q]) => `${q} ${g}`).join(", ");
        return `Day ${state.day}: can't afford a ${buildingType} — need ${need}.`;
      }
      default:
        return null; // "invalid" (unknown type) — no actionable message.
    }
  }

  logged("placeBuilding", (cmd) => {
    const r = placeOne(cmd.payload.buildingType, cmd.payload.x, cmd.payload.y);
    if (r !== "ok") {
      const msg = describeReject(cmd.payload.buildingType, r);
      if (msg !== null) pushEvent(state, msg);
    }
  });

  // Road/wall drags stamp many tiles; rather than one toast per rejected tile
  // (P2: a tier-locked wall drag dumped ~20 near-identical messages), tally the
  // rejection reasons and emit at most one coalesced summary per reason.
  function placeDragged(buildingType: string, tiles: ReadonlyArray<{ x: number; y: number }>): void {
    const counts = new Map<PlaceReason, number>();
    let placed = 0;
    for (const tile of tiles) {
      const r = placeOne(buildingType, tile.x, tile.y);
      if (r === "ok") placed++;
      else counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    const tierBlocked = counts.get("tier") ?? 0;
    if (tierBlocked > 0) {
      const req = TIER_LOCK[buildingType];
      pushEvent(
        state,
        `Day ${state.day}: ${tierBlocked} ${buildingType}${tierBlocked === 1 ? "" : "s"} need ${req ?? "a higher"} tier — unlock it first.`,
      );
    }
    // Tiles blocked by occupancy/terrain/bounds — the drag gapped here. Only
    // worth a word if some of the drag actually landed (a fully-rejected tier
    // drag is already explained above).
    const blocked = (counts.get("occupied") ?? 0) + (counts.get("terrain") ?? 0) + (counts.get("bounds") ?? 0);
    if (blocked > 0 && (placed > 0 || tierBlocked === 0)) {
      pushEvent(
        state,
        `Day ${state.day}: ${blocked} ${buildingType} tile${blocked === 1 ? "" : "s"} blocked — the run has a gap.`,
      );
    }
  }

  logged("placeRoad", (cmd) => {
    placeDragged("road", cmd.payload.tiles);
  });

  logged("placeWall", (cmd) => {
    placeDragged("wall", cmd.payload.tiles);
  });

  // Cozy-pivot Phase G: the `setDecree` player lever is GONE. Rations/work-hours
  // run autonomously from the town hall and festivals from the public square —
  // both spatial placement effects (see needs-happiness.ts / production.ts), never
  // a policy the player toggles. A stray `setDecree` command from an old client is
  // silently ignored (no registered handler → CommandSystem drops it).

  // Cozy-pivot Phase G: player-driven trading post. The "trade" command executes
  // one of the offers TraderSystem posts while the player owns a staffed +
  // connected Trading Post (`traderPresent`). No tithe sweetener — received is
  // exactly the offer's receiveQty (kept simple; tiny menus).
  logged("trade", (cmd) => {
    const lp = localPlayer(state);
    const { give, giveQty, receive, receiveQty } = cmd.payload;
    if (!lp.traderPresent) return; // no open (staffed+connected) trading post
    // Brief 97/21: resolve by CONTENT, not position — `traderOffers` re-rolls daily, so an
    // index captured client-side when the panel rendered can race a re-roll and no longer name
    // the offer the player actually picked. Match against the LIVE menu; if the offer is gone
    // (already re-rolled, or a stale/forged payload), no-op rather than trade the wrong thing.
    const offer = lp.traderOffers.find(
      (o) => o.give === give && o.giveQty === giveQty && o.receive === receive && o.receiveQty === receiveQty,
    );
    if (offer === undefined) return;
    const have = lp.stockpiles[offer.give];
    if (have < offer.giveQty) return;
    lp.stockpiles[offer.give] = have - offer.giveQty;
    const received = offer.receiveQty;
    lp.stockpiles[offer.receive] = lp.stockpiles[offer.receive] + received;
    pushEvent(state, `Day ${state.day}: traded ${offer.giveQty} ${offer.give} for ${received} ${offer.receive}.`);
  });

  logged("demolish", (cmd) => {
    const { x, y } = cmd.payload;
    for (const entity of buildingWorld.query("building")) {
      const b = entity.building;
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
        // Citadel 38 P0#1: only the owner may demolish. Without this any MP peer
        // could raze a rival's city — incl. their town-hall (= instant sack/
        // elimination). Footprints are uniquely tiled, so a non-owning match means
        // reject. Solo is single-owner → always true → no behavior change.
        if (b.ownerId !== localPlayer(state).id) break;
        const prod = getProductionDef(b.type);
        // Per-player fields belong to the building's owner.
        const owner = playerById(state, b.ownerId);
        removeBuildingTiles(b.x, b.y, b.w, b.h);
        // Clear the road/bridge tile BEFORE rebuilding walkable so a demolished
        // bridge stops reading as walkable (walkablePred ORs in road tiles).
        if (prod?.isRoad === true) {
          state.roadGrid[b.y * WORLD_WIDTH + b.x] = 0;
        }
        // Gates were never applied to occupancy; everything else was.
        if (prod?.isGate !== true) {
          occupancy.remove({ x: b.x, y: b.y, w: b.w, h: b.h });
          walkable = rebuildWalkable(WORLD_WIDTH, WORLD_HEIGHT, occupancy, walkablePred);
        }
        if (owner !== undefined && prod?.isHousing === true && prod.housingCapacity !== undefined) {
          // Subtract the building's level-effective capacity (read level before rs is deleted).
          const rs = entity.id !== undefined ? state.buildingState.get(entity.id) : undefined;
          owner.popCap = Math.max(0, owner.popCap - effectiveHousingCapacity(prod, rs?.level ?? 1));
        }
        if (owner !== undefined && prod?.isGate === true) {
          owner.gateTiles.delete(b.y * WORLD_WIDTH + b.x);
        }
        if (owner !== undefined && prod?.isWall === true) {
          owner.wallTiles.delete(b.y * WORLD_WIDTH + b.x);
        }
        if (owner !== undefined && prod?.isKeep === true) {
          owner.keepPosition = null;
        }
        // Re-idle any villager stationed at the demolished building before despawn
        // so it doesn't loop toward a dead workplace (ghost worker).
        releaseWorkersAt(state, b.x, b.y, b.w, b.h);
        if (entity.id !== undefined) state.buildingState.delete(entity.id);
        buildingWorld.despawn(entity);
        state.connectivityDirty = true;
        break;
      }
    }
  });

  logged("upgradeBuilding", (cmd) => {
    const { x, y } = cmd.payload;
    for (const entity of buildingWorld.query("building")) {
      const b = entity.building;
      if (!(x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)) continue;

      // Citadel 38 P0#2: only the owner may upgrade their building. The cost is
      // charged to the building's owner, so without this an MP peer could drain a
      // rival's stockpiles and mutate their building. Solo is single-owner → no-op.
      if (b.ownerId !== localPlayer(state).id) return;

      const prod = getProductionDef(b.type);
      if (prod === undefined) return;
      const owner = playerById(state, b.ownerId);
      if (owner === undefined) return;
      const rs = entity.id !== undefined ? state.buildingState.get(entity.id) : undefined;
      if (rs === undefined) return;

      const level = rs.level;
      if (level >= BUILDING_MAX_LEVEL) {
        pushEvent(state, `Day ${state.day}: ${b.type} is already at max level.`);
        return;
      }

      const nextLevel = level + 1;
      // L2 = Village, L3 = Town. Reuse the enforced tier ladder via tierAtLeast.
      const reqTier = level === 1 ? "Village" : "Town";
      if (!tierAtLeast(unlockTier(owner), reqTier)) {
        pushEvent(state, `Day ${state.day}: upgrading ${b.type} to L${nextLevel} requires ${reqTier} tier.`);
        return;
      }

      const cost = upgradeCost(b.type, nextLevel);
      // Affordability check across the owner's stockpile pool.
      for (const [good, qty] of Object.entries(cost)) {
        if (qty === undefined) continue;
        if (owner.stockpiles[good as GoodType] < qty) {
          const parts = Object.entries(cost)
            .map(([g, q]) => `${q ?? 0} ${g}`)
            .join(", ");
          pushEvent(state, `Day ${state.day}: not enough materials to upgrade ${b.type} (need ${parts}).`);
          return;
        }
      }

      // Deduct materials.
      for (const [good, qty] of Object.entries(cost)) {
        if (qty === undefined) continue;
        owner.stockpiles[good as GoodType] -= qty;
      }

      rs.level = nextLevel;
      if (prod.isHousing === true && prod.housingCapacity !== undefined) {
        owner.popCap += effectiveHousingCapacity(prod, nextLevel) - effectiveHousingCapacity(prod, level);
      }
      pushEvent(state, `Day ${state.day}: upgraded ${b.type} to L${nextLevel}.`);
      return;
    }
  });

  // Citadel 32: launch a PvP army at a targeted enemy building / town-hall.
  // Solo never issues this; in MP brief 35 routed it to the sending player.
  logged("launchAttack", (cmd) => {
    // Decision #23: armies are frozen. REJECT the command rather than dropping it silently — the
    // same discipline as the peer-sent `setActivePlayer` rejection (citadel-38 P0#3).
    //
    // ⚠️ This gate is load-bearing, not defensive tidiness. `enableArmy: false` only unregisters
    // `ArmySystem`. Without this check the handler below still debits `attacker.stockpiles.tools`
    // and pushes an `ArmyState` that nothing then advances or removes: the tools are gone and
    // `state.armies` grows without bound for the rest of the run. Flipping the default without
    // this line would CREATE that bug rather than prevent it.
    if (!enableArmy) {
      pushEvent(state, `Day ${state.day}: armies are disabled in this game.`);
      return;
    }
    const attacker = localPlayer(state);
    const { targetX, targetY, strength } = cmd.payload;
    if (strength <= 0) return;
    // Need an anchor (town-hall/keep) to march from.
    if (attacker.keepPosition === null) {
      pushEvent(state, `Day ${state.day}: no town hall to launch an army from.`);
      return;
    }
    // Cost: `strength` tools (the army's materiel). Reject if unaffordable.
    if (attacker.stockpiles.tools < strength) {
      pushEvent(state, `Day ${state.day}: not enough tools to field an army (need ${strength}).`);
      return;
    }
    // Find the targeted building + its owner.
    let target: BuildingEntity | undefined;
    for (const entity of buildingWorld.query("building")) {
      const b = entity.building;
      if (targetX >= b.x && targetX < b.x + b.w && targetY >= b.y && targetY < b.y + b.h) { target = entity; break; }
    }
    if (target === undefined) {
      pushEvent(state, `Day ${state.day}: no building to attack at (${targetX}, ${targetY}).`);
      return;
    }
    const defenderId = target.building.ownerId;
    if (defenderId === attacker.id) return; // no friendly fire
    const defender = playerById(state, defenderId);
    if (defender === undefined) return;

    attacker.stockpiles.tools -= strength;
    const spawn = attacker.keepPosition;
    // Auto-path to the target via the one authoritative pathfinder, routed around
    // the DEFENDER's walls (like a raider besieging that player).
    const path = computeRaiderPath(spawn.x, spawn.y, target.building.x, target.building.y, state, defender, terrain) ?? [];
    const army: ArmyState = {
      id: state.nextArmyId++,
      attackerId: attacker.id,
      targetPlayerId: defenderId,
      targetX: target.building.x,
      targetY: target.building.y,
      x: spawn.x, y: spawn.y, tileX: spawn.x, tileY: spawn.y,
      path, pathStep: 0, strength, resolved: false,
    };
    state.armies.push(army);
    pushEvent(state, `Day ${state.day + 1}: player ${attacker.id} launched an army (str ${strength}) at player ${defenderId}'s ${target.building.type}.`);
  });

  // Citadel 34: one-way gift/transfer — move goods from the sender to player
  // `to`. Pure stockpile arithmetic; no alliance/trust state. (Sender = local
  // player until brief 35 routes commands per sender.)
  logged("gift", (cmd) => {
    const sender = localPlayer(state);
    const { to, good, amount } = cmd.payload;
    if (amount <= 0) return;
    const recipient = playerById(state, to);
    if (recipient === undefined || recipient.id === sender.id) return;
    const g = good as GoodType;
    if (sender.stockpiles[g] === undefined) return; // unknown good
    if (sender.stockpiles[g] < amount) {
      pushEvent(state, `Day ${state.day}: not enough ${good} to gift (have ${sender.stockpiles[g]}, need ${amount}).`);
      return;
    }
    sender.stockpiles[g] -= amount;
    recipient.stockpiles[g] += amount;
    pushEvent(state, `Day ${state.day + 1}: player ${sender.id} gifted ${amount} ${good} to player ${to}.`);
  });

  // Citadel 35 (netcode): route subsequent commands to player `id` (multi-writer
  // server injects this before each peer's command). localPlayer-based handlers
  // then act on the sending player. Logged → deterministic replay.
  logged("setActivePlayer", (cmd) => {
    if (playerById(state, cmd.payload.id) !== undefined) state.localId = cmd.payload.id;
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

  const territorySystem = new TerritorySystem(state, territoryRadius);
  const roadConnSystem = new RoadConnectivitySystem(state);
  const productionSystem = new ProductionSystem(state);
  const villagerSystem = new VillagerSystem(state);
  const immigrationSystem = new ImmigrationSystem(state, { cozy: cozyThreats });
  // Phase 3: needs/happiness (AFTER production, BEFORE immigration)
  // and trader (AFTER production, to see fresh stockpiles)
  const needsHappinessSystem = new NeedsHappinessSystem(state, ticksPerDay);
  const traderSystem = new TraderSystem(state, ticksPerDay);
  // Phase 4.5: hazard systems (run AFTER needs/happiness, BEFORE immigration).
  const fireSystem = new FireSystem(state, { cozy: cozyThreats, deferUntilBuildings: deferThreatsUntilBuildings });
  const diseaseSystem = new DiseaseSystem(state, { cozy: cozyThreats, deferUntilBuildings: deferThreatsUntilBuildings });
  // Phase 4: siege systems (run AFTER population so they see fresh state).
  const raidSpawnSystem = new RaidSpawnSystem(state, terrain, { deferUntilBuildings: deferThreatsUntilBuildings });
  const raiderMovementSystem = new RaiderMovementSystem(state, terrain);
  const siegeResolutionSystem = new SiegeResolutionSystem(state, { cozy: cozyThreats });
  // Citadel 32: PvP army movement + resolution (no-op in solo — empty army list).
  const armySystem = new ArmySystem(state);
  // Phase 5: tier system (runs AFTER population and siege, so it sees the final state for the day).
  const tierSystem = new TierSystem(state);

  scheduler.stage("commands").add(commandSystem);
  scheduler.stage("clock").add(dayClock);
  scheduler.stage("clock").add(daySync);
  // Territory recompute runs BEFORE connectivity (which clears connectivityDirty).
  // Its output (p.territory / tileClaimedBy) is consumed ONLY by canBuildAt, which itself only
  // runs when enforceTerritory is true — so registering it when enforceTerritory is false would
  // be pure dead work. Gating the .add() removes that dead pass in solo (byte-identical: no
  // observable effect existed) while leaving MP (enforceTerritory: true) unchanged.
  if (enforceTerritory) {
    scheduler.stage("connectivity").add(territorySystem);
  }
  scheduler.stage("connectivity").add(roadConnSystem);
  scheduler.stage("economy").add(productionSystem);
  scheduler.stage("villagers").add(villagerSystem);
  scheduler.stage("needs").add(needsHappinessSystem);
  scheduler.stage("trader").add(traderSystem);
  // Phase 4.5: hazard stages run AFTER needs, BEFORE population/immigration.
  scheduler.stage("hazards").add(fireSystem);
  scheduler.stage("hazards").add(diseaseSystem);
  scheduler.stage("population").add(immigrationSystem);
  // Phase 4 siege stages, in dependency order: spawn → move → resolve.
  scheduler.stage("siege-spawn").add(raidSpawnSystem);
  scheduler.stage("siege-move").add(raiderMovementSystem);
  scheduler.stage("siege-resolve").add(siegeResolutionSystem);
  // Citadel 32: PvP armies resolve after PvE siege, before tier eval. Gated on enableArmy
  // (default true; the solo/cozy client passes false to freeze this already-no-op-in-solo system).
  if (enableArmy) {
    scheduler.stage("armies").add(armySystem);
  }
  // Phase 5: tier evaluation LAST — sees updated pop + defense + buildings.
  scheduler.stage("tiers").add(tierSystem);

  // ---------------------------------------------------------------------------
  // Snapshot helpers
  // ---------------------------------------------------------------------------
  function getBuildings(): readonly BuildingSnapshot[] {
    // Per-building occupancy (render/HUD): tally STATIONARY villagers onto the
    // building they're at — idle residents at their home tile, workers at their
    // workplace tile. Travelling villagers (the walk states) are on the road and
    // counted nowhere here, so Σ occupancy + in-transit == population. Build a
    // footprint tile→entityId index once, then one pass over villagers.
    const occByBuilding = new Map<number, number>();
    const tileToBuilding = new Map<number, number>();
    for (const entity of buildingWorld.query("building")) {
      if (entity.id === undefined) continue;
      const b = entity.building;
      for (let dy = 0; dy < b.h; dy++) {
        for (let dx = 0; dx < b.w; dx++) {
          const tx = b.x + dx;
          const ty = b.y + dy;
          if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) continue;
          tileToBuilding.set(ty * WORLD_WIDTH + tx, entity.id);
        }
      }
    }
    for (const entity of villagerWorld.query("villager")) {
      const v = entity.villager;
      if (isTravellingFsm(v.fsm)) continue; // on the road, not at a building
      // idle → at home; work → at workplace. (Other stationary cases fall back
      // to home so a villager is always attributed somewhere it's standing.)
      const at = v.fsm === "work" ? { x: v.workX, y: v.workY } : { x: v.homeX, y: v.homeY };
      const bid = tileToBuilding.get(at.y * WORLD_WIDTH + at.x);
      if (bid === undefined) continue;
      occByBuilding.set(bid, (occByBuilding.get(bid) ?? 0) + 1);
    }

    const result: BuildingSnapshot[] = [];
    for (const entity of buildingWorld.query("building")) {
      const b = entity.building;
      const rs = entity.id !== undefined ? state.buildingState.get(entity.id) : undefined;
      const owner = playerById(state, b.ownerId);
      const fs = entity.id !== undefined ? owner?.fireState.get(entity.id) : undefined;
      result.push({
        type: b.type,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        ownerId: b.ownerId,
        connected: rs?.connected ?? false,
        outputBuffer: rs?.outputBuffer ?? 0,
        workerCount: rs?.workerCount ?? 0,
        occupancy: entity.id !== undefined ? occByBuilding.get(entity.id) ?? 0 : 0,
        // Phase 4.5: fire state
        onFire: fs?.burning ?? false,
        burning: fs?.burning ?? false,
        // Citadel 08: upgrade level
        level: rs?.level ?? 1,
        // Phase A cozy pivot: per-house diegetic signal
        lacksFaith: rs?.lacksFaith ?? true,
        lacksSafety: rs?.lacksSafety ?? true,
        lacksGoods: rs?.lacksGoods ?? true,
        mood: rs?.mood ?? 40,
        // Brief 100: is this producer sustainedly well-served (earning the output
        // bonus)? Render-only; the sim never reads it back. `false` for anything that
        // isn't a staffed producer, so the cue can only ever appear on a building the
        // bonus actually applies to.
        wellServed: (rs?.serviceEma ?? 0) > SERVICE_BONUS_BAND && (rs?.workerCount ?? 0) > 0,
      });
    }
    return result;
  }

  function getVillagers(): readonly VillagerSnapshot[] {
    // Read-only job derivation: an assigned villager's workX/workY is the centre
    // tile of the workplace the VillagerSystem staffed it to. Index every
    // building footprint tile → its type once, then look up each villager's
    // workplace type. An `idle` villager has no current workplace → "idle".
    // This is a pure projection; no sim state is mutated.
    // Phase E: a PARALLEL index footprint tile → building ENTITY ID lets us look
    // up a villager's HOME house runtime mood (Phase A per-house `mood`). Built in
    // the same pass with the exact same bounds checks + key as `tileToType`.
    const tileToType = new Map<number, string>();
    const tileToBuildingId = new Map<number, number>();
    for (const entity of buildingWorld.query("building")) {
      const b = entity.building;
      for (let dy = 0; dy < b.h; dy++) {
        for (let dx = 0; dx < b.w; dx++) {
          const tx = b.x + dx;
          const ty = b.y + dy;
          if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) continue;
          tileToType.set(ty * WORLD_WIDTH + tx, b.type);
          if (entity.id !== undefined) tileToBuildingId.set(ty * WORLD_WIDTH + tx, entity.id);
        }
      }
    }
    const result: VillagerSnapshot[] = [];
    for (const entity of villagerWorld.query("villager")) {
      const v = entity.villager;
      const pos = villagerPos(v);
      const workType = v.fsm === "idle" ? undefined : tileToType.get(v.workY * WORLD_WIDTH + v.workX);
      const job = workType === undefined ? JOB_IDLE : jobForBuildingType(workType);
      // Phase E: mood from the HOME house's per-house runtime mood; default 40
      // (neutral seed) for a villager whose home tile resolves to no building.
      const homeBid = tileToBuildingId.get(v.homeY * WORLD_WIDTH + v.homeX);
      const mood = (homeBid !== undefined ? state.buildingState.get(homeBid)?.mood : undefined) ?? 40;
      result.push({ id: v.id, x: pos.x, y: pos.y, fsm: v.fsm, carryGood: v.carryGood, job, mood });
    }
    return result;
  }

  function getSnapshot(tick = 0): RenderSnapshot {
    // Citadel 28: the snapshot shows the LOCAL player's view (solo = player 0).
    // A later brief (36) adds a per-player roster; the top-level fields stay the
    // local player's so the existing HUD + headless digest are unchanged.
    const lp = localPlayer(state);
    const stock: Record<string, number> = {};
    for (const k of Object.keys(lp.stockpiles) as GoodType[]) stock[k] = lp.stockpiles[k];
    // citadel-38 P2#13: count the keep/raid ANCHOR, not just any isKeep type — the MP anchor
    // is `town-hall` (also isKeep), so a literal "keep" string match made MP players see "no
    // keep" even with a standing town-hall. `actsAsKeepAnchor` also excludes a SOLO town-hall
    // (civic-only, cozy-pivot) so a placed civic hall doesn't falsely report "Keep: standing".
    let keepPresent = false;
    for (const entity of buildingWorld.query("building")) {
      if (entity.building.ownerId === lp.id && actsAsKeepAnchor(entity.building.type)) {
        keepPresent = true;
        break;
      }
    }
    const nextRaidDay = lp.nextRaidTick < 0 ? -1 : Math.floor(lp.nextRaidTick / state.ticksPerDay);
    // Phase F (motivation): compute over the SAME buildings the snapshot exposes,
    // reading the SAME per-house `lacks*` flags. A house is "covered" when it lacks
    // none of faith/safety/goods; "no houses owned" ⇒ not content (false).
    const buildings = getBuildings();
    let ownedHouses = 0;
    let coveredHouses = 0;
    for (const b of buildings) {
      if (b.type !== "house" || b.ownerId !== lp.id) continue;
      ownedHouses++;
      if (!b.lacksFaith && !b.lacksSafety && !b.lacksGoods) coveredHouses++;
    }
    const allHomesCovered = ownedHouses > 0 && coveredHouses === ownedHouses;
    return {
      tick,
      localPlayerId: lp.id,
      // Citadel 97/13: pacing/authority defaults. `getSnapshot` is transport-agnostic and
      // knows nothing of hosts or wall-clock pacing, so it emits the headless/solo defaults —
      // the local player is trivially the host, running at 1× and unpaused. The server host
      // (per-peer) and the solo Worker OVERRIDE isHost/speed/paused with their authoritative
      // values before sending; nothing reads these off a directly-driven headless snapshot.
      isHost: true,
      day: dayClock.day,
      season: getSeason(dayClock.day, DAYS_PER_YEAR),
      speed: 1,
      paused: false,
      buildings,
      villagers: getVillagers(),
      stockpiles: stock,
      population: lp.population,
      popCap: lp.popCap,
      foodSurplus: lp.foodSurplus,
      gameOver: lp.gameOver,
      recentEvents: [...state.events],
      eventsSeq: state.eventsSeq,
      // Phase 3
      happiness: lp.happiness,
      faithCoverage: lp.faithCoverage,
      safetyCoverage: lp.safetyCoverage,
      goodsCoverage: lp.goodsCoverage,
      activeDecrees: [...lp.activeDecrees],
      traderPresent: lp.traderPresent,
      traderOffers: [...lp.traderOffers],
      // Phase 4
      raiders: lp.raiders.map((r) => ({ id: r.id, x: r.x, y: r.y, strength: r.strength })),
      // Citadel 32: in-flight PvP armies (global; empty in solo)
      armies: state.armies.map((a) => ({
        id: a.id, x: a.x, y: a.y, strength: a.strength,
        attackerId: a.attackerId, targetPlayerId: a.targetPlayerId,
      })),
      threatLevel: lp.threatLevel,
      nextRaidDay,
      defensiveStrength: lp.defensiveStrength,
      keepPresent,
      keepSacked: lp.keepSacked,
      // Phase 4.5: hazards
      sickVillagers: lp.sickVillagers,
      outbreakActive: lp.outbreakActive,
      activeFires: countActiveFires(state),
      // Phase 5: tier — `tier` is the current (display) tier; `peakTier` is the
      // high-water mark the client gates build/upgrade buttons on (audit 38 P2#11).
      tier: lp.tier,
      peakTier: lp.peakTier,
      // Citadel 09: relief reserve total (tithe payoff buffer)
      reliefReserve: totalGoods(lp.reliefReserve),
      // Phase F (motivation): every owned home has all three needs met (≥1 house)
      allHomesCovered,
    };
  }

  // ---------------------------------------------------------------------------
  // Cozy cold-open: pre-seed a connected "alive core" (opt-in via seedTown).
  // ---------------------------------------------------------------------------
  // Places a compact, road-connected bread chain (farm→mill→bakery) plus a house
  // and a storehouse at (near) the map center, BEFORE the scheduler runs its
  // first tick. Placed via the same placeOne funnel as player commands, but with
  // charge=false (a gift, not a purchase) and NOT logged (it's not a player
  // command — loadFromSave re-seeds by threading seedTown into the fresh
  // bootstrap, so logging it would double-apply on replay). Deterministic: the
  // layout is a fixed sequence and the placement origin is searched outward from
  // center over the (deterministic) terrain — no RNG. Because the flag defaults
  // off, this moves NO baseline (empty-world bootstrap is byte-identical).
  // (Invoked below, after its const-scoped layout helpers are initialized.)

  /**
   * The relative footprint layout of the alive core, anchored at a cluster
   * top-left (ax, ay). A horizontal road spine at the middle row links every
   * building: each building has a footprint tile 4-adjacent to the spine, and the
   * storehouse footprint touches the spine (it is the connectivity flood seed), so
   * one connectivity pass marks the whole cluster connected.
   *
   *   rows ay..ay+2   : farm(3×3) | mill(2×2) | bakery(2×2) | house(2×2)  (bottoms on ay+2)
   *   row  ay+3       : road spine, columns ax..ax+11
   *   rows ay+4..ay+5 : storehouse(3×2) at ax
   *
   * Bounding box: 12 wide (cols ax..ax+11) × 6 tall (rows ay..ay+5).
   *
   * These dims MUST equal the terrain layer's CORE_BOX_W/H — the solvability
   * guarantee validates/carves the box against those, and this layout's hardcoded
   * offsets (ax+10, ay+4/ay+5) assume exactly 12×6. Imported (not re-declared) so
   * there is ONE source of truth; the guarantee and this placement share both the
   * dims AND the box search (findCoreBox), so they can never disagree.
   */
  const SEED_CLUSTER_W = CORE_BOX_W;
  const SEED_CLUSTER_H = CORE_BOX_H;
  function seededLayout(ax: number, ay: number): {
    buildings: ReadonlyArray<{ type: string; x: number; y: number }>;
    roads: ReadonlyArray<{ x: number; y: number }>;
  } {
    const roadRow = ay + 3;
    return {
      buildings: [
        // storehouse first (the flood seed), then the bread chain + house.
        { type: "storehouse", x: ax, y: ay + 4 },
        { type: "farm", x: ax, y: ay },
        { type: "mill", x: ax + 4, y: ay + 1 },
        { type: "bakery", x: ax + 7, y: ay + 1 },
        { type: "house", x: ax + 10, y: ay + 1 },
      ],
      roads: Array.from({ length: SEED_CLUSTER_W }, (_v, i) => ({ x: ax + i, y: roadRow })),
    };
  }

  function seedFoundingTown(): void {
    // Find the core box via the SHARED terrain helper — the exact same full-grid
    // ring scan (center outward; per radius: rows top→bottom, cols left→right;
    // first-fit) that the solvability guarantee used to validate/carve the box.
    // Sharing it means the guarantee and this placement can never anchor
    // different boxes: the guarantee has already ensured a buildable box exists
    // (carving the center box if none was natural), so findCoreBox returns that
    // very box here. We read terrain directly (occupancy is empty pre-seed, so a
    // terrain-buildable box is placeable). The default 96×96 center is grass, so
    // the radius-0 probe usually wins.
    const anchor = findCoreBox(terrain.cells, terrain.width, terrain.height);
    if (anchor === null) return; // no buildable cluster anywhere (degenerate world) — leave empty.

    const layout = seededLayout(anchor.x, anchor.y);
    // Roads first so the spine exists, then the buildings hang off it. Order is
    // immaterial for connectivity (recomputed lazily) but keeps roadGrid coherent.
    // charge=false: the seed is a gift, never debited from the stockpile.
    for (const t of layout.roads) placeOne("road", t.x, t.y, false);
    for (const b of layout.buildings) placeOne(b.type, b.x, b.y, false);
  }

  // Apply the seed now that its layout helpers (const-scoped) are initialized.
  if (seedTown) seedFoundingTown();

  void pushEvent; // exported via state mutators in systems

  return {
    scheduler,
    dayClock,
    terrain,
    world: buildingWorld,
    villagerWorld,
    commands,
    /**
     * Drain + apply queued commands WITHOUT advancing the simulation.
     * Lets the host apply placements/demolitions while paused (city-builder
     * "plan while paused"): only the CommandSystem runs, so connectivity is
     * recomputed for the snapshot but no sim systems or the day clock advance.
     */
    applyCommands(ctx: SimContext): void {
      commandSystem.run(ctx);
      // Recompute connectivity so the snapshot reflects the new layout
      // (placement sets state.connectivityDirty; this is normally consumed by
      // the connectivity system inside a full tick).
      roadConnSystem.run(ctx);
    },
    getBuildings,
    getSnapshot,
    get stockpiles() {
      return localPlayer(state).stockpiles;
    },
    get population() {
      return localPlayer(state).population;
    },
    get gameOver() {
      return localPlayer(state).gameOver;
    },
    get roadGrid() {
      return state.roadGrid;
    },
    get walkable() {
      return walkable;
    },
    state,
    serializeSave(currentTick: number): CitadelSave {
      return {
        version: 1,
        seed,
        ticksPerDay,
        startDay: opts.startDay ?? 0,
        currentTick,
        commandLog: state.commandLog.map((e) => ({ tick: e.tick, command: e.command })),
        // Persist the cozy economy options so loadFromSave replays with the same rules.
        chargeBuildCost,
        cozyThreats,
        // Persist whether army resolution was enabled so replay reconstructs identical state.
        enableArmy,
        // Persist the match mode: it decides whether a town-hall anchors (actsAsKeepAnchor), and
        // placements are replayed from the command log — so replaying an MP save as solo would
        // rebuild the halls WITHOUT their keepPosition, and the raid clock with them.
        multiplayer,
        // Persist the world dimensions, or replay rebuilds the 96×96 default and silently drops
        // every command beyond tile 95 as out-of-bounds (a 256×256 MP save was unreplayable).
        worldWidth: WORLD_WIDTH,
        worldHeight: WORLD_HEIGHT,
        // Persist whether the alive-town core was seeded so replay re-seeds it identically.
        seedTown,
        // Persist the threat-defer threshold so replay applies the same gate (a cold-open
        // save was taken with defer on; replaying without it would desync).
        deferThreatsUntilBuildings,
        ...(startingStock !== undefined ? { startingStock } : {}),
      };
    },
  };
}
