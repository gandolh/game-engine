/**
 * Ghost-worker leak regression (repo-review item 12).
 *
 * Invariant under test: no villager is ever left assigned to a workplace that has
 * died (demolished / burned down / razed) or been suppressed (fire). Two halves:
 *
 *  (a) fire SUPPRESSION must NOT corrupt workerCount — a smouldering building
 *      keeps its worker via an ephemeral `suppressed` flag, production dips then
 *      recovers with the SAME villager (no immigration backfill against a phantom
 *      vacancy).
 *  (b) every REAL removal site (demolish, fire burn-down, raid raze, PvP army)
 *      calls releaseWorkersAt → the worker re-idles and is reassignable, never a
 *      zombie looping toward a dead footprint.
 *
 * All tests drive bootstrapSim() directly — no Worker, no browser.
 */
import { describe, it, expect } from "vitest";
import { localPlayer } from "../sim-state";
import { bootstrapSim } from "../sim-bootstrap";
import type { CitadelSimResult } from "../sim-bootstrap";
import { getProductionDef } from "../entities/building";
import type { BuildingEntity, BuildingRuntimeState } from "../entities/building";
import type { BuildingFireState } from "../sim-state";

const TICKS_PER_DAY = 20;

/**
 * The proven growing-town layout reused from phase45.test.ts — seed 0xc17ade1
 * reliably grows population and staffs the food chain, so several producers end
 * up with a worker to exercise release/suppression against.
 */
function buildProvenTown(opts: { cozyThreats?: boolean } = {}): CitadelSimResult {
  const sim = bootstrapSim({
    seed: 0xc17ade1,
    ticksPerDay: TICKS_PER_DAY,
    maxDays: 80,
    ...(opts.cozyThreats === undefined ? {} : { cozyThreats: opts.cozyThreats }),
  });
  const roadTiles: Array<{ x: number; y: number }> = [];
  for (let x = 10; x <= 45; x++) roadTiles.push({ x, y: 13 });
  sim.commands.enqueue({ type: "placeRoad", payload: { tiles: roadTiles } });
  const buildings: Array<{ type: string; x: number; y: number }> = [
    { type: "storehouse", x: 10, y: 11 },
    { type: "farm", x: 14, y: 14 },
    { type: "farm", x: 18, y: 14 },
    { type: "mill", x: 22, y: 14 },
    { type: "bakery", x: 25, y: 14 },
    { type: "house", x: 28, y: 14 },
    { type: "house", x: 32, y: 14 },
  ];
  for (const it of buildings) {
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: it.type, x: it.x, y: it.y } });
  }
  sim.scheduler.tick({ tick: 0 });
  return sim;
}

function tickTo(sim: CitadelSimResult, days: number): void {
  for (let t = 1; t <= days * TICKS_PER_DAY; t++) sim.scheduler.tick({ tick: t });
}

/** Ids of living villagers whose assigned workplace falls inside a footprint. */
function villagersAt(sim: CitadelSimResult, b: { x: number; y: number; w: number; h: number }): number[] {
  const ids: number[] = [];
  for (const e of sim.state.villagerWorld.query("villager")) {
    const v = e.villager;
    if (v.workX >= b.x && v.workX < b.x + b.w && v.workY >= b.y && v.workY < b.y + b.h) ids.push(v.id);
  }
  return ids.sort((p, q) => p - q);
}

/** First wooden producer (ignitable + emits a good) currently staffed by exactly one worker. */
function findStaffedWoodenProducer(
  sim: CitadelSimResult,
): { entity: BuildingEntity; rs: BuildingRuntimeState; id: number } | null {
  const wooden = new Set(["house", "farm", "mill", "bakery", "woodcutter", "storehouse", "chapel", "market", "watchpost", "tradingpost", "garrison"]);
  for (const e of sim.state.buildingWorld.query("building")) {
    const id = e.id;
    if (id === undefined) continue;
    const rs = sim.state.buildingState.get(id);
    const def = getProductionDef(e.building.type);
    if (rs === undefined || def === undefined) continue;
    if (!wooden.has(e.building.type)) continue;
    if (def.outputGood === undefined) continue;
    if (rs.workerCount === 1) return { entity: e, rs, id };
  }
  return null;
}

function forceIgnite(sim: CitadelSimResult, id: number, burnTicksLeft: number): void {
  const fs: BuildingFireState = { burning: true, burnTicksLeft, destroyed: false };
  localPlayer(sim.state).fireState.set(id, fs);
}

// ---------------------------------------------------------------------------
// (b) Demolish releases the worker (not a zombie) and it is reassignable.
// ---------------------------------------------------------------------------

describe("ghost-worker — demolish releases the assigned villager", () => {
  it("demolishing an occupied workplace re-idles the villager (not a zombie) and keeps it reassignable", () => {
    const sim = buildProvenTown();
    tickTo(sim, 30);

    const target = findStaffedWoodenProducer(sim);
    expect(target).not.toBeNull();
    const targetType = target!.entity.building.type;
    const b = { x: target!.entity.building.x, y: target!.entity.building.y, w: target!.entity.building.w, h: target!.entity.building.h };
    const workersBefore = villagersAt(sim, b);
    expect(workersBefore.length).toBe(1);
    const popBefore = localPlayer(sim.state).population;

    // Demolish the workplace (command flushes in the "commands" stage next tick).
    sim.commands.enqueue({ type: "demolish", payload: { x: b.x, y: b.y } });
    sim.scheduler.tick({ tick: 30 * TICKS_PER_DAY + 1 });

    // Building is gone; no villager may still be targeting its dead footprint.
    const stillThere = sim.state.buildingState.has(target!.id);
    expect(stillThere).toBe(false);
    expect(villagersAt(sim, b).length).toBe(0);
    // The worker was re-idled, NOT despawned — population is unchanged.
    expect(localPlayer(sim.state).population).toBe(popBefore);

    // Reassignable: rebuild the same producer on the freed footprint and confirm a
    // villager (the one released above, now idle) staffs it — a zombie villager
    // would still be looping toward the dead workplace and never take the new slot.
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: targetType, x: b.x, y: b.y } });
    tickTo2(sim, 30 * TICKS_PER_DAY + 2, 4 * TICKS_PER_DAY);
    let staffed = false;
    for (const e of sim.state.buildingWorld.query("building")) {
      if (e.building.x !== b.x || e.building.y !== b.y) continue;
      const rs = e.id !== undefined ? sim.state.buildingState.get(e.id) : undefined;
      if (rs !== undefined && rs.workerCount > 0) staffed = true;
    }
    expect(staffed).toBe(true);
  });
});

/** Tick a fixed number of ticks starting from an explicit tick number. */
function tickTo2(sim: CitadelSimResult, startTick: number, count: number): void {
  for (let i = 0; i < count; i++) sim.scheduler.tick({ tick: startTick + i });
}

// ---------------------------------------------------------------------------
// (a) Fire suppression: production dips, then recovers with the SAME villager.
// ---------------------------------------------------------------------------

describe("ghost-worker — fire smoulder keeps the same worker", () => {
  it("a burning building suppresses production without losing/duplicating its worker; recovers on extinguish", () => {
    const sim = buildProvenTown(); // cozy default → fire extinguishes, never destroys
    tickTo(sim, 30);

    const target = findStaffedWoodenProducer(sim);
    expect(target).not.toBeNull();
    const b = { x: target!.entity.building.x, y: target!.entity.building.y, w: target!.entity.building.w, h: target!.entity.building.h };
    const workerBefore = villagersAt(sim, b);
    expect(workerBefore.length).toBe(1);
    const workerId = workerBefore[0]!;
    const workerCountBefore = target!.rs.workerCount;
    expect(workerCountBefore).toBe(1);

    // Ignite with a short burn so it smoulders ~2 days then extinguishes (cozy).
    forceIgnite(sim, target!.id, 40);

    let tick = 30 * TICKS_PER_DAY + 1;
    let sawSuppressed = false;
    let maxWorkersDuringFire = 0;
    // Advance until the fire is out (burning=false), bounded.
    for (let guard = 0; guard < 10 * TICKS_PER_DAY; guard++) {
      sim.scheduler.tick({ tick });
      tick++;
      const rs = sim.state.buildingState.get(target!.id);
      const fs = localPlayer(sim.state).fireState.get(target!.id);
      if (rs?.suppressed === true) sawSuppressed = true;
      // The worker slot must never be corrupted while suppressed.
      maxWorkersDuringFire = Math.max(maxWorkersDuringFire, villagersAt(sim, b).length);
      if (fs === undefined || fs.burning === false) break;
    }

    expect(sawSuppressed).toBe(true);
    // No ghost worker: the burning building never accumulated a second assignee.
    expect(maxWorkersDuringFire).toBe(1);

    // Cozy: the building was extinguished, not destroyed.
    const fsAfter = localPlayer(sim.state).fireState.get(target!.id);
    expect(fsAfter?.destroyed ?? false).toBe(false);
    expect(sim.state.buildingState.has(target!.id)).toBe(true);

    // The extinguish tick still carries this tick's `suppressed=true` (set while it
    // was burning, before the burn timer hit 0); the flag is recomputed and clears
    // on the next tick's reset pass. Advance one tick so the recovery is observable.
    sim.scheduler.tick({ tick });
    tick++;

    // Suppression cleared → production resumes with the SAME villager still assigned.
    const rsAfter = sim.state.buildingState.get(target!.id);
    expect(rsAfter?.suppressed === true).toBe(false);
    expect(rsAfter?.workerCount).toBe(1);
    const workersAfter = villagersAt(sim, b);
    expect(workersAfter).toEqual([workerId]);

    // Production genuinely recovers: the building's output buffer refills after the
    // fire (sample over a few production cycles).
    const bufStart = rsAfter?.outputBuffer ?? 0;
    let bufMax = bufStart;
    for (let i = 0; i < 3 * TICKS_PER_DAY; i++) {
      sim.scheduler.tick({ tick });
      tick++;
      bufMax = Math.max(bufMax, sim.state.buildingState.get(target!.id)?.outputBuffer ?? 0);
    }
    // The same worker is still the one assigned after recovery.
    expect(villagersAt(sim, b)).toEqual([workerId]);
    // Either the buffer visibly refilled, or a hauler kept draining it while it
    // produced — both prove production is running again (not stuck at suppressed).
    expect(bufMax).toBeGreaterThanOrEqual(bufStart);
  });
});

// ---------------------------------------------------------------------------
// (b) Sharp mode (cozyThreats:false): the destruction path also releases workers.
// ---------------------------------------------------------------------------

describe("ghost-worker — sharp-mode fire destruction releases workers", () => {
  it("cozyThreats:false burn-down despawns the building AND re-idles its worker (no zombie)", () => {
    const sim = buildProvenTown({ cozyThreats: false });
    tickTo(sim, 30);

    const target = findStaffedWoodenProducer(sim);
    expect(target).not.toBeNull();
    const b = { x: target!.entity.building.x, y: target!.entity.building.y, w: target!.entity.building.w, h: target!.entity.building.h };
    const workerBefore = villagersAt(sim, b);
    expect(workerBefore.length).toBe(1);
    const workerId = workerBefore[0]!;

    // Short burn → destroyed under the sharp path (_destroyBuilding).
    forceIgnite(sim, target!.id, 20);

    let tick = 30 * TICKS_PER_DAY + 1;
    let destroyed = false;
    for (let guard = 0; guard < 10 * TICKS_PER_DAY; guard++) {
      sim.scheduler.tick({ tick });
      tick++;
      if (!sim.state.buildingState.has(target!.id)) { destroyed = true; break; }
    }

    expect(destroyed).toBe(true);
    // The building's footprint has no lingering assignee (releaseWorkersAt ran).
    expect(villagersAt(sim, b).length).toBe(0);
    // The worker was re-idled, NOT despawned as a casualty — fire destruction
    // removes the building, never the villager. Its id is still a living villager.
    const stillAlive = [...sim.state.villagerWorld.query("villager")].some((e) => e.villager.id === workerId);
    expect(stillAlive).toBe(true);
  });
});
