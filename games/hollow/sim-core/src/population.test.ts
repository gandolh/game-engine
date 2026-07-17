import { describe, it, expect } from "vitest";
import { World, createRng } from "@engine/core";
import { needFraction } from "@engine/core/agent";
import { spawnPopulation } from "./population";
import type { HollowEntity } from "./components";
import { GRID_SIZE } from "./world";
import { NEED_FOOD, NEED_REST, NEED_WEALTH, NEED_SAFETY, NEED_BELONGING, FOOD_DECAY_PER_TICK } from "./economy";
import { VILLAGER_KIND } from "./agents";

describe("spawnPopulation", () => {
  it("spawns exactly `population` agents with in-bounds positions, full needs, self-owned empty inventory, and the villager kind", () => {
    const world = new World<HollowEntity>();
    spawnPopulation(world, createRng(11), { population: 12 });

    const agents = [...world.query("agent", "needs", "inventory", "ownership", "personality", "fsm")];
    expect(agents).toHaveLength(12);

    for (const agent of agents) {
      expect(agent.agent.gx).toBeGreaterThanOrEqual(0);
      expect(agent.agent.gx).toBeLessThan(GRID_SIZE);
      expect(agent.agent.gy).toBeGreaterThanOrEqual(0);
      expect(agent.agent.gy).toBeLessThan(GRID_SIZE);
      expect(agent.agent.moveTarget).toBeNull();

      // Every need starts full (makeNeed defaults value to max).
      for (const kind of [NEED_FOOD, NEED_REST, NEED_WEALTH, NEED_SAFETY, NEED_BELONGING]) {
        expect(needFraction(agent.needs.byKind[kind]!)).toBe(1);
      }
      // Stubs never decay.
      expect(agent.needs.byKind[NEED_SAFETY]!.decayPerTick).toBe(0);
      expect(agent.needs.byKind[NEED_BELONGING]!.decayPerTick).toBe(0);

      expect(agent.inventory.goods).toEqual({});
      expect(agent.ownership.ownerId).toBe(agent.id);
      expect(agent.personality.kind).toBe(VILLAGER_KIND);
      expect(agent.fsm.current).toBe("PERCEIVE");
    }
  });

  it("jitters each agent's active decay rates (not all identical) but keeps them within the documented range", () => {
    const world = new World<HollowEntity>();
    spawnPopulation(world, createRng(22), { population: 20 });
    const rates = [...world.query("needs")].map((a) => a.needs.byKind[NEED_FOOD]!.decayPerTick);

    // Not every agent got the exact same rate (jitter is real, not a no-op).
    expect(new Set(rates).size).toBeGreaterThan(1);
    for (const r of rates) {
      expect(r).toBeGreaterThanOrEqual(FOOD_DECAY_PER_TICK * 0.85);
      expect(r).toBeLessThanOrEqual(FOOD_DECAY_PER_TICK * 1.15);
    }
  });

  it("is deterministic: same seed -> identical positions and rates", () => {
    const worldA = new World<HollowEntity>();
    spawnPopulation(worldA, createRng(99), { population: 15 });
    const worldB = new World<HollowEntity>();
    spawnPopulation(worldB, createRng(99), { population: 15 });

    const snap = (w: World<HollowEntity>): unknown[] =>
      [...w.query("agent", "needs")].map((a) => [a.agent.gx, a.agent.gy, a.needs.byKind[NEED_FOOD]!.decayPerTick]);

    expect(snap(worldA)).toEqual(snap(worldB));
  });
});
