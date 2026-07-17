import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSnapshot } from "./sim-bootstrap";

const RUN_TICKS = 600;

function starvingCount(snapshot: HollowSnapshot): number {
  return snapshot.agents.filter((a) => a.starving).length;
}

function runFor(
  opts: Parameters<typeof bootstrapHollowSim>[0],
  ticks: number,
): ReturnType<typeof bootstrapHollowSim> {
  const sim = bootstrapHollowSim(opts);
  for (let i = 0; i < ticks; i++) sim.tick();
  return sim;
}

describe("scarcity regulates satisfaction/starvation (chunk hollow-03's anchor)", () => {
  it("with the ample default resource supply, no agent reaches the starvation signal over a 600-tick run", () => {
    for (const seed of [1001, 2002]) {
      const sim = runFor({ seed, ticksPerDay: 20, population: 40 }, RUN_TICKS);
      const snapshot = sim.getSnapshot();
      expect(snapshot.aliveCount).toBe(40);
      expect(starvingCount(snapshot)).toBe(0);
      // Not just "not starving" — genuinely satisfied on average, not
      // clinging to the seek threshold.
      const avgFoodFraction =
        snapshot.agents.reduce((sum, a) => sum + (a.needs.food ?? 0), 0) / snapshot.agents.length / 100;
      expect(avgFoodFraction).toBeGreaterThan(0.5);
    }
  });

  it("with a resource-poor seed (one food node, zero regen), the starvation signal fires for most of the population", () => {
    const sim = runFor(
      {
        seed: 1,
        ticksPerDay: 20,
        population: 30,
        foodNodeCount: 1,
        foodNodeMaxStock: 50,
        foodNodeRegenPerTick: 0,
      },
      RUN_TICKS,
    );
    const snapshot = sim.getSnapshot();
    expect(starvingCount(snapshot)).toBeGreaterThanOrEqual(Math.floor(snapshot.agents.length * 0.8));
  });

  it("three resource-density profiles produce three distinct steady-state starvation profiles (scarcity is a dial, not a constant)", () => {
    const profiles = [
      ["scarce", { foodNodeCount: 1, foodNodeMaxStock: 50, foodNodeRegenPerTick: 0 }],
      ["medium", { foodNodeCount: 3, foodNodeMaxStock: 150, foodNodeRegenPerTick: 2 }],
      ["ample", { foodNodeCount: 16, foodNodeMaxStock: 300, foodNodeRegenPerTick: 14 }],
    ] as const;

    // Averaged over 3 seeds per profile so the comparison isn't a single
    // lucky/unlucky draw — the resource CONFIG is the only thing that
    // differs between the three groups.
    const avgStarving = profiles.map(([, cfg]) => {
      const seeds = [101, 202, 303];
      const counts = seeds.map((seed) => {
        const sim = runFor({ seed, ticksPerDay: 20, population: 30, ...cfg }, RUN_TICKS);
        return starvingCount(sim.getSnapshot());
      });
      return counts.reduce((a, b) => a + b, 0) / counts.length;
    });

    const [scarce, medium, ample] = avgStarving;
    // Strictly ordered: more resource density -> less starvation. Not just
    // "different" — the direction has to match what scarcity is supposed
    // to do.
    expect(scarce).toBeGreaterThan(medium!);
    expect(medium).toBeGreaterThan(ample!);
    // And genuinely distinct profiles, not three numbers rounding to the
    // same steady state.
    expect(new Set(avgStarving).size).toBe(3);
  });
});

describe("determinism (chunk hollow-03 substrate, both tick scales)", () => {
  it("byte-identical snapshot sequences for the same seed at a LOW tick scale (ticksPerDay=20, 100 ticks)", () => {
    const a = bootstrapHollowSim({ seed: 777, ticksPerDay: 20, population: 25 });
    const b = bootstrapHollowSim({ seed: 777, ticksPerDay: 20, population: 25 });
    for (let i = 0; i < 100; i++) {
      a.tick();
      b.tick();
      expect(a.getSnapshot()).toEqual(b.getSnapshot());
    }
  });

  it("byte-identical snapshot sequences for the same seed at the DEFAULT tick scale (ticksPerDay=1200, 1200 ticks) — sampled, not just the final tick", () => {
    const a = bootstrapHollowSim({ seed: 777, ticksPerDay: 1200, population: 25 });
    const b = bootstrapHollowSim({ seed: 777, ticksPerDay: 1200, population: 25 });
    for (let i = 0; i < 1200; i++) {
      a.tick();
      b.tick();
      if (i % 97 === 0) {
        // Sampled every 97 ticks (not a divisor of any tuning constant here)
        // rather than every tick, to keep this test fast while still
        // catching a bug that only shows up deep into a long run (the
        // mining-Math.random lesson: verify at the DEFAULT scale, not only
        // a low one).
        expect(a.getSnapshot()).toEqual(b.getSnapshot());
      }
    }
    expect(a.getSnapshot()).toEqual(b.getSnapshot());
    // Also cross-check the seeded Rng streams themselves stayed in lockstep.
    for (let i = 0; i < 10; i++) {
      expect(a.rng.nextU32()).toBe(b.rng.nextU32());
    }
  });
});
