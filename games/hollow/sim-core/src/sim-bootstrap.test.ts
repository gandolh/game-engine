import { describe, it, expect } from "vitest";
import { bootstrapHollowSim } from "./sim-bootstrap";

describe("bootstrapHollowSim — empty scaffolding tick loop (chunk hollow-01)", () => {
  it("starts at tick 0 and ticks 100 times deterministically with an empty system list", () => {
    const sim = bootstrapHollowSim({ seed: 0x1a1100, ticksPerDay: 20 });
    expect(sim.getSnapshot().tick).toBe(0);

    for (let i = 0; i < 100; i++) sim.tick();

    expect(sim.getSnapshot().tick).toBe(100);
  });

  it("is deterministic: two sims with the same seed advance identically and their Rng streams match", () => {
    const a = bootstrapHollowSim({ seed: 42, ticksPerDay: 20 });
    const b = bootstrapHollowSim({ seed: 42, ticksPerDay: 20 });

    for (let i = 0; i < 50; i++) {
      a.tick();
      b.tick();
    }

    expect(a.getSnapshot().tick).toBe(b.getSnapshot().tick);
    // Determinism is load-bearing (CLAUDE.md) — the seeded Rng must be wired
    // through, not merely accepted and ignored.
    for (let i = 0; i < 10; i++) {
      expect(a.rng.nextU32()).toBe(b.rng.nextU32());
    }
  });

  it("world and bus are freshly constructed per bootstrap call (no shared state leaks)", () => {
    const a = bootstrapHollowSim({ seed: 1, ticksPerDay: 20 });
    const b = bootstrapHollowSim({ seed: 1, ticksPerDay: 20 });
    expect(a.world).not.toBe(b.world);
    expect(a.bus).not.toBe(b.bus);
    expect(a.scheduler).not.toBe(b.scheduler);
  });
});
