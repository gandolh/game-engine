/**
 * Regression guard for audit-15: `_tickBurning` must not re-scan the whole
 * `buildingWorld` per burning building per tick (was: one full O(B)
 * `query("building")` iteration per burning building, from `_hasWellNear`
 * alone, on top of the system's own O(B) baseline loops).
 *
 * This instruments the SAME cached Query object FireSystem reads
 * (`state.buildingWorld.query("building")`) to count how many entities are
 * actually visited across ONE tick, with several buildings burning at once.
 * A real measurement, not an estimate: before this fix the count scales with
 * (fires × B); after, it should scale with a small constant multiple of B
 * (independent of how many buildings are burning).
 */
import { describe, it, expect } from "vitest";
import { localPlayer } from "../sim-state";
import { bootstrapSim } from "../sim-bootstrap";
import type { CitadelSimResult } from "../sim-bootstrap";
import { isWalkable } from "../world/terrain";
import type { BuildingFireState } from "../sim-state";

const SEED = 0xf17e_5ca7;
const TICKS_PER_DAY = 20;

function findClear(
  terrain: { width: number; height: number; cells: Uint8Array },
  w: number, h: number, sx: number, sy: number,
): { x: number; y: number } {
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++)
            if (!isWalkable(terrain, x + xx, y + yy)) { ok = false; break; }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

function placeBatch(sim: CitadelSimResult, items: Array<{ type: string; x: number; y: number }>): void {
  for (const it of items) {
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: it.type, x: it.x, y: it.y } });
  }
  sim.scheduler.tick({ tick: 0 });
}

function forceIgnite(sim: CitadelSimResult, entityId: number): void {
  const fs: BuildingFireState = { burning: true, burnTicksLeft: 200, destroyed: false };
  localPlayer(sim.state).fireState.set(entityId, fs);
}

/**
 * Instrument `state.buildingWorld.query("building")`'s iterator to count how
 * many entities are yielded across every `for...of` pass over it, until
 * `stop()` is called. The Query object returned by `.query(...)` is cached by
 * World (same object every call with the same component key), so patching
 * this one instance intercepts every consumer for as long as the test runs.
 */
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
  return {
    count: () => visits,
    stop: () => { target[Symbol.iterator] = original; },
  };
}

/** Build the same 48-house layout, optionally igniting the first 8. */
function buildLayout(ignite: boolean): { sim: CitadelSimResult; B: number; fires: number } {
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });
  const { terrain } = sim;
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);

  // 48 filler buildings (inflate B), well spread out so none of this matters
  // for spread/ignition — we only run ONE tick, and spread/ignition are
  // daily-gated, not per-tick.
  const items: Array<{ type: string; x: number; y: number }> = [];
  const cols = 8;
  for (let i = 0; i < 48; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const pos = findClear(terrain, 2, 2, cx + (col - cols / 2) * 4, cy + (row - 3) * 4);
    items.push({ type: "house", x: pos.x, y: pos.y });
  }
  placeBatch(sim, items);

  let fires = 0;
  let seen = 0;
  for (const entity of sim.state.buildingWorld.query("building")) {
    if (entity.building.type !== "house") continue;
    if (ignite && fires < 8 && entity.id !== undefined) {
      forceIgnite(sim, entity.id);
      fires++;
    }
    seen++;
  }
  return { sim, B: seen, fires };
}

/** One tick's total "building"-query entity-visit count for a given layout. */
function visitsForOneTick(sim: CitadelSimResult): number {
  const probe = instrumentBuildingQuery(sim);
  sim.scheduler.tick({ tick: 1 });
  const visited = probe.count();
  probe.stop();
  return visited;
}

describe("FireSystem — per-tick building-scan volume", () => {
  it("the well-check/id-lookup overhead from 8 concurrent fires stays bounded by B, not (fires x B)", () => {
    // Baseline: same layout, same tick, but nothing burning — isolates every
    // OTHER system's per-tick "building" scans (production, villagers,
    // needs, connectivity, tiers, ...) that FireSystem shares the cached
    // Query object with and that this fix does not touch.
    const noFires = buildLayout(false);
    const baseline = visitsForOneTick(noFires.sim);

    const eightFires = buildLayout(true);
    expect(eightFires.fires).toBe(8);
    const withFires = visitsForOneTick(eightFires.sim);

    const delta = withFires - baseline;
    const B = eightFires.B;

    // eslint-disable-next-line no-console
    console.log(
      `[audit-15] B=${B}, no-fire baseline visits=${baseline}, 8-fire visits=${withFires}, ` +
      `delta attributable to 8 burning buildings=${delta} (=${(delta / B).toFixed(2)} x B)`,
    );

    // Old code: _hasWellNear alone did one full O(B) scan PER burning
    // building (8x B), on top of a couple of fixed O(B) passes already in
    // _tickBurning/_spreadFire (suppression interlock, id lookups) — so the
    // fire-attributable delta scaled with (fires x B). The fix must decouple
    // the delta from the fire COUNT: bound it by a small constant multiple
    // of B instead of letting it scale with the number of burning buildings.
    expect(delta).toBeLessThan(eightFires.fires * B);
    expect(delta).toBeLessThanOrEqual(3 * B);
  });
});
