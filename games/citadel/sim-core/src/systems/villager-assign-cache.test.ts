/**
 * Audit-09 — mandatory equivalence gate for VillagerSystem's candidate cache.
 *
 * `assign()`/`tryAssignPass()` used to do a fresh `buildingWorld.query("building")`
 * scan (every road tile included) for `staffedTypes`, then 8 tiers x 2 passes each
 * its own full scan — ~17 scans per idle villager per tick. This spec replaces that
 * with a candidate cache bucketed by `[wantGoods, wantPrimary]`, invalidated on a
 * building-count watermark (mirrors FireSystem's FireDailyIndex, commit 892844e),
 * plus a once-per-sim-day backoff on villagers who fail to place.
 *
 * "The same villager must get the same job, from the same tier, in the same
 * order" is the acceptance bar. This file pins that with a real oracle: `oldAssign`
 * below is a VERBATIM copy of the pre-audit-09 `assign`/`tryAssignPass`/`firstStore`
 * (full O(B) rescan every call, no cache, no backoff) kept ONLY as a reference
 * implementation here — never touched by production code. Two structurally
 * identical scenarios (same seed, same scripted construction, so bit-identical
 * initial state) are driven one tick by the OLD reference and by the REAL
 * (cached) `VillagerSystem.assign`, processing every idle villager in the exact
 * same `villagerWorld` order; the two decision logs must match element-for-element.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import type { CitadelSimResult } from "../sim-bootstrap";
import { playerById } from "../sim-state";
import type { SimState, PlayerState } from "../sim-state";
import { getProductionDef } from "../entities/building";
import type { BuildingRuntimeState, GoodType } from "../entities/building";
import type { VillagerComponent } from "../entities/villager";
import { VillagerSystem } from "./villager-system";

const SEED = 0x51a55;
const TICKS_PER_DAY = 20;

// ---------------------------------------------------------------------------
// Scenario construction — identical, deterministic, no RNG. Called twice (once
// per sim instance) so both instances start bit-identical.
// ---------------------------------------------------------------------------

function addBuilding(
  state: SimState,
  type: string,
  x: number,
  y: number,
  w = 2,
  h = 2,
  ownerId = 0,
): number {
  const entity = state.buildingWorld.spawn({ building: { type, x, y, w, h, ownerId } });
  const rs: BuildingRuntimeState = {
    outputBuffer: 0,
    workerCount: 0,
    connected: true, // we never run ConnectivitySystem here
    productionTick: 0,
    level: 1,
  };
  state.buildingState.set(entity.id!, rs);
  return entity.id!;
}

function addIdleVillager(state: SimState, homeX: number, homeY: number, ownerId = 0): VillagerComponent {
  const v: VillagerComponent = {
    id: state.nextVillagerId++,
    ownerId,
    homeX,
    homeY,
    workX: 0,
    workY: 0,
    storeX: 0,
    storeY: 0,
    fsm: "idle",
    pathX: [],
    pathY: [],
    pathStep: 0,
    carryGood: null,
    carryAmount: 0,
    ticksAtWork: 0,
  };
  state.villagerWorld.spawn({ villager: v });
  return v;
}

/**
 * Builds a scenario deliberately exercising: a tie between two same-type,
 * both-unstaffed candidates (first-spawned must win — the tie-break argument);
 * a goods-CONVERTER-unstaffed tier (mill) that must win over a nearer
 * goods-PRIMARY-already-staffed tier (farmB) purely on tier priority, not
 * distance; goods dominance over an even-nearer SERVICE candidate (chapel);
 * and a final villager for whom every candidate is exhausted (stays idle).
 * Also sprinkles filler "road" entities (workerSlots=0, so never candidates)
 * to mirror the production shape (buildingWorld holds one entity per road tile).
 */
function buildScenario(): { sim: CitadelSimResult; farmAId: number; farmBId: number; millId: number; chapelId: number } {
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, worldWidth: 96, worldHeight: 96 });
  const state = sim.state;

  // Filler road tiles — never candidates (workerSlots=0), just inflate B.
  for (let i = 0; i < 15; i++) addBuilding(state, "road", 60 + i, 60, 1, 1);

  const farmAId = addBuilding(state, "farm", 10, 10); // centre (11,11)
  const farmBId = addBuilding(state, "farm", 30, 10); // centre (31,11)
  const millId = addBuilding(state, "mill", 10, 30); // centre (11,31)
  const chapelId = addBuilding(state, "chapel", 30, 30); // centre (31,31)
  addBuilding(state, "storehouse", 50, 50); // workerSlots 0 — not a candidate

  // vTie: equidistant (10) from farmA and farmB while BOTH are unstaffed —
  // the tier-1 (goods, primary, unstaffed) tie-break must pick farmA (spawned
  // first) in both the old and new logic.
  addIdleVillager(state, 21, 11);
  // v2: much closer to farmB (dist 2) than to mill (dist 38), but once farmA
  // is staffed above, "farm" is a staffed type — so farmB only qualifies for
  // tier 3 (goods, primary, ALREADY staffed), while mill still qualifies for
  // tier 2 (goods, CONVERTER, unstaffed), which outranks tier 3 regardless of
  // distance. v2 must get the mill, not the nearer farmB.
  addIdleVillager(state, 29, 11);
  // v3: near chapel (dist 2), but goods tiers (1-4) always outrank service
  // tiers (5-8) — farmB (tier 3, now the only open goods slot) must win over
  // the much-nearer chapel (tier 5).
  addIdleVillager(state, 29, 31);
  // v4: near chapel (dist 2); by now every goods slot (farmA, farmB, mill) is
  // full, so chapel (tier 5, service primary unstaffed) is the only option.
  addIdleVillager(state, 33, 31);
  // v5: near chapel too, but chapel is now full and nothing else is open —
  // must fail (stay idle).
  addIdleVillager(state, 33, 29);

  return { sim, farmAId, farmBId, millId, chapelId };
}

// ---------------------------------------------------------------------------
// Oracle: a VERBATIM copy of the pre-audit-09 assign()/tryAssignPass()/
// firstStore() — full O(B) rescan every call, no cache, no backoff. Kept only
// as a reference here; production code never calls these.
// ---------------------------------------------------------------------------

const OLD_GLUT_WORKER_DAYS = 8;

function oldFirstStore(state: SimState, ownerId: number): { x: number; y: number } | null {
  for (const entity of state.buildingWorld.query("building")) {
    if (entity.building.ownerId !== ownerId) continue;
    const def = getProductionDef(entity.building.type);
    if (def?.isStorage === true) {
      const b = entity.building;
      return { x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) };
    }
  }
  return null;
}

function oldTryAssignPass(
  state: SimState,
  v: VillagerComponent,
  staffedTypes: Set<string>,
  tiers: ReadonlyArray<readonly [boolean, boolean, boolean]>,
  owner: PlayerState | undefined,
  skipGlut: boolean,
): boolean {
  for (const [wantGoods, wantPrimary, wantUnstaffedType] of tiers) {
    let best: { id: number; x: number; y: number; w: number; h: number } | null = null;
    let bestDist = Infinity;
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== v.ownerId) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const rs = state.buildingState.get(id);
      if (rs === undefined || !rs.connected) continue;
      const def = getProductionDef(entity.building.type);
      if (def === undefined || def.workerSlots <= 0) continue;
      if (rs.workerCount >= def.workerSlots) continue;
      const producesGoods = def.outputGood !== undefined || def.inputGood !== undefined;
      if (wantGoods !== producesGoods) continue;
      const isPrimary = def.inputGood === undefined;
      if (wantPrimary !== isPrimary) continue;
      const typeStaffed = staffedTypes.has(entity.building.type);
      if (wantUnstaffedType !== !typeStaffed) continue;
      if (
        skipGlut &&
        typeStaffed &&
        def.outputGood !== undefined &&
        owner !== undefined &&
        owner.stockpiles[def.outputGood] >= OLD_GLUT_WORKER_DAYS * Math.max(1, owner.population)
      ) {
        continue;
      }
      const b = entity.building;
      const cx = b.x + Math.floor(b.w / 2);
      const cy = b.y + Math.floor(b.h / 2);
      const d = Math.abs(cx - v.homeX) + Math.abs(cy - v.homeY);
      if (d < bestDist) {
        bestDist = d;
        best = { id, x: b.x, y: b.y, w: b.w, h: b.h };
      }
    }
    if (best !== null) {
      const rs = state.buildingState.get(best.id);
      if (rs === undefined) return false;
      rs.workerCount++;
      v.workX = best.x + Math.floor(best.w / 2);
      v.workY = best.y + Math.floor(best.h / 2);
      const store = oldFirstStore(state, v.ownerId);
      if (store !== null) {
        v.storeX = store.x;
        v.storeY = store.y;
      } else {
        v.storeX = v.workX;
        v.storeY = v.workY;
      }
      // Old code also planned a BFS path + set fsm; irrelevant to which
      // building/order was picked, so the oracle skips it (path/fsm aren't
      // part of the compared log below).
      return true;
    }
  }
  return false;
}

function oldAssign(state: SimState, v: VillagerComponent): boolean {
  const staffedTypes = new Set<string>();
  for (const entity of state.buildingWorld.query("building")) {
    if (entity.building.ownerId !== v.ownerId) continue;
    const id = entity.id;
    if (id === undefined) continue;
    const rs = state.buildingState.get(id);
    if (rs !== undefined && rs.workerCount > 0) staffedTypes.add(entity.building.type);
  }
  const tiers: Array<[boolean, boolean, boolean]> = [
    [true, true, true],
    [true, false, true],
    [true, true, false],
    [true, false, false],
    [false, true, true],
    [false, false, true],
    [false, true, false],
    [false, false, false],
  ];
  const owner = playerById(state, v.ownerId);
  if (oldTryAssignPass(state, v, staffedTypes, tiers, owner, true)) return true;
  return oldTryAssignPass(state, v, staffedTypes, tiers, owner, false);
}

// ---------------------------------------------------------------------------
// Drive every idle villager (in villagerWorld order) through a given assign
// function, recording the decision log.
// ---------------------------------------------------------------------------

interface AssignLogEntry {
  readonly id: number;
  readonly assigned: boolean;
  readonly workX: number;
  readonly workY: number;
  readonly storeX: number;
  readonly storeY: number;
}

function runAllIdle(state: SimState, assignFn: (v: VillagerComponent) => boolean): AssignLogEntry[] {
  const log: AssignLogEntry[] = [];
  for (const entity of state.villagerWorld.query("villager")) {
    const v = entity.villager;
    if (v.fsm !== "idle") continue;
    const assigned = assignFn(v);
    log.push({ id: v.id, assigned, workX: v.workX, workY: v.workY, storeX: v.storeX, storeY: v.storeY });
  }
  return log;
}

describe("audit-09 — VillagerSystem candidate cache equivalence", () => {
  it("produces IDENTICAL assignments in IDENTICAL order to the old uncached scan", () => {
    const oldScenario = buildScenario();
    const newScenario = buildScenario();

    // OLD reference: full O(B) rescan every call, no cache, no backoff.
    const oldLog = runAllIdle(oldScenario.sim.state, (v) => oldAssign(oldScenario.sim.state, v));

    // NEW: the real (cached) VillagerSystem.assign, called directly (bypassing
    // step()'s backoff gate, which is irrelevant here — every villager below
    // is on its very FIRST attempt, so backoff never gates a first try; see
    // the separate backoff test below for that half of the spec).
    const sys = new VillagerSystem(newScenario.sim.state);
    const assignDirect = (sys as unknown as { assign: (v: VillagerComponent) => boolean }).assign.bind(sys);
    const newLog = runAllIdle(newScenario.sim.state, assignDirect);

    expect(newLog).toEqual(oldLog);
    // Sanity: the scenario actually exercised what it claims to (5 villagers,
    // 4 assigned, 1 left idle — the exhausted case).
    expect(oldLog).toHaveLength(5);
    expect(oldLog.filter((e) => e.assigned)).toHaveLength(4);
    expect(oldLog.filter((e) => !e.assigned)).toHaveLength(1);

    // Extra sanity beyond the log: final workerCount per building matches too.
    for (const id of [oldScenario.farmAId, oldScenario.farmBId, oldScenario.millId, oldScenario.chapelId]) {
      const oldRs = oldScenario.sim.state.buildingState.get(id);
      const newRs = newScenario.sim.state.buildingState.get(id);
      expect(newRs?.workerCount).toBe(oldRs?.workerCount);
    }

    // And explicitly confirm the tier-priority-over-distance claims the
    // scenario was built to exercise (belt-and-suspenders on top of the
    // log-equality check above).
    const byId = new Map(newLog.map((e) => [e.id, e]));
    const [vTie, v2, v3, v4, v5] = [...newScenario.sim.state.villagerWorld.query("villager")].map((e) => e.villager.id);
    expect(byId.get(vTie!)).toMatchObject({ workX: 11, workY: 11 }); // farmA (tie, first-spawned)
    expect(byId.get(v2!)).toMatchObject({ workX: 11, workY: 31 }); // mill, not the nearer farmB
    expect(byId.get(v3!)).toMatchObject({ workX: 31, workY: 11 }); // farmB, not the nearer chapel
    expect(byId.get(v4!)).toMatchObject({ workX: 31, workY: 31 }); // chapel
    expect(byId.get(v5!)).toMatchObject({ assigned: false });
  });

  it("stays identical when a glut-skip forces the fallback (no-skip-glut) pass", () => {
    // A minimal glut scenario: one farm already staffed with a glutted grain
    // stockpile (so pass 1's skipGlut=true rejects a 2nd worker on it) and a
    // second, unstaffed farm nearby (same type, so it's a pass-1-glut-skipped
    // "already staffed type, open slot" candidate too — glut-skip applies to
    // ANY candidate of an already-staffed type, not just the glutted building
    // itself) — pass 2 (skipGlut=false) must place the villager there,
    // identically in both old and new.
    const buildReal = (): { sim: CitadelSimResult; farmId: number; farm2Id: number } => {
      const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, worldWidth: 64, worldHeight: 64 });
      const state = sim.state;
      const farmId = addBuilding(state, "farm", 10, 10);
      state.buildingState.get(farmId)!.workerCount = 1; // full + staffed
      const farm2Id = addBuilding(state, "farm", 14, 10); // open, same type
      const owner = playerById(state, 0)!;
      owner.population = 1;
      owner.stockpiles.grain = OLD_GLUT_WORKER_DAYS * Math.max(1, owner.population) + 5; // glutted
      addIdleVillager(state, 10, 10);
      return { sim, farmId, farm2Id };
    };

    const oldS = buildReal();
    const newS = buildReal();

    const oldLog = runAllIdle(oldS.sim.state, (v) => oldAssign(oldS.sim.state, v));
    const sys = new VillagerSystem(newS.sim.state);
    const assignDirect = (sys as unknown as { assign: (v: VillagerComponent) => boolean }).assign.bind(sys);
    const newLog = runAllIdle(newS.sim.state, assignDirect);

    expect(newLog).toEqual(oldLog);
    expect(oldLog[0]?.assigned).toBe(true);
    // Placed on farm2 (open slot on the already-staffed type), not farm1 (glutted, full anyway).
    expect(oldLog[0]).toMatchObject({ workX: 15, workY: 11 });
  });

  it("an idle villager backs off after a failed attempt and retries the next sim day, not every tick", () => {
    // No workplace at all — every attempt fails. Confirms the retry cadence
    // WITHOUT changing the mandatory-gate equivalence claim above (this test
    // only checks the backoff timing, not which building is picked).
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, worldWidth: 64, worldHeight: 64 });
    const state = sim.state;
    addIdleVillager(state, 5, 5);
    state.day = 0;

    const sys = new VillagerSystem(state);
    let calls = 0;
    const real = (sys as unknown as { assign: (v: VillagerComponent) => boolean }).assign.bind(sys);
    (sys as unknown as { assign: (v: VillagerComponent) => boolean }).assign = (v: VillagerComponent) => {
      calls++;
      return real(v);
    };

    // Several ticks within the SAME sim day: only the first should attempt.
    for (let t = 0; t < 5; t++) sys.run({ tick: t });
    expect(calls).toBe(1);

    // A new sim day: the backed-off villager retries exactly once more.
    state.day = 1;
    sys.run({ tick: 100 });
    expect(calls).toBe(2);

    // Still day 1: no further retry until day 2.
    sys.run({ tick: 101 });
    expect(calls).toBe(2);
  });
});
