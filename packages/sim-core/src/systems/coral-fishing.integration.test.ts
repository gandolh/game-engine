import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { JsPathfinder } from "../world/js-pathfinder";
import { isCoralReefTile } from "../world/coral";

/**
 * Live-sim smoke test: drives the real scheduler to confirm the coral-fishing trip fires
 * end-to-end — a farmer BOARDS, ROWS to a reef, and LANDS a coral-only special.
 * Uses bootstrapSim + JsPathfinder, no Worker.
 *
 * 15-day window (seed 0xc0ffee). Both specs share a single beforeAll run to halve run time.
 * Starting gold was raised by +30 pushing first completed reef trip to day 12.
 */

const TICKS_PER_DAY = 800;
const DAYS = 15;

// Latched per-tick observations from the single shared run.
let aboardSeen = false;
let reachedReef = false;
let coralEverCaught = false;
const everAboard = new Set<number>();
const disembarked = new Set<number>();
const stillAboardAtEnd = new Set<number>();

describe("coral fishing (live sim)", () => {
  // 21-farmer roster makes this full-scheduler run ~4× heavier than the
  // original 5-farmer sim — bump past vitest's 5s default.
  beforeAll(() => {
    const sim = bootstrapSim({
      seed: 0xc0ffee,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: 20,
      pathfinder: new JsPathfinder(),
      shock: false,
    });
    for (let t = 0; t < TICKS_PER_DAY * DAYS; t++) {
      sim.scheduler.tick({ tick: t });
      sim.bus.notifySubscribers();
      for (const f of sim.farmers) {
        if (f.farmer?.aboard) {
          aboardSeen = true;
          if (f.id !== undefined) everAboard.add(f.id);
          const tx = Math.round(f.transform?.x ?? -1);
          const ty = Math.round(f.transform?.y ?? -1);
          if (isCoralReefTile(tx, ty)) reachedReef = true;
        } else if (f.id !== undefined && everAboard.has(f.id)) {
          disembarked.add(f.id);
        }
        if (!coralEverCaught) {
          const fish = f.inventory?.fish;
          if ((fish?.["coral-trout"] ?? 0) + (fish?.lobster ?? 0) > 0) coralEverCaught = true;
        }
      }
    }
    // Record who is still aboard at the end of the window.
    for (const f of sim.farmers) {
      if (f.id !== undefined && f.farmer?.aboard) stillAboardAtEnd.add(f.id);
    }
  }, 60_000);

  it("a farmer boards, rows to a reef over water, and catches a coral special", () => {
    expect(aboardSeen).toBe(true);
    expect(reachedReef).toBe(true);
    expect(coralEverCaught).toBe(true);
  });

  it("completes the round trip: a farmer that went aboard returns on foot", () => {
    expect(everAboard.size).toBeGreaterThan(0);
    // Any farmer who completed a trip (boarded AND later seen on foot) must have
    // returned; farmers still mid-trip at the window edge are exempt.
    const completedTrips = [...everAboard].filter(id => !stillAboardAtEnd.has(id));
    expect(completedTrips.length).toBeGreaterThan(0); // at least one round trip finished
    for (const id of completedTrips) expect(disembarked.has(id)).toBe(true);
  });
});
