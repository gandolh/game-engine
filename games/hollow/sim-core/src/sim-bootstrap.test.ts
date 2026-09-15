import { describe, it, expect, vi } from "vitest";
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

describe("bootstrapHollowSim — tickCount getter (chunk audit-04)", () => {
  // The whole safety argument for tickBatch/inspect reading `sim.tickCount`
  // instead of `sim.getSnapshot().tick` (avoiding a full agent/corpse/
  // community/resource build just to read one integer) is that the two are
  // exactly the same value at every point in the tick loop — including tick
  // 0 (before any tick()) and across a `ticksPerDay` day boundary, since
  // `tickCount` is incremented AFTER `scheduler.tick()` inside `tick()` and
  // `getSnapshot()` reads the same post-increment closure variable.
  it("equals getSnapshot().tick at tick 0, mid-run, and across day boundaries", () => {
    const sim = bootstrapHollowSim({ seed: 0x1a1100, ticksPerDay: 20 });

    expect(sim.tickCount).toBe(sim.getSnapshot().tick);
    expect(sim.tickCount).toBe(0);

    for (let i = 1; i <= 45; i++) {
      sim.tick();
      expect(sim.tickCount).toBe(sim.getSnapshot().tick);
      expect(sim.tickCount).toBe(i);
      // Day boundary crossed at tick 20 and tick 40 (ticksPerDay: 20) — the
      // exact ticks tickBatch's `tick % ticksPerDay === 0` metrics sampling
      // fires on. Pin both getters agreeing exactly there too.
      if (i % 20 === 0) {
        expect(sim.tickCount % 20).toBe(0);
        expect(sim.getSnapshot().tick % 20).toBe(0);
      }
    }
  });

  it("never touches the Rng (reading it draws nothing, unlike Rng.fork)", () => {
    const sim = bootstrapHollowSim({ seed: 7, ticksPerDay: 20 });
    for (let i = 0; i < 10; i++) sim.tick();
    const before = sim.rng.snapshot();
    // Read the getter several times — a plain closure read, not a draw.
    void sim.tickCount;
    void sim.tickCount;
    void sim.tickCount;
    expect(sim.rng.snapshot()).toEqual(before);
  });

  // Measures the exact claim from corpus/todos/2026-09-13-audit-04-hollow-tick-getter.md:
  // sim-worker.ts's `tickBatch(count)` called `simResult.getSnapshot().tick`
  // once per tick just to read the counter, then `postSnapshot()` calls
  // `getSnapshot()` once more for the real payload — so a batch of `count`
  // ticks cost `count + 1` builds before this fix, and costs exactly 1
  // (`postSnapshot`'s own call) after it. These two helpers reproduce
  // `tickBatch`'s loop body 1:1 (old vs. new) against a real
  // `bootstrapHollowSim`, with `getSnapshot` spied to count calls, rather
  // than estimating — see the audit-04 handoff note on why sim-worker.ts's
  // `self`-bound module isn't imported directly here.
  function oldTickBatch(sim: ReturnType<typeof bootstrapHollowSim>, count: number): void {
    for (let i = 0; i < count; i++) {
      sim.tick();
      const tick = sim.getSnapshot().tick; // the bug: full build, discarded
      void tick;
    }
  }
  function newTickBatch(sim: ReturnType<typeof bootstrapHollowSim>, count: number): void {
    for (let i = 0; i < count; i++) {
      sim.tick();
      const tick = sim.tickCount; // the fix: no build
      void tick;
    }
  }

  it("before fix: costs count+1 getSnapshot() builds per interval fire (speed 1 and speed 8)", () => {
    for (const speed of [1, 8]) {
      const sim = bootstrapHollowSim({ seed: 3, ticksPerDay: 20 });
      const spy = vi.spyOn(sim, "getSnapshot");
      oldTickBatch(sim, speed);
      sim.getSnapshot(); // postSnapshot()'s own call, once per interval fire
      expect(spy).toHaveBeenCalledTimes(speed + 1);
    }
  });

  it("after fix: costs exactly 1 getSnapshot() build per interval fire (speed 1 and speed 8)", () => {
    for (const speed of [1, 8]) {
      const sim = bootstrapHollowSim({ seed: 3, ticksPerDay: 20 });
      const spy = vi.spyOn(sim, "getSnapshot");
      newTickBatch(sim, speed);
      sim.getSnapshot(); // postSnapshot()'s own call, once per interval fire
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});
