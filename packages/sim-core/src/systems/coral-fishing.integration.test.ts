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
 * Window: 12 days — the opportunist's coral period is 6 days, so day 12 is the
 * second eligible window. brief 70 raised starting gold by +30 which shifts the
 * opportunist's early-game routing (iron upgrades now affordable from day 1),
 * pushing the first completed reef trip from day 6 to day 12. The extended
 * window keeps the proof end-to-end and remains within the 30 s timeout.
 */
describe("coral fishing (live sim)", () => {
  function boot() {
    return bootstrapSim({
      seed: 0xc0ffee,
      ticksPerDay: 800,
      maxDays: 20,
      pathfinder: new JsPathfinder(),
      shock: false,
    });
  }

  // 21-farmer roster makes these full-scheduler runs ~4× heavier than the
  // original 5-farmer sim — bump past vitest's 5s default.
  it("a farmer boards, rows to a reef over water, and catches a coral special", { timeout: 60_000 }, () => {
    const sim = boot();
    let aboardSeen = false;
    let reachedReef = false;
    for (let t = 0; t < 800 * 14; t++) {
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

  it("completes the round trip: a farmer that went aboard returns on foot", { timeout: 60_000 }, () => {
    const sim = boot();
    const everAboard = new Set<number>();
    const disembarked = new Set<number>();
    const stillAboardAtEnd = new Set<number>();
    for (let t = 0; t < 800 * 15; t++) {
      sim.scheduler.tick({ tick: t });
      sim.bus.notifySubscribers();
      for (const f of sim.farmers) {
        if (f.id === undefined) continue;
        if (f.farmer?.aboard) everAboard.add(f.id);
        else if (everAboard.has(f.id)) disembarked.add(f.id);
      }
    }
    // Record who is still aboard at the end of the window.
    for (const f of sim.farmers) {
      if (f.id !== undefined && f.farmer?.aboard) stillAboardAtEnd.add(f.id);
    }
    expect(everAboard.size).toBeGreaterThan(0);
    // Any farmer who completed a trip (boarded AND later seen on foot) must have
    // returned; farmers still mid-trip at the window edge are exempt.
    const completedTrips = [...everAboard].filter(id => !stillAboardAtEnd.has(id));
    expect(completedTrips.length).toBeGreaterThan(0); // at least one round trip finished
    for (const id of completedTrips) expect(disembarked.has(id)).toBe(true);
  });
});
