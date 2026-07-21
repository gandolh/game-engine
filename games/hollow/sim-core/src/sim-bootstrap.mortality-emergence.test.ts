/**
 * Chunk hollow-15 END-TO-END emergence test (mirrors
 * sim-bootstrap.family.test.ts's "prove the real villager-driven loop, not just
 * a unit" rationale). Where mortality.test.ts forces each mechanism in
 * isolation, THIS drives the whole `bootstrapHollowSim` loop with disease ON
 * and asserts the emergent care economy actually functions:
 *   - people die (old age + starvation + disease), each leaving a corpse;
 *   - grave-diggers emerge (leader-assigned + demand-driven) and BURY the dead;
 *   - unburied bodies spread a disease that infects, kills SOME, and is
 *     survived by others;
 *   - medics emerge and TREAT patients;
 *   - and through all of it the population stays bounded — the care loop
 *     contains the plague rather than letting it wipe the town (the tuned,
 *     headless-verified behavior — see jobs/constants.ts's care-demand block).
 *
 * One fixed seed + a moderate horizon (kept short per the repo's constrained-
 * hardware guidance); the thresholds are far below the measured values (seed 7
 * @2000t: buried 372, infected 29, disease-deaths 10, treated 10) so this is a
 * robust "the mechanism fires + stays bounded" gate, not an over-fit snapshot.
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSimOptions } from "./sim-bootstrap";
import { ONT_FAMILY, ONT_MORTALITY } from "./protocols";

const STABLE: Partial<HollowSimOptions> = {
  childAdultTicks: 15,
  adultElderTicks: 200,
  oldAgeHazardBase: 0.006,
  oldAgeHazardPerTick: 0.0012,
  oldAgeHazardMax: 0.2,
  starvationDeathTicks: 120,
  pairbondTrustThreshold: 0.55,
  pairbondCompatThreshold: 0.2,
  pairbondProximityTiles: 12,
  birthWindowTicks: 20,
  birthChance: 0.6,
  birthFoodSecurityFraction: 0.3,
  gestationTicks: 10,
  birthPerCapitaFoodTarget: 6,
  foodNodeCount: 10,
  foodNodeMaxStock: 200,
  foodNodeRegenPerTick: 12,
};

describe("mortality & care emerge from the real villager-driven sim (chunk hollow-15)", () => {
  it("grave-diggers bury the dead, disease infects/kills/heals, medics treat — and the town stays bounded", () => {
    const sim = bootstrapHollowSim({ seed: 7, ticksPerDay: 20, population: 24, ...STABLE });

    const deathCauses: Record<string, number> = {};
    let infected = 0;
    let recovered = 0;
    let treated = 0;
    sim.bus.subscribeOntology(ONT_FAMILY.DEATH, (m) => {
      const c = m.body.cause as string;
      deathCauses[c] = (deathCauses[c] ?? 0) + 1;
    });
    sim.bus.subscribeOntology(ONT_MORTALITY.INFECTED, () => infected++);
    sim.bus.subscribeOntology(ONT_MORTALITY.RECOVERED, () => recovered++);
    sim.bus.subscribeOntology(ONT_MORTALITY.TREATED, () => treated++);

    let sawGraveDigger = false;
    let sawMedic = false;
    const RUNAWAY_CAP = 24 * 8;
    for (let i = 0; i < 1500; i++) {
      sim.tick();
      const snap = sim.getSnapshot();
      // Bounded throughout — the care loop contains the plague (never extinct,
      // never a runaway).
      expect(snap.aliveCount).toBeGreaterThan(0);
      expect(snap.aliveCount).toBeLessThan(RUNAWAY_CAP);
      for (const a of snap.agents) {
        if (a.occupation === "grave-digger") sawGraveDigger = true;
        if (a.occupation === "medic") sawMedic = true;
      }
    }

    const snap = sim.getSnapshot();

    // Deaths happened, from multiple causes including the new disease cause.
    expect(snap.diedCount).toBeGreaterThan(0);
    expect((deathCauses["disease"] ?? 0)).toBeGreaterThan(0);

    // The care roles actually staffed themselves...
    expect(sawGraveDigger).toBe(true);
    expect(sawMedic).toBe(true);

    // ...grave-diggers buried the dead (burial keeps pace, so corpses don't
    // accumulate without bound)...
    expect(snap.buriedCount!).toBeGreaterThan(0);

    // ...disease spread from rotting bodies, killed some, and was survived by
    // others (recovery works), and medics treated patients.
    expect(infected).toBeGreaterThan(0);
    expect(recovered).toBeGreaterThan(0);
    expect(treated).toBeGreaterThan(0);

    // The world exposes the graveyard + a (bounded) corpse list for the renderer.
    expect(snap.graveyard).toBeDefined();
    expect(Array.isArray(snap.corpses)).toBe(true);
  });
});
