import { describe, it, expect } from "vitest";
import { bootstrapMathquestSim } from "./sim-bootstrap";

describe("bootstrapMathquestSim — M0 scaffolding tick loop", () => {
  it("starts at tick 0 and steps N times", () => {
    const sim = bootstrapMathquestSim({ seed: 0x1a1100 });
    expect(sim.getSnapshot().tick).toBe(0);

    for (let i = 0; i < 100; i++) sim.step();

    expect(sim.getSnapshot().tick).toBe(100);
  });

  it("is deterministic: two sims with the same seed advance identically and their Rng streams match", () => {
    const a = bootstrapMathquestSim({ seed: 1 });
    const b = bootstrapMathquestSim({ seed: 1 });

    const N = 50;
    for (let i = 0; i < N; i++) {
      a.step();
      b.step();
    }

    expect(a.getSnapshot().tick).toBe(N);
    expect(a.getSnapshot()).toEqual(b.getSnapshot());
    // Determinism is load-bearing (root CLAUDE.md) — the seeded Rng must be
    // wired through and forked identically, not merely accepted and ignored.
    for (let i = 0; i < 10; i++) {
      expect(a.rng.nextU32()).toBe(b.rng.nextU32());
    }
  });

  it("world and scheduler are freshly constructed per bootstrap call (no shared state leaks)", () => {
    const a = bootstrapMathquestSim({ seed: 1 });
    const b = bootstrapMathquestSim({ seed: 1 });
    expect(a.world).not.toBe(b.world);
    expect(a.scheduler).not.toBe(b.scheduler);
  });
});
