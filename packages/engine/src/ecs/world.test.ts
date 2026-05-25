import { describe, it, expect } from "vitest";
import { World } from "./world";

describe("World (miniplex wrapper)", () => {
  describe("spawn", () => {
    it("assigns increasing ids when none provided", () => {
      const world = new World();
      const e1 = world.spawn({ transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 } });
      const e2 = world.spawn({ transform: { x: 1, y: 1, prevX: 0, prevY: 0, rotation: 0 } });
      const e3 = world.spawn({});
      expect(e1.id).toBe(1);
      expect(e2.id).toBe(2);
      expect(e3.id).toBe(3);
    });

    it("preserves explicit id if set", () => {
      const world = new World();
      const e = world.spawn({ id: 999 });
      expect(e.id).toBe(999);
    });

    it("does not auto-increment nextId when explicit id is provided", () => {
      const world = new World();
      world.spawn({ id: 100 });
      const auto = world.spawn({});
      // nextId should still be 1 after the explicit-id spawn
      expect(auto.id).toBe(1);
    });
  });

  describe("despawn", () => {
    it("removes entity from query", () => {
      const world = new World();
      const e = world.spawn({ transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 } });
      const q = world.query("transform");
      expect([...q.entities]).toContain(e);
      world.despawn(e);
      expect([...q.entities]).not.toContain(e);
    });
  });

  describe("query", () => {
    it("only matches entities with ALL specified components", () => {
      const world = new World();
      const both = world.spawn({
        transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 },
        sprite: { atlasId: "a", frame: "f", layer: 0, tintRgba: 0xffffffff },
      });
      const transformOnly = world.spawn({
        transform: { x: 1, y: 1, prevX: 0, prevY: 0, rotation: 0 },
      });
      const spriteOnly = world.spawn({
        sprite: { atlasId: "b", frame: "g", layer: 1, tintRgba: 0xff000000 },
      });

      const q = world.query("transform", "sprite");
      const entities = [...q.entities];
      expect(entities).toContain(both);
      expect(entities).not.toContain(transformOnly);
      expect(entities).not.toContain(spriteOnly);
    });

    it("returns all entities when querying a single present component", () => {
      const world = new World();
      const e1 = world.spawn({ transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 } });
      const e2 = world.spawn({ transform: { x: 1, y: 1, prevX: 0, prevY: 0, rotation: 0 } });
      const _noTransform = world.spawn({ id: 999 });

      const q = world.query("transform");
      const entities = [...q.entities];
      expect(entities).toContain(e1);
      expect(entities).toContain(e2);
      expect(entities).not.toContain(_noTransform);
    });
  });
});
