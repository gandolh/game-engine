/**
 * Determinism + real-effect proofs for `HollowShockSystem` (chunk hollow-11a).
 * Every scenario runs through the REAL `bootstrapHollowSim` scheduler (not a
 * hand-built harness) so the "SHOCK is the very first stage, before
 * PERCEIVE" placement is exercised end to end, exactly like a real caller
 * would drive it via `scheduleShock`.
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSimOptions } from "../sim-bootstrap";
import { NEED_REST } from "../economy";

const NO_AGENTS: HollowSimOptions = {
  seed: 11,
  ticksPerDay: 20,
  population: 0,
  foodNodeCount: 4,
  foodNodeMaxStock: 100,
  foodNodeRegenPerTick: 10,
  materialNodeCount: 2,
  materialNodeMaxStock: 50,
  materialNodeRegenPerTick: 5,
};

describe("HollowShockSystem — famine/boom (regen multiplier)", () => {
  it("famine measurably drops the effective regen rate for the targeted resource kind only", () => {
    const sim = bootstrapHollowSim(NO_AGENTS);
    // Deplete every food node so regen (not harvesting) is the only thing
    // that can move stock — isolates the shock's effect cleanly.
    for (const node of sim.resources.nodes) sim.resources.harvest(node.id, node.maxStock);

    sim.scheduleShock({ kind: "famine", resourceKind: "food", factor: 0.1, durationTicks: 5 });
    sim.tick(); // shock applies at this tick boundary (SHOCK runs before RESOURCE-REGEN, same tick)

    for (const node of sim.resources.nodes) {
      if (node.kind === "food") expect(node.stock).toBeCloseTo(1, 10); // 10 * 0.1
      else expect(node.stock).toBeCloseTo(5, 10); // material untouched — still full regenPerTick
    }
  });

  it("boom measurably raises the effective regen rate", () => {
    const sim = bootstrapHollowSim(NO_AGENTS);
    for (const node of sim.resources.nodes) sim.resources.harvest(node.id, node.maxStock);

    sim.scheduleShock({ kind: "boom", resourceKind: "food", factor: 2, durationTicks: 5 });
    sim.tick();

    for (const node of sim.resources.nodes.filter((n) => n.kind === "food")) {
      expect(node.stock).toBeCloseTo(20, 10); // 10 * 2
    }
  });

  it("applies at a TICK BOUNDARY only — no effect before the scheduled tick, full effect starting exactly at it, and reverts once the window ends", () => {
    const sim = bootstrapHollowSim(NO_AGENTS);
    for (const node of sim.resources.nodes) sim.resources.harvest(node.id, node.maxStock);

    // 3 ticks of normal regen first.
    sim.tick();
    sim.tick();
    sim.tick();
    const beforeShock = sim.resources.nodes.find((n) => n.kind === "food")!.stock;
    expect(beforeShock).toBeCloseTo(30, 10); // 3 * 10, no shock yet

    // Scheduled for the NEXT boundary (tick 3) with a 2-tick window.
    sim.scheduleShock({ kind: "famine", resourceKind: "food", factor: 0, durationTicks: 2 });
    sim.tick(); // tick 3 — famine active, regen contributes 0
    sim.tick(); // tick 4 — still active
    const duringShock = sim.resources.nodes.find((n) => n.kind === "food")!.stock;
    expect(duringShock).toBeCloseTo(beforeShock, 10); // unchanged — factor 0 the whole window

    sim.tick(); // tick 5 — window [3,5) has ended, regen resumes at full rate
    const afterShock = sim.resources.nodes.find((n) => n.kind === "food")!.stock;
    expect(afterShock).toBeCloseTo(duringShock + 10, 10);
  });

  it("byte-identical outcome across two fresh runs given the same schedule (determinism)", () => {
    const run = () => {
      const sim = bootstrapHollowSim(NO_AGENTS);
      for (const node of sim.resources.nodes) sim.resources.harvest(node.id, node.maxStock);
      sim.scheduleShock({ kind: "famine", resourceKind: "food", factor: 0.3, durationTicks: 4 });
      for (let i = 0; i < 10; i++) sim.tick();
      return { stocks: sim.resources.nodes.map((n) => n.stock), log: sim.interventionLog };
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("HollowShockSystem — disaster (one-shot node destruction)", () => {
  it("zeros exactly the chosen node's stock, deterministically, replaying identically across two fresh runs", () => {
    const run = () => {
      const sim = bootstrapHollowSim(NO_AGENTS);
      sim.scheduleShock({ kind: "disaster", resourceKind: "food" });
      sim.tick();
      return sim.resources.nodes.filter((n) => n.kind === "food").map((n) => n.stock);
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);

    // Real effect: exactly one food node was hit (stock below max — see this
    // file's header: RESOURCE-REGEN still runs later in the SAME tick, so a
    // destroyed node isn't left at a bare 0, just far below max), the rest
    // stayed at full stock.
    const hit = a.filter((stock) => stock < 100);
    expect(hit).toHaveLength(1);
    expect(hit[0]).toBeLessThan(20); // regenPerTick(10) << maxStock(100)
  });
});

describe("HollowShockSystem — plague (bounded need drain)", () => {
  it("drains the targeted need by exactly amountPerTick beyond natural decay, for every living agent, for the window's duration", () => {
    const opts: HollowSimOptions = { seed: 5, ticksPerDay: 20, population: 5 };
    const baseline = bootstrapHollowSim(opts);
    const plagued = bootstrapHollowSim(opts);
    plagued.scheduleShock({ kind: "plague", need: NEED_REST, amountPerTick: 3, durationTicks: 5 });

    for (let i = 0; i < 5; i++) {
      baseline.tick();
      plagued.tick();
    }

    const baselineRest = [...baseline.world.query("needs")]
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      .map((e) => e.needs.byKind[NEED_REST]!.value);
    const plaguedRest = [...plagued.world.query("needs")]
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      .map((e) => e.needs.byKind[NEED_REST]!.value);

    expect(plaguedRest).toHaveLength(baselineRest.length);
    for (let i = 0; i < baselineRest.length; i++) {
      expect(baselineRest[i]! - plaguedRest[i]!).toBeCloseTo(3 * 5, 10); // 5 ticks * amountPerTick
    }
  });
});
