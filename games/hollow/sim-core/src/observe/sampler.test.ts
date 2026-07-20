/**
 * Small end-to-end proof that `MetricsSampler` — the class extracted out
 * of `tools/hollow-sim/src/run-core.ts`'s inline `sampleRow` closure
 * (chunk hollow-10a) — produces the same shape/behavior standalone against
 * a real `bootstrapHollowSim()` + `createChronicle()` pair, without going
 * through the CLI at all. Deliberately tiny (default profile, ~60 ticks) —
 * NOT a multi-thousand-tick sweep (see `feedback_sim_resource_limits` /
 * CLAUDE.md's "keep runs small" convention).
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim } from "../sim-bootstrap";
import { createChronicle } from "./chronicle";
import { MetricsSampler } from "./sampler";

describe("MetricsSampler", () => {
  it("samples a year-0 baseline row with all windows at 0", () => {
    const sim = bootstrapHollowSim({ seed: 1, ticksPerDay: 20, population: 8 });
    const chronicle = createChronicle(sim.bus);
    const sampler = new MetricsSampler();

    const row0 = sampler.sample(sim, chronicle, 0);
    expect(row0.tick).toBe(0);
    expect(row0.year).toBe(0);
    expect(row0.population).toBe(8);
    expect(row0.births_window).toBe(0);
    expect(row0.deaths_window).toBe(0);
    expect(row0.coop_window).toBe(0);
    expect(row0.antag_window).toBe(0);
  });

  it("accumulates windows correctly across repeated samples on a ticking sim", () => {
    const sim = bootstrapHollowSim({ seed: 1, ticksPerDay: 20, population: 8 });
    const chronicle = createChronicle(sim.bus);
    const sampler = new MetricsSampler();

    const rows = [sampler.sample(sim, chronicle, 0)];
    for (let tick = 1; tick <= 60; tick++) {
      sim.tick();
      if (tick % 20 === 0) rows.push(sampler.sample(sim, chronicle, tick / 20));
    }

    expect(rows.length).toBe(4); // years 0..3
    // Every window's cumulative sum must reconcile with the final cumulative reads.
    const finalSnap = sim.getSnapshot();
    const birthsWindowSum = rows.reduce((s, r) => s + r.births_window, 0);
    expect(birthsWindowSum).toBe(finalSnap.bornCount);
  });

  it("two fresh samplers over two fresh sims with the same seed produce byte-identical rows", () => {
    function run(): unknown[] {
      const sim = bootstrapHollowSim({ seed: 5, ticksPerDay: 20, population: 8 });
      const chronicle = createChronicle(sim.bus);
      const sampler = new MetricsSampler();
      const rows = [sampler.sample(sim, chronicle, 0)];
      for (let tick = 1; tick <= 40; tick++) {
        sim.tick();
        if (tick % 20 === 0) rows.push(sampler.sample(sim, chronicle, tick / 20));
      }
      return rows;
    }
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
