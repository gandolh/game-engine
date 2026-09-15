/**
 * Audit-15 mid-day invalidation: FireSystem now caches wooden/stone/well/id
 * data in a per-player `FireDailyIndex` that's normally only rebuilt once a
 * day (see `_buildDailyIndex`). A well built mid-day (or destroyed) must
 * still help (or stop helping) the moment it exists — not "tomorrow" — so
 * `_getIndex` invalidates the cache whenever `buildingWorld`'s live
 * "building" entity count moves. This test proves that specifically for the
 * well-decay path in `_tickBurning`, on a building that is ALREADY burning
 * when the well goes up mid-day, well inside the same in-game day
 * (TICKS_PER_DAY=20, so ticks 1-3 are nowhere near a day boundary).
 */
import { describe, it, expect } from "vitest";
import { localPlayer } from "../sim-state";
import { bootstrapSim } from "../sim-bootstrap";
import type { CitadelSimResult } from "../sim-bootstrap";
import { isWalkable } from "../world/terrain";
import { coversRect } from "../entities/building";
import type { BuildingFireState } from "../sim-state";

const SEED = 0x9e11_c0de;
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

function place(sim: CitadelSimResult, type: string, x: number, y: number): void {
  sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: type, x, y } });
  sim.scheduler.tick({ tick: 0 });
}

function forceIgnite(sim: CitadelSimResult, entityId: number, burnTicksLeft = 200): void {
  const fs: BuildingFireState = { burning: true, burnTicksLeft, destroyed: false };
  localPlayer(sim.state).fireState.set(entityId, fs);
}

function firstEntityId(sim: CitadelSimResult, type: string): number {
  for (const entity of sim.state.buildingWorld.query("building")) {
    if (entity.building.type === type && entity.id !== undefined) return entity.id;
  }
  throw new Error(`no ${type} entity found`);
}

describe("FireSystem — mid-day well invalidation (audit-15)", () => {
  it("a well built while a house is already burning speeds up that SAME house's burn-out, without waiting for the next day", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });
    const { terrain } = sim;
    const cx = Math.floor(terrain.width / 2);
    const cy = Math.floor(terrain.height / 2);

    const housePos = findClear(terrain, 2, 2, cx, cy);
    place(sim, "house", housePos.x, housePos.y);
    const houseId = firstEntityId(sim, "house");
    forceIgnite(sim, houseId, 200);

    // Tick 1: no well anywhere yet. Baseline decay must be exactly -1 (the
    // unmodified, no-well burn rate) — isolates the variable before we
    // introduce a well.
    sim.scheduler.tick({ tick: 1 });
    const afterNoWell = localPlayer(sim.state).fireState.get(houseId)?.burnTicksLeft;
    expect(afterNoWell).toBe(199);

    // Build a well right next to (but not overlapping) the burning house's
    // 2x2 footprint, still well within day 0 (TICKS_PER_DAY=20, we're at
    // tick 2) — this goes through the SAME `placeBuilding` command path a
    // player uses, then flushes exactly one tick (the commands stage runs
    // before FireSystem's hazards stage in that SAME tick, per
    // sim-bootstrap.ts's scheduler stage order).
    //
    // Pick the well tile deterministically rather than trusting `findClear`
    // (which only checks terrain walkability, not building occupancy, so it
    // can wander onto the house's own footprint): require it to be walkable,
    // not already a building tile, and — per the real `coversRect` used by
    // `_hasWellNear` — actually within the well's 8x6 reach of the house's
    // centre, so this test would fail loudly (not silently) if any of those
    // didn't hold.
    const houseCx = housePos.x + 1;
    const houseCy = housePos.y + 1;
    const candidates = [
      { x: housePos.x + 3, y: housePos.y }, { x: housePos.x + 3, y: housePos.y + 1 },
      { x: housePos.x - 2, y: housePos.y }, { x: housePos.x, y: housePos.y + 3 },
      { x: housePos.x, y: housePos.y - 2 }, { x: housePos.x + 2, y: housePos.y + 2 },
      { x: housePos.x - 2, y: housePos.y + 2 }, { x: housePos.x + 2, y: housePos.y - 2 },
    ];
    const wellPos = candidates.find((c) =>
      isWalkable(terrain, c.x, c.y) &&
      !sim.state.buildingTiles.has(c.y * sim.state.width + c.x) &&
      coversRect("well", c.x, c.y, houseCx, houseCy),
    );
    expect(wellPos).toBeDefined();

    const buildingsBefore = sim.state.buildingWorld.query("building").entities.length;
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "well", x: wellPos!.x, y: wellPos!.y } });
    sim.scheduler.tick({ tick: 2 });
    // Sanity: the well command must actually have been accepted (not silently
    // rejected as occupied/out-of-territory), or this test would prove nothing.
    expect(sim.state.buildingWorld.query("building").entities.length).toBe(buildingsBefore + 1);

    const afterWellSameTick = localPlayer(sim.state).fireState.get(houseId)?.burnTicksLeft;
    // Well decay this tick must be MORE than the baseline -1/tick — proving
    // FireSystem picked up the new well without waiting for the next daily
    // rebuild (day 0 is still in progress; TICKS_PER_DAY=20, day boundary is
    // tick 20). If this were still using yesterday's stale index the well
    // would be invisible and the decay would stay exactly -1.
    expect(afterWellSameTick).toBeDefined();
    expect(afterNoWell! - afterWellSameTick!).toBeGreaterThan(1);

    // And it isn't a one-off fluke of that tick: the NEXT tick's decay is
    // still well-boosted too.
    const before3 = afterWellSameTick!;
    sim.scheduler.tick({ tick: 3 });
    const after3 = localPlayer(sim.state).fireState.get(houseId)?.burnTicksLeft;
    expect(after3).toBeDefined();
    expect(before3 - after3!).toBeGreaterThan(1);

    // Still well inside day 0 the whole time.
    expect(sim.state.day).toBe(0);
  });
});
