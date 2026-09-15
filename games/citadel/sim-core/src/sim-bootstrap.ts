import { Scheduler, World, CommandQueue, CommandSystem, OccupancyGrid, createRng } from "@engine/core";
import type { System, SimContext } from "@engine/core";
import type { CitadelCommand, BuildingSnapshot, RenderSnapshot, CitadelSave } from "./snapshot/index";
import { DayClockSystem } from "./systems/day-clock";
import { TierSystem, tierAtLeast, unlockTier } from "./systems/tiers";
import { generateTerrain, findCoreBox, CORE_BOX_W, CORE_BOX_H, WORLD_WIDTH as DEFAULT_WORLD_WIDTH, WORLD_HEIGHT as DEFAULT_WORLD_HEIGHT } from "./world/terrain";
import type { TerrainGrid } from "./world/terrain";
import type { BuildingEntity, BuildingRuntimeState, GoodType } from "./entities/building";
import {
  getProductionDef,
  effectiveHousingCapacity,
  upgradeCost,
  BUILDING_MAX_LEVEL,
} from "./entities/building";
import type { VillagerEntity } from "./entities/villager";
import type { SimState, Stockpiles, ArmyState } from "./sim-state";
import { pushEvent, makePlayerState, localPlayer, playerById, releaseWorkersAt } from "./sim-state";
import { RoadConnectivitySystem } from "./systems/road-connectivity";
import { TerritorySystem, DEFAULT_TERRITORY_RADIUS } from "./systems/territory";
import { ProductionSystem } from "./systems/production";
import { VillagerSystem } from "./systems/villager-system";
import { ImmigrationSystem } from "./systems/immigration";
import { NeedsHappinessSystem } from "./systems/needs-happiness";
import { TraderSystem } from "./systems/trader";
import { RaidSpawnSystem, computeRaiderPath } from "./systems/raid-spawn";
import { ArmySystem } from "./systems/army";
import { RaiderMovementSystem } from "./systems/raider-movement";
import { SiegeResolutionSystem } from "./systems/siege-resolution";
import { FireSystem } from "./systems/fire-system";
import { DiseaseSystem } from "./systems/disease-system";
import {
  placeOne,
  placeDragged,
  describeReject,
  actsAsKeepAnchor,
  createPlacementContext,
  rebakeWalkable,
  removeBuildingTiles,
} from "./systems/placement";
import { getBuildings, getSnapshot } from "./snapshot-builder";

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
    buildingTiles: new Map<number, number>(),
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

  // ---------------------------------------------------------------------------
  // Placement (audit-23): validity/cost/tile-bookkeeping lives in
  // systems/placement.ts, which needs SimState + the terrain grid + the three
  // bootstrap-time option flags it branches on (chargeBuildCost / enforceTerritory
  // / multiplayer). `placementCtx.walkable` is the live walkable bake — the
  // returned sim result's `walkable` getter reads it directly (see below).
  //
  // This performs the SAME initial bake the old closure did (`buildable`-only —
  // no roads exist yet); moving it to after `state` exists doesn't change the
  // computed grid since neither `occupancy` nor `terrain` depend on `state`.
  // ---------------------------------------------------------------------------
  const placementCtx = createPlacementContext({ state, terrain, chargeBuildCost, enforceTerritory, multiplayer });

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

  logged("placeBuilding", (cmd) => {
    const r = placeOne(placementCtx, cmd.payload.buildingType, cmd.payload.x, cmd.payload.y);
    if (r !== "ok") {
      const msg = describeReject(state, cmd.payload.buildingType, r);
      if (msg !== null) pushEvent(state, msg);
    }
  });

  logged("placeRoad", (cmd) => {
    placeDragged(placementCtx, "road", cmd.payload.tiles);
  });

  logged("placeWall", (cmd) => {
    placeDragged(placementCtx, "wall", cmd.payload.tiles);
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
        removeBuildingTiles(state, b.x, b.y, b.w, b.h);
        // Clear the road/bridge tile BEFORE rebuilding walkable so a demolished
        // bridge stops reading as walkable (the "roads" predicate ORs in road tiles).
        if (prod?.isRoad === true) {
          state.roadGrid[b.y * WORLD_WIDTH + b.x] = 0;
        }
        // Gates were never applied to occupancy; everything else was.
        if (prod?.isGate !== true) {
          const freedFp = { x: b.x, y: b.y, w: b.w, h: b.h };
          occupancy.remove(freedFp);
          // audit-10: patch just the freed footprint instead of a full-grid rebuild.
          // A demolished road/bridge's road-grid cell (cleared above) is the
          // footprint's own origin tile (roads/bridges are always 1×1), so it's
          // inside freedFp too.
          rebakeWalkable(placementCtx, "roads", freedFp);
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
  // Snapshot building (audit-23): getBuildings / getVillagers / getSnapshot now
  // live in snapshot-builder.ts, taking `state` (+ `dayClock`/`multiplayer` for
  // getSnapshot) explicitly. Bound into the returned CitadelSimResult below.
  // ---------------------------------------------------------------------------

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
    for (const t of layout.roads) placeOne(placementCtx, "road", t.x, t.y, false);
    for (const b of layout.buildings) placeOne(placementCtx, b.type, b.x, b.y, false);
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
    getBuildings: () => getBuildings(state),
    getSnapshot: (tick?: number) => getSnapshot(state, dayClock, multiplayer, tick),
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
      return placementCtx.walkable;
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
