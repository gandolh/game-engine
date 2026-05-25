import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "./event-log";
import { InputLog } from "../runtime/input-log";
import type { SaveFile } from "./event-log";

describe("event-log", () => {
  describe("serialize / deserialize round-trip", () => {
    it("round-trips a non-empty log preserving all fields", () => {
      const log = new InputLog();
      log.record({ tick: 1, kind: "jump", payload: { force: 5 } });
      log.record({ tick: 3, kind: "move", payload: { dx: -1, dy: 0 } });
      log.record({ tick: 3, kind: "shoot", payload: { angle: 90 } });

      const seed = 42;
      const finalTick = 100;
      const save = serialize(seed, log, finalTick);

      expect(save.version).toBe(1);
      expect(save.seed).toBe(seed);
      expect(save.finalTick).toBe(finalTick);
      expect(save.events).toHaveLength(3);

      const restored = deserialize(save);
      expect(restored.seed).toBe(seed);
      expect(restored.finalTick).toBe(finalTick);

      const restoredEvents = restored.log.drainForTick(Infinity);
      expect(restoredEvents).toHaveLength(3);
      expect(restoredEvents[0]!.kind).toBe("jump");
      expect(restoredEvents[1]!.kind).toBe("move");
      expect(restoredEvents[2]!.kind).toBe("shoot");
      expect(restoredEvents[1]!.payload).toEqual({ dx: -1, dy: 0 });
    });

    it("round-trips an empty log", () => {
      const log = new InputLog();
      const save = serialize(0, log, 0);
      const restored = deserialize(save);
      expect(restored.log.size).toBe(0);
      expect(restored.finalTick).toBe(0);
    });
  });

  describe("error handling", () => {
    it("throws on unknown version", () => {
      const badSave = {
        version: 99,
        seed: 1,
        finalTick: 0,
        events: [],
      } as unknown as SaveFile;
      expect(() => deserialize(badSave)).toThrow("Unsupported save version: 99");
    });
  });
});
