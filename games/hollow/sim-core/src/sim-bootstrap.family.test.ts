/**
 * Full-sim-level tests for chunk hollow-05 — pair-bonding, reproduction,
 * genetics, and death emerging from the REAL villager-driven
 * `bootstrapHollowSim` loop (mirrors sim-bootstrap.community.test.ts's
 * rationale: hand-built harnesses in family/*.test.ts prove each system in
 * isolation; these prove END-TO-END wiring — scheduler order, options
 * threading, the family ontology, and the snapshot's new fields).
 *
 * Every scenario overrides the (deliberately conservative, per
 * family/constants.ts's header) production defaults down to a short
 * tick-budget scenario via `HollowSimOptions` — exactly the pattern the brief
 * calls out ("inject small populations / short thresholds"). None of this
 * touches hollow-03/04's own tests or their (legacy-safe) defaults.
 *
 * ── population stability is load-bearing, and it comes from the
 *    density-dependent birth brake ──────────────────────────────────────────
 * The raw per-partner food-security gate is a BIMODAL signal (the villager AI
 * keeps everyone fed until food suddenly crashes), so on its own it makes the
 * emergent population BISTABLE: any fertility high enough to survive the
 * founder die-off lets lucky seeds explode, and any fertility low enough to
 * cap growth lets unlucky seeds go extinct — there is no fertility/food
 * setting that stays bounded-and-surviving across seeds. The fix (see
 * family/constants.ts's BIRTH_PERCAPITA_FOOD_TARGET) is a GRADED brake: the
 * effective birth chance scales with per-capita food supply, so births throttle
 * continuously as the town grows and the population settles at a self-limiting
 * plateau. `STABLE_LIFECYCLE` below is a fast-tick-budget profile tuned (swept
 * across seeds) so that brake produces a bounded, persistent, oscillating
 * population — the "scarcity-stable population across seeds" the M1 exit-bar
 * requires.
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSimOptions } from "./sim-bootstrap";

/** Fast-tick-budget lifecycle/genetics profile with a STABLE, self-limiting
 *  population. Children grow up fast and generations turn over quickly (so
 *  dynasties are observable in ~1k ticks), food is finite, and the
 *  density-dependent birth brake (`birthPerCapitaFoodTarget`) is tuned so the
 *  population oscillates in a bounded band (~15–65) rather than exploding or
 *  collapsing. Verified bounded + never-extinct across seeds {1,7,33,101,202}. */
const STABLE_LIFECYCLE: Partial<HollowSimOptions> = {
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
  // The load-bearing stabilizer — per-capita food-regen target for the
  // density-dependent birth brake (food supply below = 10 * 12 = 120/tick).
  birthPerCapitaFoodTarget: 6,
  foodNodeCount: 10,
  foodNodeMaxStock: 200,
  foodNodeRegenPerTick: 12,
};

const START_POP = 16;
// Generous bounds proving "no runaway, no collapse" without over-fitting the
// exact oscillation (carrying capacity is seed-variable ~40–65; the swept max
// over 5 seeds was 61). A run that ever hits 0 or > 8x the start has lost the
// plateau.
const RUNAWAY_CAP = START_POP * 8; // 128

describe("pair-bonding, reproduction, genetics & death emerge from the real villager-driven sim (chunk hollow-05)", () => {
  it("population self-limits into a bounded, persistent band — with real births, deaths and multi-generation dynasties — across 2 seeds", () => {
    for (const seed of [33, 101]) {
      const sim = bootstrapHollowSim({ seed, ticksPerDay: 20, population: START_POP, ...STABLE_LIFECYCLE });
      let sawBirth = false;
      let sawDeath = false;
      for (let i = 0; i < 1200; i++) {
        sim.tick();
        const snap = sim.getSnapshot();
        // Never extinct (the density brake must not over-throttle into
        // collapse) and never a runaway (it must actually bind).
        expect(snap.aliveCount).toBeGreaterThan(0);
        expect(snap.aliveCount).toBeLessThan(RUNAWAY_CAP);
        if (snap.bornCount > 0) sawBirth = true;
        if (snap.diedCount > 0) sawDeath = true;
      }
      // Real dynamics happened, not a decorative no-op.
      expect(sawBirth).toBe(true);
      expect(sawDeath).toBe(true);
      // Dynasties: a founder -> child -> grandchild chain of descent exists
      // (heritable-trait crossover is asserted in detail at the unit level,
      // family/genetics.test.ts).
      expect(sim.lineage.generationsOfDescent()).toBeGreaterThanOrEqual(2);
      const nonFounder = sim.lineage.all().find((e) => e.parents !== null);
      expect(nonFounder).toBeDefined();
      expect(nonFounder!.genome.appearance).toBeDefined();
    }
  });

  it("reproduction is coupled to food scarcity: a food-rich town out-breeds an otherwise-identical food-scarce one", () => {
    // Same lifecycle/fertility; the ONLY difference is the food supply, which
    // drives both the per-partner food-security gate AND the per-capita density
    // brake. Scarcity must measurably suppress births (the core "scarcity-
    // coupled reproduction" requirement).
    const common = { ticksPerDay: 20, population: START_POP, ...STABLE_LIFECYCLE };
    let richBorn = 0;
    let scarceBorn = 0;
    for (const seed of [7, 202]) {
      const rich = bootstrapHollowSim({ ...common, seed, foodNodeCount: 12, foodNodeRegenPerTick: 16 }); // 192/tick
      const scarce = bootstrapHollowSim({ ...common, seed, foodNodeCount: 6, foodNodeRegenPerTick: 5 }); // 30/tick
      for (let i = 0; i < 700; i++) {
        rich.tick();
        scarce.tick();
      }
      richBorn += rich.getSnapshot().bornCount;
      scarceBorn += scarce.getSnapshot().bornCount;
    }
    expect(richBorn).toBeGreaterThan(0);
    // A food-rich town produces substantially more births than a food-starved
    // one (not merely "more" — the coupling should be strong).
    expect(richBorn).toBeGreaterThan(scarceBorn * 2);
  });

  it("the snapshot's new fields (ageTicks/stage/householdId/appearance/bornCount/diedCount/householdCount) are populated and internally consistent", () => {
    const sim = bootstrapHollowSim({ seed: 44, ticksPerDay: 20, population: 12, ...STABLE_LIFECYCLE });
    for (let i = 0; i < 800; i++) sim.tick();
    const snap = sim.getSnapshot();

    expect(snap.agents.length).toBeGreaterThan(0);
    for (const a of snap.agents) {
      expect(a.ageTicks).toBeGreaterThanOrEqual(0);
      expect(["child", "adult", "elder"]).toContain(a.stage);
      expect(typeof a.appearance.height).toBe("number");
      expect(typeof a.appearance.build).toBe("number");
      expect(typeof a.appearance.skinTone).toBe("string");
      expect(typeof a.appearance.hairTone).toBe("string");
      if (a.householdId !== null) {
        expect(sim.households.get(a.householdId)).toBeDefined();
      }
    }
    expect(snap.bornCount).toBeGreaterThanOrEqual(0);
    expect(snap.diedCount).toBeGreaterThanOrEqual(0);
    expect(snap.householdCount).toBe(sim.households.all().length);
  });
});

describe("determinism (chunk hollow-05's genetics/pairbond/reproduction/lifecycle systems)", () => {
  it("byte-identical snapshot sequences for the same seed, including births/deaths/genomes", () => {
    const opts: HollowSimOptions = { seed: 555, ticksPerDay: 20, population: START_POP, ...STABLE_LIFECYCLE };
    const a = bootstrapHollowSim(opts);
    const b = bootstrapHollowSim(opts);
    for (let i = 0; i < 800; i++) {
      a.tick();
      b.tick();
      if (i % 53 === 0) {
        expect(a.getSnapshot()).toEqual(b.getSnapshot());
      }
    }
    const snapA = a.getSnapshot();
    const snapB = b.getSnapshot();
    expect(snapA).toEqual(snapB);
    // This run must have exercised real lifecycle activity, not an all-static
    // no-op that would trivially "match" either way.
    expect(snapA.bornCount).toBeGreaterThan(0);
    expect(snapA.diedCount).toBeGreaterThan(0);
    expect(a.lineage.all()).toEqual(b.lineage.all());
    for (let i = 0; i < 10; i++) {
      expect(a.rng.nextU32()).toBe(b.rng.nextU32());
    }
  });
});
