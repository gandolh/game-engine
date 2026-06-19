import { Scheduler, World, CommandQueue, CommandSystem, OccupancyGrid, checkPlacement, rebuildWalkable, createRng } from "@engine/core";
import type { System, SimContext } from "@engine/core";
import type { CitadelCommand, BuildingSnapshot, VillagerSnapshot, RenderSnapshot, CitadelSave } from "./snapshot/index";
import { DayClockSystem } from "./systems/day-clock";
import { TierSystem, TIER_LOCK, tierAtLeast } from "./systems/tiers";
import { generateTerrain, isWalkable, TerrainType, WORLD_WIDTH, WORLD_HEIGHT } from "./world/terrain";
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
import type { SimState, BuildingFireState, Stockpiles } from "./sim-state";
import { emptyStockpiles, pushEvent, totalGoods } from "./sim-state";
import { RoadConnectivitySystem } from "./systems/road-connectivity";
import { ProductionSystem } from "./systems/production";
import { VillagerSystem, villagerPos } from "./systems/villager-system";
import { ImmigrationSystem } from "./systems/immigration";
import { NeedsHappinessSystem } from "./systems/needs-happiness";
import { TraderSystem } from "./systems/trader";
import { RaidSpawnSystem } from "./systems/raid-spawn";
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
    reliefReserve: emptyStockpiles(),
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
    // Phase 3: happiness + needs
    happiness: 40,
    faithCoverage: 0,
    safetyCoverage: 0,
    goodsCoverage: 0,
    activeDecrees: new Set<string>(),
    traderPresent: false,
    traderArrivalDay: -1,
    traderDepartDay: 0,
    traderOffers: [],
    // Phase 4: siege state
    wallTiles: new Set<number>(),
    gateTiles: new Set<number>(),
    threatLevel: 0,
    nextRaidTick: -1,
    raidCount: 0,
    defensiveStrength: 0,
    raiders: [],
    keepPosition: null,
    keepSacked: false,
    // Phase 4.5: hazard state
    fireState: new Map<number, BuildingFireState>(),
    sickVillagers: 0,
    outbreakActive: false,
    // Phase 5: settlement tier + command log
    tier: "Hamlet",
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
    return { outputBuffer: 0, inputBuffer: 0, workerCount: 0, connected: false, productionTick: 0, level: 1 };
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

  function placeOne(buildingType: string, x: number, y: number): boolean {
    const def = getBuildingDef(buildingType);
    if (def === undefined) return false;

    // Tier-lock: some building types are gated behind a minimum settlement tier.
    const required = TIER_LOCK[buildingType];
    if (required !== undefined && !tierAtLeast(state.tier, required)) {
      pushEvent(state, `Day ${state.day}: A ${buildingType} requires ${required} tier.`);
      return false;
    }

    const prod = getProductionDef(buildingType);
    const fp = { x, y, w: def.w, h: def.h };

    const isGate = prod?.isGate === true;

    if (isGate) {
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
      building: { type: buildingType, x, y, w: def.w, h: def.h },
    });
    if (entity.id !== undefined) {
      state.buildingState.set(entity.id, freshRuntime());
    }
    if (prod?.isRoad === true) {
      state.roadGrid[y * WORLD_WIDTH + x] = 1;
    }
    if (prod?.isHousing === true && prod.housingCapacity !== undefined) {
      // New buildings are L1 → base capacity (unchanged behavior).
      state.popCap += effectiveHousingCapacity(prod, 1);
    }
    // Phase 4: special tile tracking
    if (prod?.isGate === true) {
      state.gateTiles.add(y * WORLD_WIDTH + x);
    }
    if (prod?.isWall === true) {
      state.wallTiles.add(y * WORLD_WIDTH + x);
    }
    if (prod?.isKeep === true) {
      // Center of the 3×3 footprint.
      state.keepPosition = { x: x + Math.floor(def.w / 2), y: y + Math.floor(def.h / 2) };
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
    const { decree, active } = cmd.payload;
    if (active) {
      state.activeDecrees.add(decree);
    } else {
      state.activeDecrees.delete(decree);
    }
  });

  logged("barter", (cmd) => {
    const { offerIndex } = cmd.payload;
    if (!state.traderPresent) return;
    const offer = state.traderOffers[offerIndex];
    if (offer === undefined) return;
    const have = state.stockpiles[offer.give];
    if (have < offer.giveQty) return;
    state.stockpiles[offer.give] = have - offer.giveQty;
    // Citadel 09 — TITHE better barter terms: a well-stocked relief reserve
    // (goodwill the merchant respects) sweetens the deal by +1 received good.
    // Applied here (not in trader.ts) so the canonical offers stay clean and the
    // bonus reflects the reserve state at trade time.
    const reserveBonus =
      state.activeDecrees.has("tithe") && totalGoods(state.reliefReserve) >= RELIEF_BARTER_THRESHOLD
        ? 1
        : 0;
    const received = offer.receiveQty + reserveBonus;
    state.stockpiles[offer.receive] = state.stockpiles[offer.receive] + received;
    pushEvent(state, `Day ${state.day}: traded ${offer.giveQty} ${offer.give} for ${received} ${offer.receive}.`);
  });

  logged("demolish", (cmd) => {
    const { x, y } = cmd.payload;
    for (const entity of buildingWorld.query("building")) {
      const b = entity.building;
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
        const prod = getProductionDef(b.type);
        // Gates were never applied to occupancy; everything else was.
        if (prod?.isGate !== true) {
          occupancy.remove({ x: b.x, y: b.y, w: b.w, h: b.h });
          walkable = rebuildWalkable(WORLD_WIDTH, WORLD_HEIGHT, occupancy, buildable);
        }
        removeBuildingTiles(b.x, b.y, b.w, b.h);
        if (prod?.isRoad === true) {
          state.roadGrid[b.y * WORLD_WIDTH + b.x] = 0;
        }
        if (prod?.isHousing === true && prod.housingCapacity !== undefined) {
          // Subtract the building's level-effective capacity (read level before rs is deleted).
          const rs = entity.id !== undefined ? state.buildingState.get(entity.id) : undefined;
          state.popCap = Math.max(0, state.popCap - effectiveHousingCapacity(prod, rs?.level ?? 1));
        }
        if (prod?.isGate === true) {
          state.gateTiles.delete(b.y * WORLD_WIDTH + b.x);
        }
        if (prod?.isWall === true) {
          state.wallTiles.delete(b.y * WORLD_WIDTH + b.x);
        }
        if (prod?.isKeep === true) {
          state.keepPosition = null;
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

      const prod = getProductionDef(b.type);
      if (prod === undefined) return;
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
      if (!tierAtLeast(state.tier, reqTier)) {
        pushEvent(state, `Day ${state.day}: upgrading ${b.type} to L${nextLevel} requires ${reqTier} tier.`);
        return;
      }

      const cost = upgradeCost(b.type, nextLevel);
      // Affordability check across the global stockpile pool.
      for (const [good, qty] of Object.entries(cost)) {
        if (qty === undefined) continue;
        if (state.stockpiles[good as GoodType] < qty) {
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
        state.stockpiles[good as GoodType] -= qty;
      }

      rs.level = nextLevel;
      if (prod.isHousing === true && prod.housingCapacity !== undefined) {
        state.popCap += effectiveHousingCapacity(prod, nextLevel) - effectiveHousingCapacity(prod, level);
      }
      pushEvent(state, `Day ${state.day}: upgraded ${b.type} to L${nextLevel}.`);
      return;
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
  // Phase 5: tier system (runs AFTER population and siege, so it sees the final state for the day).
  const tierSystem = new TierSystem(state);

  scheduler.stage("commands").add(commandSystem);
  scheduler.stage("clock").add(dayClock);
  scheduler.stage("clock").add(daySync);
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
      const fs = entity.id !== undefined ? state.fireState.get(entity.id) : undefined;
      result.push({
        type: b.type,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
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
    const stock: Record<string, number> = {};
    for (const k of Object.keys(state.stockpiles) as GoodType[]) stock[k] = state.stockpiles[k];
    let keepPresent = false;
    for (const entity of buildingWorld.query("building")) {
      if (entity.building.type === "keep") { keepPresent = true; break; }
    }
    const nextRaidDay = state.nextRaidTick < 0 ? -1 : Math.floor(state.nextRaidTick / state.ticksPerDay);
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
      // Phase 3
      happiness: state.happiness,
      faithCoverage: state.faithCoverage,
      safetyCoverage: state.safetyCoverage,
      goodsCoverage: state.goodsCoverage,
      activeDecrees: [...state.activeDecrees],
      traderPresent: state.traderPresent,
      traderOffers: [...state.traderOffers],
      // Phase 4
      raiders: state.raiders.map((r) => ({ id: r.id, x: r.x, y: r.y, strength: r.strength })),
      threatLevel: state.threatLevel,
      nextRaidDay,
      defensiveStrength: state.defensiveStrength,
      keepPresent,
      keepSacked: state.keepSacked,
      // Phase 4.5: hazards
      sickVillagers: state.sickVillagers,
      outbreakActive: state.outbreakActive,
      activeFires: countActiveFires(state),
      // Phase 5: tier
      tier: state.tier,
      // Citadel 09: relief reserve total (tithe payoff buffer)
      reliefReserve: totalGoods(state.reliefReserve),
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
