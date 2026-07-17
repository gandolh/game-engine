import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { ResourceWorld } from "./resources";
import { GRID_SIZE } from "./grid";

const BASE_OPTS = {
  foodNodeCount: 3,
  materialNodeCount: 2,
  foodNodeMaxStock: 100,
  foodNodeRegenPerTick: 4,
  materialNodeMaxStock: 50,
  materialNodeRegenPerTick: 2,
};

describe("ResourceWorld", () => {
  it("places the requested number of nodes of each kind, in bounds, starting at full stock", () => {
    const world = new ResourceWorld(createRng(1), BASE_OPTS);
    expect(world.nodes).toHaveLength(5);
    expect(world.nodes.filter((n) => n.kind === "food")).toHaveLength(3);
    expect(world.nodes.filter((n) => n.kind === "material")).toHaveLength(2);
    for (const node of world.nodes) {
      expect(node.gx).toBeGreaterThanOrEqual(0);
      expect(node.gx).toBeLessThan(GRID_SIZE);
      expect(node.gy).toBeGreaterThanOrEqual(0);
      expect(node.gy).toBeLessThan(GRID_SIZE);
      expect(node.stock).toBe(node.maxStock);
    }
  });

  it("node placement is deterministic for a given seed and differs across seeds", () => {
    const a = new ResourceWorld(createRng(7), BASE_OPTS);
    const b = new ResourceWorld(createRng(7), BASE_OPTS);
    expect(a.nodes.map((n) => [n.gx, n.gy])).toEqual(b.nodes.map((n) => [n.gx, n.gy]));

    const c = new ResourceWorld(createRng(8), BASE_OPTS);
    expect(a.nodes.map((n) => [n.gx, n.gy])).not.toEqual(c.nodes.map((n) => [n.gx, n.gy]));
  });

  it("harvest depletes stock and never goes negative or above what's available", () => {
    const world = new ResourceWorld(createRng(2), BASE_OPTS);
    const node = world.nodes[0]!;
    const taken = world.harvest(node.id, 40);
    expect(taken).toBe(40);
    expect(node.stock).toBe(60);

    // Harvesting more than remains only returns what's actually there.
    const over = world.harvest(node.id, 1000);
    expect(over).toBe(60);
    expect(node.stock).toBe(0);

    // A dry node yields nothing.
    expect(world.harvest(node.id, 10)).toBe(0);
  });

  it("regenTick renews stock by regenPerTick, clamped to maxStock", () => {
    const world = new ResourceWorld(createRng(3), BASE_OPTS);
    const node = world.nodes[0]!;
    world.harvest(node.id, 90); // stock now 10 (maxStock 100)
    expect(node.stock).toBe(10);

    world.regenTick(); // +4
    expect(node.stock).toBe(14);

    // Regen never exceeds maxStock even after many ticks.
    for (let i = 0; i < 100; i++) world.regenTick();
    expect(node.stock).toBe(node.maxStock);
  });

  it("nearestNode picks the closest node of the requested kind, deterministically breaking ties toward the lowest id", () => {
    const world = new ResourceWorld(createRng(4), BASE_OPTS);
    // Manually pin two food nodes equidistant from a query point to exercise the tie-break.
    const [nodeA, nodeB] = world.nodes.filter((n) => n.kind === "food");
    (nodeA as { gx: number; gy: number }).gx = 10;
    (nodeA as { gx: number; gy: number }).gy = 10;
    (nodeB as { gx: number; gy: number }).gx = 20;
    (nodeB as { gx: number; gy: number }).gy = 10;
    const nearest = world.nearestNode("food", 10, 10);
    expect(nearest?.id).toBe(nodeA!.id);

    expect(world.nearestNode("material", 10, 10)).toBeDefined();
    expect(world.nearestNode("food", 1000, 1000)?.kind).toBe("food");
  });

  it("getNode returns undefined for an unknown id", () => {
    const world = new ResourceWorld(createRng(5), BASE_OPTS);
    expect(world.getNode(-1)).toBeUndefined();
  });
});
