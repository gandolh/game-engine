import { describe, it, expect, beforeAll } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { JsPathfinder } from "../world/js-pathfinder";
import { isCoralReefTile } from "../world/coral";

const TICKS_PER_DAY = 800;
const DAYS = 15;

let aboardSeen = false;
let reachedReef = false;
let coralEverCaught = false;
const everAboard = new Set<number>();
const disembarked = new Set<number>();
const stillAboardAtEnd = new Set<number>();

describe("coral fishing (live sim)", () => {

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

    const completedTrips = [...everAboard].filter(id => !stillAboardAtEnd.has(id));
    expect(completedTrips.length).toBeGreaterThan(0); 
    for (const id of completedTrips) expect(disembarked.has(id)).toBe(true);
  });
});
