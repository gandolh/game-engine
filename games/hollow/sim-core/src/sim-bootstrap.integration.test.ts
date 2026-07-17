import { describe, it, expect } from "vitest";
import { bootstrapHollowSim } from "./sim-bootstrap";
import { NEED_FOOD } from "./economy";

/**
 * Exercises the wired-up perceive -> deliberate -> act -> needs-decay ->
 * resource-regen loop end to end. Confirms need decay is real (drains when
 * not eating), a harvest actually depletes node stock, and eating actually
 * replenishes the need — not just "it ran".
 */
describe("bootstrapHollowSim — real substrate behavior (chunk hollow-03)", () => {
  it("a lone agent's food need decays, then rises once it starts harvesting; the node's stock drops by what was harvested", () => {
    const sim = bootstrapHollowSim({
      seed: 0x1a1103,
      ticksPerDay: 20,
      population: 1,
      foodNodeCount: 1,
      materialNodeCount: 0,
      // A slow regen (well below FOOD_HARVEST_PER_TICK) so a SINGLE
      // harvester can actually draw the node's stock down below its
      // starting max — the default regen is deliberately high (see
      // economy/constants.ts's derivation) to stay ample under many
      // simultaneous harvesters, which would otherwise mask depletion here.
      foodNodeRegenPerTick: 1,
    });

    const foodNode = sim.resources.nodes[0]!;
    const initialStock = foodNode.stock;

    // Co-locate the agent with the node so, once it starts seeking, it
    // harvests immediately rather than spending dozens of ticks walking —
    // keeps this test's tick budget small without changing anything about
    // the decay/threshold/harvest logic under test.
    const [agent] = [...sim.world.query("agent", "needs")];
    agent!.agent.gx = foodNode.gx;
    agent!.agent.gy = foodNode.gy;

    const foodOverTime: number[] = [];
    const stockOverTime: number[] = [];
    for (let i = 0; i < 250; i++) {
      sim.tick();
      foodOverTime.push(agent!.needs.byKind[NEED_FOOD]!.value);
      stockOverTime.push(foodNode.stock);
    }

    const minFood = Math.min(...foodOverTime);
    const minIndex = foodOverTime.indexOf(minFood);
    // Food must have dropped from its starting max at some point (decay is real)...
    expect(minFood).toBeLessThan(100);
    // ...and recovered afterward (harvesting + eating is real, not a one-way drain).
    expect(foodOverTime[foodOverTime.length - 1]).toBeGreaterThan(minFood);
    // The recovery must show up strictly after the low point, not just noise around it.
    expect(minIndex).toBeLessThan(foodOverTime.length - 1);

    // The only agent in the sim harvested from the only food node, so its
    // stock must have been drawn down from full at some point during the
    // run (regen alone — 5/tick — can and does bring it back to max by the
    // end, since the harvest burst is short; the MIN over the run is the
    // real signal that a harvest happened).
    expect(Math.min(...stockOverTime)).toBeLessThan(initialStock);

    const snapshot = sim.getSnapshot();
    expect(snapshot.aliveCount).toBe(1);
    expect(snapshot.resourceNodes).toHaveLength(1);
    expect(snapshot.agents).toHaveLength(1);
    // Each tick's harvested food is fully consumed the same tick (see
    // systems/act.ts) — the good is transient, so inventory settles at 0.
    expect(snapshot.agents[0]!.inventory.food ?? 0).toBe(0);
  });

  it("needs decay every tick for an agent with nothing to do (no nodes at all)", () => {
    const sim = bootstrapHollowSim({
      seed: 5,
      ticksPerDay: 20,
      population: 1,
      foodNodeCount: 0,
      materialNodeCount: 0,
    });
    const [agent] = [...sim.world.query("needs")];
    const startFood = agent!.needs.byKind[NEED_FOOD]!.value;

    for (let i = 0; i < 10; i++) sim.tick();

    const endFood = agent!.needs.byKind[NEED_FOOD]!.value;
    expect(endFood).toBeLessThan(startFood);
  });
});
