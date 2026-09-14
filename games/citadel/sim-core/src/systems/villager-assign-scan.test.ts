/**
 * Regression + measurement guard for audit-09: an idle villager with no
 * placeable slot must NOT keep re-running `assign()`'s full candidate search
 * (~17 `buildingWorld` scans) every tick forever.
 *
 * Mirrors `fire-system-scan.test.ts`'s technique (audit-15): instruments the
 * SAME cached Query object VillagerSystem reads
 * (`state.buildingWorld.query("building")`) to COUNT how many entities are
 * actually visited, at a realistic B (≈575 — one filler entity per road tile,
 * per the spec's "buildingWorld holds one entity per road tile too") with 30
 * permanently-unplaceable idle villagers (the spec's own worst case: every
 * worker slot filled). A real measurement, not an estimate.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import type { CitadelSimResult } from "../sim-bootstrap";
import { playerById } from "../sim-state";
import type { SimState, PlayerState } from "../sim-state";
import { getProductionDef } from "../entities/building";
import type { BuildingRuntimeState } from "../entities/building";
import type { VillagerComponent } from "../entities/villager";
import { VillagerSystem } from "./villager-system";

// ---------------------------------------------------------------------------
// A trimmed VERBATIM copy of the pre-audit-09 assign()/tryAssignPass() — full
// O(B) rescan every call, no cache, no backoff — used ONLY to get a genuinely
// MEASURED (not estimated) old-code visit count below. See
// villager-assign-cache.test.ts for the full equivalence oracle + argument.
// ---------------------------------------------------------------------------
const OLD_GLUT_WORKER_DAYS = 8;
const OLD_TIERS: Array<[boolean, boolean, boolean]> = [
  [true, true, true], [true, false, true], [true, true, false], [true, false, false],
  [false, true, true], [false, false, true], [false, true, false], [false, false, false],
];

function oldAssign(state: SimState, v: VillagerComponent): boolean {
  const staffedTypes = new Set<string>();
  for (const entity of state.buildingWorld.query("building")) {
    if (entity.building.ownerId !== v.ownerId) continue;
    const id = entity.id;
    if (id === undefined) continue;
    const rs = state.buildingState.get(id);
    if (rs !== undefined && rs.workerCount > 0) staffedTypes.add(entity.building.type);
  }
  const owner: PlayerState | undefined = playerById(state, v.ownerId);
  for (const skipGlut of [true, false]) {
    for (const [wantGoods, wantPrimary, wantUnstaffedType] of OLD_TIERS) {
      let bestId = -1;
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
          skipGlut && typeStaffed && def.outputGood !== undefined && owner !== undefined &&
          owner.stockpiles[def.outputGood] >= OLD_GLUT_WORKER_DAYS * Math.max(1, owner.population)
        ) continue;
        const b = entity.building;
        const cx = b.x + Math.floor(b.w / 2);
        const cy = b.y + Math.floor(b.h / 2);
        const d = Math.abs(cx - v.homeX) + Math.abs(cy - v.homeY);
        if (d < bestDist) { bestDist = d; bestId = id; }
      }
      if (bestId !== -1) {
        const rs = state.buildingState.get(bestId);
        if (rs !== undefined) rs.workerCount++;
        return true;
      }
    }
  }
  return false;
}

const SEED = 0xba1a5;
const TICKS_PER_DAY = 20;
const ROAD_FILLERS = 550;
const IDLE_VILLAGERS = 30;

function addBuilding(state: SimState, type: string, x: number, y: number, w = 2, h = 2): number {
  const entity = state.buildingWorld.spawn({ building: { type, x, y, w, h, ownerId: 0 } });
  const rs: BuildingRuntimeState = { outputBuffer: 0, workerCount: 0, connected: true, productionTick: 0, level: 1 };
  state.buildingState.set(entity.id!, rs);
  return entity.id!;
}

/**
 * A "mature, fully staffed" town: one farm (the only worker-slot building),
 * already full, plus ROAD_FILLERS road-tile entities (workerSlots:0, exactly
 * mirroring the spec's "one entity per road tile" note) and IDLE_VILLAGERS
 * villagers who can NEVER place — the spec's pathological "surplus villager"
 * case. B = ROAD_FILLERS + 1 (the farm).
 */
function buildMatureTown(): { sim: CitadelSimResult; B: number } {
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, worldWidth: 256, worldHeight: 256 });
  const state = sim.state;
  const farmId = addBuilding(state, "farm", 5, 5);
  state.buildingState.get(farmId)!.workerCount = 1; // full — the only slot in town, taken
  for (let i = 0; i < ROAD_FILLERS; i++) addBuilding(state, "road", 10 + (i % 200), 20 + Math.floor(i / 200), 1, 1);
  let B = 0;
  for (const _e of state.buildingWorld.query("building")) B++;
  for (let i = 0; i < IDLE_VILLAGERS; i++) {
    state.villagerWorld.spawn({
      villager: {
        id: state.nextVillagerId++,
        ownerId: 0,
        homeX: 100 + i,
        homeY: 100,
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
      },
    });
  }
  return { sim, B };
}

/** Instruments `state.buildingWorld.query("building")`'s iterator to count
 *  every entity yielded across every for-of pass, until `stop()`. Same
 *  technique as `fire-system-scan.test.ts`'s `instrumentBuildingQuery`. */
function instrumentBuildingQuery(sim: CitadelSimResult): { count: () => number; stop: () => void } {
  const q = sim.state.buildingWorld.query("building");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = q as any; // test-only instrumentation: shadowing an instance's own Symbol.iterator
  const original: () => Iterator<unknown> = target[Symbol.iterator].bind(q);
  let visits = 0;
  target[Symbol.iterator] = function patchedIterator(): Iterator<unknown> {
    const it = original();
    return {
      next(): IteratorResult<unknown> {
        const r = it.next();
        if (!r.done) visits++;
        return r;
      },
      return(v?: unknown): IteratorResult<unknown> {
        return it.return ? it.return(v) : { value: v, done: true };
      },
    };
  };
  return { count: () => visits, stop: () => { target[Symbol.iterator] = original; } };
}

describe("VillagerSystem — per-tick assign() scan volume (audit-09)", () => {
  it("30 permanently-idle villagers no longer scale the scan with (villagers x tiers x B)", () => {
    // OLD (measured, not estimated): the pre-audit-09 oracle, one attempt per
    // idle villager — exactly what the old ungated per-tick loop did every
    // single tick, forever, for a permanently-unplaceable villager.
    const oldTown = buildMatureTown();
    expect(oldTown.B).toBe(ROAD_FILLERS + 1);
    const oldProbe = instrumentBuildingQuery(oldTown.sim);
    for (const entity of oldTown.sim.state.villagerWorld.query("villager")) {
      oldAssign(oldTown.sim.state, entity.villager);
    }
    const oldPerTickVisits = oldProbe.count();
    oldProbe.stop();

    // NEW: the real (cached + backed-off) VillagerSystem on an identical, fresh town.
    const { sim, B } = buildMatureTown();
    expect(B).toBe(ROAD_FILLERS + 1);

    const probe = instrumentBuildingQuery(sim);
    const sys = new VillagerSystem(sim.state);

    // Tick 1 (cold cache): every villager's FIRST attempt is never backed off,
    // so this tick pays the one-time O(B) cache build PLUS every villager's
    // bucketed tier scan.
    sys.run({ tick: 0 });
    const firstTickVisits = probe.count();

    // Tick 2, SAME sim day: every one of the 30 villagers failed on tick 1, so
    // the audit-09 backoff holds all 30 — this tick should touch the
    // buildingWorld query not at all (no cache rebuild: nothing placed/demolished
    // since; no assign() calls: every villager is backed off today).
    sys.run({ tick: 1 });
    const secondTickVisits = probe.count() - firstTickVisits;

    probe.stop();

    // eslint-disable-next-line no-console
    console.log(
      `[audit-09] B=${B}, villagers=${IDLE_VILLAGERS}, ` +
      `MEASURED old-code visits for one tick's worth of attempts=${oldPerTickVisits}, ` +
      `new cold-cache first-idle-tick visits=${firstTickVisits}, ` +
      `new steady-state (backed-off) tick visits=${secondTickVisits}`,
    );

    // The measured old-code figure is itself the every-tick-forever cost (the
    // old code re-ran this exact search every tick with no cache and no backoff).
    expect(oldPerTickVisits).toBeGreaterThan(200_000);

    // The measured old-code cost repeats EVERY tick, forever, for a
    // permanently-idle villager. The new steady-state tick (the pathological
    // "stays idle and repeats forever" case the spec is about) must be a
    // small constant, not proportional to B or to the villager count at all.
    expect(secondTickVisits).toBeLessThan(5);
    expect(secondTickVisits).toBeLessThan(oldPerTickVisits);

    // Even the cold-cache first tick — which still pays one O(B) cache build
    // — must stay far below the old per-tick cost, since after that build every
    // villager reads its own bucket (much smaller than B: only the 1 farm
    // qualifies, the 550 road fillers never do) instead of rescanning B per tier.
    expect(firstTickVisits).toBeLessThan(oldPerTickVisits);
    expect(firstTickVisits).toBeLessThan(3 * B); // one cache build + a handful of small bucket walks
  });
});
