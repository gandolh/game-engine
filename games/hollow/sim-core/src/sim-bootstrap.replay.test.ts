/**
 * THE HEADLINE ACCEPTANCE TEST for chunk hollow-11a: a full run (persona
 * seed + several scheduled shocks, interleaved with real villager-driven
 * dynamics) must be exactly REPLAYABLE from `seed + persona-seed +
 * interventionLog` alone. This is the end-to-end proof that
 * `BootedHollowSim.scheduleShock`/`interventionLog`/`loadInterventionLog`
 * compose correctly with `applyPersonaSeed` and the real scheduler — not
 * just that each piece works in isolation (see persona/apply.test.ts and
 * shock/system.test.ts for those).
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSimOptions } from "./sim-bootstrap";
import { applyPersonaSeed } from "./persona";
import type { PersonaSeed } from "./persona";

const OPTS: HollowSimOptions = { seed: 0xbeef, ticksPerDay: 20, population: 6 };
const PERSONA_SEED: PersonaSeed = {
  archetypes: [
    { preset: "cooperator", count: 3 },
    { preset: "opportunist", count: 3 },
  ],
};
const FINAL_TICK = 180;

describe("intervention-log replay (chunk hollow-11a acceptance)", () => {
  it("run B (fresh sim + same seed/persona-seed + run A's interventionLog) is byte-identical to run A at the final tick", () => {
    // --- run A: schedule shocks live, DURING the run, at chosen ticks ---
    const simA = bootstrapHollowSim(OPTS);
    applyPersonaSeed(simA, PERSONA_SEED);

    for (let tick = 0; tick < FINAL_TICK; tick++) {
      if (tick === 20) {
        simA.scheduleShock({ kind: "famine", resourceKind: "food", factor: 0.2, durationTicks: 30 });
      }
      if (tick === 60) {
        simA.scheduleShock({ kind: "disaster", resourceKind: "food" });
      }
      if (tick === 100) {
        simA.scheduleShock({ kind: "plague", need: "rest", amountPerTick: 4, durationTicks: 15 });
      }
      if (tick === 120) {
        simA.scheduleShock({ kind: "boom", resourceKind: "material", factor: 1.8, durationTicks: 20 });
      }
      simA.tick();
    }

    const recordedLog = simA.interventionLog;
    expect(recordedLog.length).toBe(4); // sanity: all four actually got scheduled/recorded

    // --- run B: fresh sim, same seed + persona seed, REPLAY run A's log ---
    const simB = bootstrapHollowSim(OPTS);
    applyPersonaSeed(simB, PERSONA_SEED);
    simB.loadInterventionLog(recordedLog);
    for (let tick = 0; tick < FINAL_TICK; tick++) simB.tick();

    // The core acceptance: byte-identical snapshots at the final tick.
    expect(JSON.stringify(simB.getSnapshot())).toBe(JSON.stringify(simA.getSnapshot()));
    // ... and the replayed log itself matches exactly (same tick/seq pairs).
    expect(JSON.stringify(simB.interventionLog)).toBe(JSON.stringify(simA.interventionLog));
  });

  it("a run WITHOUT any shocks (persona-seed only) is unaffected by the shock machinery's presence — same seed twice is still byte-identical", () => {
    const simA = bootstrapHollowSim(OPTS);
    applyPersonaSeed(simA, PERSONA_SEED);
    const simB = bootstrapHollowSim(OPTS);
    applyPersonaSeed(simB, PERSONA_SEED);
    for (let i = 0; i < FINAL_TICK; i++) {
      simA.tick();
      simB.tick();
    }
    expect(JSON.stringify(simA.getSnapshot())).toBe(JSON.stringify(simB.getSnapshot()));
    expect(simA.interventionLog).toEqual([]);
  });
});
