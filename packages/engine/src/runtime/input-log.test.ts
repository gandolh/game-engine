import { describe, it, expect } from "vitest";
import { InputLog } from "./input-log";

describe("InputLog", () => {
  describe("record", () => {
    it("rejects out-of-order ticks", () => {
      const log = new InputLog();
      log.record({ tick: 5, kind: "move", payload: {} });
      log.record({ tick: 5, kind: "move", payload: {} }); // same tick is fine (non-decreasing)
      expect(() => log.record({ tick: 4, kind: "move", payload: {} })).toThrow(
        "non-decreasing tick order"
      );
    });

    it("accepts events in non-decreasing tick order", () => {
      const log = new InputLog();
      expect(() => {
        log.record({ tick: 1, kind: "a", payload: null });
        log.record({ tick: 2, kind: "b", payload: null });
        log.record({ tick: 2, kind: "c", payload: null });
        log.record({ tick: 5, kind: "d", payload: null });
      }).not.toThrow();
    });
  });

  describe("drainForTick", () => {
    it("returns all events with tick <= t and advances cursor", () => {
      const log = new InputLog();
      log.record({ tick: 1, kind: "a", payload: "x" });
      log.record({ tick: 2, kind: "b", payload: "y" });
      log.record({ tick: 3, kind: "c", payload: "z" });

      const drained = log.drainForTick(2);
      expect(drained).toHaveLength(2);
      expect(drained[0]!.kind).toBe("a");
      expect(drained[1]!.kind).toBe("b");

      // cursor advanced — draining again for tick 2 returns empty
      const again = log.drainForTick(2);
      expect(again).toHaveLength(0);

      // now drain the remaining
      const rest = log.drainForTick(3);
      expect(rest).toHaveLength(1);
      expect(rest[0]!.kind).toBe("c");
    });

    it("does not auto-clear on repeated drain for same tick after cursor advanced", () => {
      const log = new InputLog();
      log.record({ tick: 1, kind: "a", payload: null });
      log.drainForTick(1);
      // The same tick drain should now return empty (cursor past it)
      expect(log.drainForTick(1)).toHaveLength(0);
    });
  });

  describe("empty drain", () => {
    it("returns empty collection without error on empty log", () => {
      const log = new InputLog();
      const result = log.drainForTick(100);
      expect(result).toHaveLength(0);
      expect(() => result.length).not.toThrow();
    });

    it("returns frozen empty array (EMPTY sentinel)", () => {
      const log = new InputLog();
      const result = log.drainForTick(0);
      expect(result).toHaveLength(0);
    });
  });

  describe("serialize / fromSerialized round-trip", () => {
    it("preserves order and all fields", () => {
      const log = new InputLog();
      log.record({ tick: 1, kind: "jump", payload: { force: 10 } });
      log.record({ tick: 2, kind: "move", payload: { dx: 5 } });
      log.record({ tick: 2, kind: "shoot", payload: { angle: 45 } });

      const serialized = log.serialize();
      const restored = InputLog.fromSerialized(serialized);

      expect(restored.size).toBe(3);
      const all = restored.drainForTick(Infinity);
      expect(all[0]!.kind).toBe("jump");
      expect(all[1]!.kind).toBe("move");
      expect(all[2]!.kind).toBe("shoot");
      expect(all[1]!.payload).toEqual({ dx: 5 });
    });

    it("serialize returns a copy, not a live reference", () => {
      const log = new InputLog();
      log.record({ tick: 1, kind: "a", payload: null });
      const s1 = log.serialize();
      log.record({ tick: 2, kind: "b", payload: null });
      const s2 = log.serialize();
      expect(s1).toHaveLength(1);
      expect(s2).toHaveLength(2);
    });
  });
});
