import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { JsPathfinder } from "../world/js-pathfinder";
import { isCoralReefTile } from "../world/coral";

/**
 * brief 48 — live-sim smoke test: drive the real scheduler with the default
 * roster and confirm the coral-fishing trip fires end-to-end — a farmer BOARDS,
 * ROWS to a reef over water, and LANDS a coral-only special. Canonical
 * "exercise sim behavior without a browser" test (bootstrapSim + JsPathfinder,
 * no Worker).
 *
 * Kept fast: ticksPerDay=800 (just over a fish-coral busy window so a cast
 * resolves within a day) for ~8 days — the opportunist's first coral period day
 * is day 6, so this is the minimum window that proves the trip lands. ~6.4k
 * ticks total, well under a second.
 */
describe("coral fishing (live sim)", () => {
  function boot() {
    return bootstrapSim({
      seed: 0xc0ffee,
      ticksPerDay: 800,
      maxDays: 10,
      pathfinder: new JsPathfinder(),
      shock: false,
    });
  }

  // 21-farmer roster makes these full-scheduler runs ~4× heavier than the
  // original 5-farmer sim — bump past vitest's 5s default.
  it("a farmer boards, rows to a reef over water, and catches a coral special", { timeout: 30_000 }, () => {
    const sim = boot();
    let aboardSeen = false;
    let reachedReef = false;
    for (let t = 0; t < 800 * 8; t++) {
      sim.scheduler.tick({ tick: t });
      sim.bus.notifySubscribers();
      for (const f of sim.farmers) {
        if (f.farmer?.aboard) aboardSeen = true;
        const tx = Math.round(f.transform?.x ?? -1);
        const ty = Math.round(f.transform?.y ?? -1);
        if (f.farmer?.aboard && isCoralReefTile(tx, ty)) reachedReef = true;
      }
    }
    expect(aboardSeen).toBe(true);
    expect(reachedReef).toBe(true);

    let coral = 0;
    for (const f of sim.farmers) {
      const fish = f.inventory?.fish;
      coral += (fish?.["coral-trout"] ?? 0) + (fish?.lobster ?? 0);
    }
    expect(coral).toBeGreaterThan(0);
  });

  it("completes the round trip: a farmer that went aboard returns on foot", { timeout: 30_000 }, () => {
    const sim = boot();
    const everAboard = new Set<number>();
    const disembarked = new Set<number>();
    for (let t = 0; t < 800 * 8; t++) {
      sim.scheduler.tick({ tick: t });
      sim.bus.notifySubscribers();
      for (const f of sim.farmers) {
        if (f.id === undefined) continue;
        if (f.farmer?.aboard) everAboard.add(f.id);
        else if (everAboard.has(f.id)) disembarked.add(f.id);
      }
    }
    expect(everAboard.size).toBeGreaterThan(0);
    // Every farmer that boarded also disembarked at some point (no permanent strand).
    for (const id of everAboard) expect(disembarked.has(id)).toBe(true);
  });
});
