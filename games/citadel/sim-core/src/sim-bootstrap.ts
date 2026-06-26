import { Scheduler, World, CommandQueue, CommandSystem, OccupancyGrid, checkPlacement, rebuildWalkable, createRng } from "@engine/core";
import type { System, SimContext } from "@engine/core";
import type { CitadelCommand, BuildingSnapshot, VillagerSnapshot, RenderSnapshot, CitadelSave } from "./snapshot/index";
import { DayClockSystem } from "./systems/day-clock";
import { TierSystem, TIER_LOCK, tierAtLeast } from "./systems/tiers";
import { generateTerrain, isWalkable, TerrainType, WORLD_WIDTH as DEFAULT_WORLD_WIDTH, WORLD_HEIGHT as DEFAULT_WORLD_HEIGHT } from "./world/terrain";
import type { TerrainGrid } from "./world/terrain";
import type { BuildingEntity, BuildingRuntimeState, GoodType } from "./entities/building";
import {
  getBuildingDef,
  getProductionDef,
  effectiveHousingCapacity,
  upgradeCost,
  BUILDING_MAX_LEVEL,
} from "./entities/building";
import type { VillagerEntity } from "./entities/villager";
import type { SimState, Stockpiles, ArmyState } from "./sim-state";
import { pushEvent, totalGoods, makePlayerState, localPlayer, playerById } from "./sim-state";
import { RoadConnectivitySystem } from "./systems/road-connectivity";
import { TerritorySystem, canBuildAt, DEFAULT_TERRITORY_RADIUS } from "./systems/territory";
import { ProductionSystem } from "./systems/production";
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
  maxDays: number;
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
}

const DAYS_PER_YEAR = 16;

/** Citadel 09: relief reserve total-goods threshold above which the tithe sweetens barter. */
const RELIEF_BARTER_THRESHOLD = 20;

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
  const maxDays = Math.ceil(save.currentTick / save.ticksPerDay) + 10;
  const sim = bootstrapSim({
    seed: save.seed,
    ticksPerDay: save.ticksPerDay,
    maxDays,
    startDay: save.startDay,
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
    return { outputBuffer: 0, workerCount: 0, connected: false, productionTick: 0, level: 1 };
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

  function placeOne(buildingType: string, x: number, y: number): boolean {
    // A road dragged onto water becomes a bridge (a walkable span). This is the
    // ONLY way bridges are created, so a "road" command across a river auto-decks
    // the water tiles and lays plain road on the land tiles. (A bridge command
    // off-water falls through to the normal water/occupancy rejection below.)
    if (buildingType === "road" && isWaterTile(x, y)) buildingType = "bridge";

    const def = getBuildingDef(buildingType);
    if (def === undefined) return false;

    // Citadel 28: solo commands act on the local player. (Brief 35 will route
    // each command to its sender's player; for now there is one writer.)
    const lp = localPlayer(state);

    // Tier-lock: some building types are gated behind a minimum settlement tier.
    const required = TIER_LOCK[buildingType];
    if (required !== undefined && !tierAtLeast(lp.tier, required)) {
      pushEvent(state, `Day ${state.day}: A ${buildingType} requires ${required} tier.`);
      return false;
    }

    // Citadel 30: territory build-gating (MP). Place only within your territory
    // ∪ adjacent-unclaimed; never into a rival's claim. Off in solo.
    if (enforceTerritory && !canBuildAt(state, lp, x, y, def.w, def.h)) {
      pushEvent(state, `Day ${state.day}: can't build a ${buildingType} there — outside your territory.`);
      return false;
    }

    const prod = getProductionDef(buildingType);
    const fp = { x, y, w: def.w, h: def.h };

    const isGate = prod?.isGate === true;
    const isBridge = prod?.isBridge === true;

    if (isBridge) {
      // A bridge decks exactly one water tile. It must BE water (else it would
      // just be a road), and must not overlap any existing building/road/bridge
      // footprint — bridges cannot overlap.
      if (!isWaterTile(x, y)) return false;
      if (occupancy.isOccupied(x, y)) return false;
      if (state.buildingTiles.has(y * WORLD_WIDTH + x)) return false;
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
          if (tx < 0 || ty < 0 || tx >= WORLD_WIDTH || ty >= WORLD_HEIGHT) return false;
          if (!buildable(tx, ty)) return false;
          // Can't place a gate on an already-occupied tile.
          if (state.buildingTiles.has(ty * WORLD_WIDTH + tx)) return false;
        }
      }
    } else {
      const result = checkPlacement(fp, occupancy, buildable);
      if (!result.valid) return false;

      // Terrain requirement (forest / stone): at least one footprint tile matches.
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
      if (prod?.terrainReq === "stone") {
        let onStone = false;
        for (let dy = 0; dy < def.h && !onStone; dy++) {
          for (let dx = 0; dx < def.w; dx++) {
            const t = terrain.cells[(y + dy) * WORLD_WIDTH + (x + dx)];
            if (t === TerrainType.Stone) { onStone = true; break; }
          }
        }
        if (!onStone) return false;
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
    if (prod?.isKeep === true) {
      // Center of the 3×3 footprint.
      lp.keepPosition = { x: x + Math.floor(def.w / 2), y: y + Math.floor(def.h / 2) };
    }
    state.connectivityDirty = true;
    return true;
  }

  logged("placeBuilding", (cmd) => {
    placeOne(cmd.payload.buildingType, cmd.payload.x, cmd.payload.y);
  });

  logged("placeRoad", (cmd) => {
    for (const tile of cmd.payload.tiles) {
      placeOne("road", tile.x, tile.y);
    }
  });

  logged("placeWall", (cmd) => {
    for (const tile of cmd.payload.tiles) {
      placeOne("wall", tile.x, tile.y);
    }
  });

  logged("setDecree", (cmd) => {
    const lp = localPlayer(state);
    const { decree, active } = cmd.payload;
    if (active) {
      lp.activeDecrees.add(decree);
    } else {
      lp.activeDecrees.delete(decree);
    }
  });

  logged("barter", (cmd) => {
    const lp = localPlayer(state);
    const { offerIndex } = cmd.payload;
    if (!lp.traderPresent) return;
    const offer = lp.traderOffers[offerIndex];
    if (offer === undefined) return;
    const have = lp.stockpiles[offer.give];
    if (have < offer.giveQty) return;
    lp.stockpiles[offer.give] = have - offer.giveQty;
    // Citadel 09 — TITHE better barter terms: a well-stocked relief reserve
    // (goodwill the merchant respects) sweetens the deal by +1 received good.
    // Applied here (not in trader.ts) so the canonical offers stay clean and the
    // bonus reflects the reserve state at trade time.
    const reserveBonus =
      lp.activeDecrees.has("tithe") && totalGoods(lp.reliefReserve) >= RELIEF_BARTER_THRESHOLD
        ? 1
        : 0;
    const received = offer.receiveQty + reserveBonus;
    lp.stockpiles[offer.receive] = lp.stockpiles[offer.receive] + received;
    pushEvent(state, `Day ${state.day}: traded ${offer.giveQty} ${offer.give} for ${received} ${offer.receive}.`);
  });

  logged("demolish", (cmd) => {
    const { x, y } = cmd.payload;
    for (const entity of buildingWorld.query("building")) {
      const b = entity.building;
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
        // MP authority (citadel-38 P0#1): only the OWNER may raze a building.
        // Without this any peer could demolish a rival's town-hall = instant
        // elimination. Solo is unaffected (sender == owner always).
        if (b.ownerId !== localPlayer(state).id) return;
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

      // MP authority (citadel-38 P0#2): only the OWNER may upgrade — otherwise a
      // peer drains the *victim's* stockpiles to mutate the victim's building.
      // Solo is unaffected (sender == owner always).
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
      if (!tierAtLeast(owner.tier, reqTier)) {
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
  // Solo never issues this; in MP brief 35 routes it to the sending player.
  logged("launchAttack", (cmd) => {
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
  const immigrationSystem = new ImmigrationSystem(state);
  // Phase 3: needs/happiness (AFTER production, BEFORE immigration)
  // and trader (AFTER production, to see fresh stockpiles)
  const needsHappinessSystem = new NeedsHappinessSystem(state, ticksPerDay);
  const traderSystem = new TraderSystem(state, ticksPerDay);
  // Phase 4.5: hazard systems (run AFTER needs/happiness, BEFORE immigration).
  const fireSystem = new FireSystem(state);
  const diseaseSystem = new DiseaseSystem(state);
  // Phase 4: siege systems (run AFTER population so they see fresh state).
  const raidSpawnSystem = new RaidSpawnSystem(state, terrain);
  const raiderMovementSystem = new RaiderMovementSystem(state, terrain);
  const siegeResolutionSystem = new SiegeResolutionSystem(state);
  // Citadel 32: PvP army movement + resolution (no-op in solo — empty army list).
  const armySystem = new ArmySystem(state);
  // Phase 5: tier system (runs AFTER population and siege, so it sees the final state for the day).
  const tierSystem = new TierSystem(state);

  scheduler.stage("commands").add(commandSystem);
  scheduler.stage("clock").add(dayClock);
  scheduler.stage("clock").add(daySync);
  // Territory recompute runs BEFORE connectivity (which clears connectivityDirty).
  scheduler.stage("connectivity").add(territorySystem);
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
  // Citadel 32: PvP armies resolve after PvE siege, before tier eval.
  scheduler.stage("armies").add(armySystem);
  // Phase 5: tier evaluation LAST — sees updated pop + defense + buildings.
  scheduler.stage("tiers").add(tierSystem);

  // ---------------------------------------------------------------------------
  // Snapshot helpers
  // ---------------------------------------------------------------------------
  function getBuildings(): readonly BuildingSnapshot[] {
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
        // Phase 4.5: fire state
        onFire: fs?.burning ?? false,
        burning: fs?.burning ?? false,
        // Citadel 08: upgrade level
        level: rs?.level ?? 1,
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
    // Citadel 28: the snapshot shows the LOCAL player's view (solo = player 0).
    // A later brief (36) adds a per-player roster; the top-level fields stay the
    // local player's so the existing HUD + headless digest are unchanged.
    const lp = localPlayer(state);
    const stock: Record<string, number> = {};
    for (const k of Object.keys(lp.stockpiles) as GoodType[]) stock[k] = lp.stockpiles[k];
    // citadel-38 P2#13: test the production def's isKeep, not the literal "keep"
    // type — the MP anchor is `town-hall` (also isKeep), so the old string match made
    // every MP player see "no keep" even with a standing town-hall.
    let keepPresent = false;
    for (const entity of buildingWorld.query("building")) {
      if (entity.building.ownerId === lp.id && getProductionDef(entity.building.type)?.isKeep === true) {
        keepPresent = true;
        break;
      }
    }
    const nextRaidDay = lp.nextRaidTick < 0 ? -1 : Math.floor(lp.nextRaidTick / state.ticksPerDay);
    return {
      tick,
      day: dayClock.day,
      season: getSeason(dayClock.day, DAYS_PER_YEAR),
      speed: 1,
      buildings: getBuildings(),
      villagers: getVillagers(),
      stockpiles: stock,
      population: lp.population,
      popCap: lp.popCap,
      foodSurplus: lp.foodSurplus,
      gameOver: lp.gameOver,
      recentEvents: [...state.events],
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
      // Phase 5: tier
      tier: lp.tier,
      // Citadel 09: relief reserve total (tithe payoff buffer)
      reliefReserve: totalGoods(lp.reliefReserve),
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
      };
    },
  };
}
