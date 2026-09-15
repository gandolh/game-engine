/**
 * Render-snapshot construction: `getBuildings` / `getVillagers` / `getSnapshot`.
 *
 * Extracted verbatim from `bootstrapSim`'s closure (audit-23), mirroring
 * `games/farm/sim-core/src/snapshot-builder/`. Everything these three read off
 * the old closure is either already on {@link SimState} (`width`/`height`/
 * `buildingWorld`/`villagerWorld`/`buildingState`/`day`/`ticksPerDay`/
 * `daysPerYear`) or threaded explicitly as a parameter (`dayClock`, the
 * bootstrap-time `multiplayer` flag `actsAsKeepAnchor` needs).
 *
 * **Behaviour is unchanged by construction**: the tile-index passes, the
 * occupancy/mood/job derivations, and every field on the returned snapshots
 * are exactly as they were inside `bootstrapSim`.
 *
 * audit-14: `getBuildings` and `getVillagers` used to each rebuild a footprint
 * tile→id `Map` from scratch every call (the `tileToBuilding` / `tileToType` +
 * `tileToBuildingId` passes this file used to have). Both now read
 * `state.buildingTiles` — a single persistent tile→building-id index
 * maintained incrementally in `systems/placement.ts` (`addBuildingTiles`/
 * `removeBuildingTiles`) and at every destroy site (army/fire/siege), see the
 * doc comment on `SimState.buildingTiles` in `sim-state.ts` for how those
 * destroy sites needed zero edits. `getVillagers` still does one O(buildings)
 * pass (not O(footprint tiles)) to map id→type, since type isn't stored
 * per-tile or on `BuildingRuntimeState`.
 */
import type { DayClockSystem } from "./systems/day-clock";
import type { BuildingSnapshot, VillagerSnapshot, RenderSnapshot } from "./snapshot/index";
import { getProductionDef, jobForBuildingType, JOB_IDLE } from "./entities/building";
import type { GoodType } from "./entities/building";
import { isTravellingFsm } from "./entities/villager";
import type { SimState } from "./sim-state";
import { localPlayer, playerById, totalGoods } from "./sim-state";
import { villagerPos } from "./systems/villager-system";
import { countActiveFires } from "./systems/fire-system";
import { SERVICE_BONUS_BAND } from "./systems/production";
import { getSeason } from "./world/seasons";
import { actsAsKeepAnchor } from "./systems/placement";

export function getBuildings(state: SimState): readonly BuildingSnapshot[] {
  // Per-building occupancy (render/HUD): tally STATIONARY villagers onto the
  // building they're at — idle residents at their home tile, workers at their
  // workplace tile. Travelling villagers (the walk states) are on the road and
  // counted nowhere here, so Σ occupancy + in-transit == population.
  // audit-14: `state.buildingTiles` is the persistent tile→building-id index
  // (see its doc comment in sim-state.ts) — one O(1) lookup per villager,
  // no per-snapshot footprint walk.
  const occByBuilding = new Map<number, number>();
  for (const entity of state.villagerWorld.query("villager")) {
    const v = entity.villager;
    if (isTravellingFsm(v.fsm)) continue; // on the road, not at a building
    // idle → at home; work → at workplace. (Other stationary cases fall back
    // to home so a villager is always attributed somewhere it's standing.)
    const at = v.fsm === "work" ? { x: v.workX, y: v.workY } : { x: v.homeX, y: v.homeY };
    const bid = state.buildingTiles.get(at.y * state.width + at.x);
    if (bid === undefined) continue;
    occByBuilding.set(bid, (occByBuilding.get(bid) ?? 0) + 1);
  }

  const result: BuildingSnapshot[] = [];
  for (const entity of state.buildingWorld.query("building")) {
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

export function getVillagers(state: SimState): readonly VillagerSnapshot[] {
  // Read-only job derivation: an assigned villager's workX/workY is the centre
  // tile of the workplace the VillagerSystem staffed it to. An `idle` villager
  // has no current workplace → "idle". This is a pure projection; no sim state
  // is mutated.
  // audit-14: `state.buildingTiles` (persistent, see sim-state.ts) gives the
  // work/home tile's building id in O(1) — no per-snapshot footprint walk.
  // Type isn't stored per-tile or on BuildingRuntimeState, so one O(buildings)
  // (not O(footprint tiles)) pass over buildingWorld builds id→type; still far
  // cheaper than the footprint-tile Map this replaced (one entry per building,
  // not one per footprint tile).
  const idToType = new Map<number, string>();
  for (const entity of state.buildingWorld.query("building")) {
    if (entity.id === undefined) continue;
    idToType.set(entity.id, entity.building.type);
  }
  const result: VillagerSnapshot[] = [];
  for (const entity of state.villagerWorld.query("villager")) {
    const v = entity.villager;
    const pos = villagerPos(v);
    const workBid = v.fsm === "idle" ? undefined : state.buildingTiles.get(v.workY * state.width + v.workX);
    const workType = workBid === undefined ? undefined : idToType.get(workBid);
    const job = workType === undefined ? JOB_IDLE : jobForBuildingType(workType);
    // Phase E: mood from the HOME house's per-house runtime mood; default 40
    // (neutral seed) for a villager whose home tile resolves to no building.
    const homeBid = state.buildingTiles.get(v.homeY * state.width + v.homeX);
    const mood = (homeBid !== undefined ? state.buildingState.get(homeBid)?.mood : undefined) ?? 40;
    result.push({ id: v.id, x: pos.x, y: pos.y, fsm: v.fsm, carryGood: v.carryGood, job, mood });
  }
  return result;
}

/**
 * Full render snapshot for the current tick.
 *
 * @param dayClock - the bootstrap's `DayClockSystem` instance. Read directly
 *   (not via `state.day`, which `DaySyncSystem` only mirrors during a
 *   scheduler tick) so a snapshot taken outside a tick — e.g. right after
 *   bootstrap, or after `applyCommands` — matches the original closure's
 *   behavior exactly.
 * @param multiplayer - the bootstrap-time match-mode flag `actsAsKeepAnchor`
 *   branches on (NOT a live `players.length`; see its doc comment).
 */
export function getSnapshot(state: SimState, dayClock: DayClockSystem, multiplayer: boolean, tick = 0): RenderSnapshot {
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
  for (const entity of state.buildingWorld.query("building")) {
    if (entity.building.ownerId === lp.id && actsAsKeepAnchor(entity.building.type, multiplayer)) {
      keepPresent = true;
      break;
    }
  }
  const nextRaidDay = lp.nextRaidTick < 0 ? -1 : Math.floor(lp.nextRaidTick / state.ticksPerDay);
  // Phase F (motivation): compute over the SAME buildings the snapshot exposes,
  // reading the SAME per-house `lacks*` flags. A house is "covered" when it lacks
  // none of faith/safety/goods; "no houses owned" ⇒ not content (false).
  const buildings = getBuildings(state);
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
    season: getSeason(dayClock.day, state.daysPerYear),
    speed: 1,
    paused: false,
    buildings,
    villagers: getVillagers(state),
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
