import { describe, it, expect, beforeEach } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { ApSystem } from "./ap";

function makeWorld(): World<GameEntity> {
  return new World<GameEntity>();
}

function makeContext(tick = 0) {
  return { tick, deltaMs: 16, totalMs: tick * 16 };
}

function spawnFarmer(
  world: World<GameEntity>,
  apCurrent: number,
  apMax = 8,
  intentions: Array<{ kind: string; priority: number }> = [],
  fsmState: "ACT" | "FINISH_DAY" | "WAIT_DAY" = "ACT",
): GameEntity {
  return world.spawn({
    farmer: { name: "Test" },
    fsm: { current: fsmState, enteredTick: 0 },
    ap: {
      current: apCurrent,
      max: apMax,
      penaltyPending: false,
      penaltyCapacity: Math.floor(apMax / 2),
      away: false,
    },
    intentions: {
      queue: intentions.map((i) => ({ kind: i.kind, data: {}, priority: i.priority })),
    },
    beliefs: { data: {}, revision: 0 },
    desires: { data: {} },
    inbox: { messages: [] },
  });
}

describe("ApSystem", () => {
  let world: World<GameEntity>;
  let system: ApSystem;

  beforeEach(() => {
    world = makeWorld();
    system = new ApSystem(world);
  });

  describe("AP deduction", () => {
    it("deducts AP for a plant intention (cost 1)", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "plant", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(7);
    });

    it("deducts AP for a buy-seed intention (cost 1)", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "buy-seed", priority: 2 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(7);
    });

    it("deducts AP for travel (cost 2)", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "travel", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(6);
    });

    it("deducts cumulative AP for multiple intentions", () => {
      const farmer = spawnFarmer(world, 8, 8, [
        { kind: "plant", priority: 1 },
        { kind: "buy-seed", priority: 2 },
        { kind: "travel", priority: 3 },
      ]);
      system.run(makeContext(0));
      // plant=1 + buy-seed=1 + travel=2 = 4
      expect(farmer.ap!.current).toBe(4);
    });

    it("does not deduct AP below zero", () => {
      // 2 AP, travel costs 2 + plant costs 1 = 3 total; plant should be dropped
      const farmer = spawnFarmer(world, 2, 8, [
        { kind: "travel", priority: 1 },
        { kind: "plant", priority: 5 }, // lower priority (higher number) → dropped first
      ]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Intent pruning when AP is insufficient", () => {
    it("drops lowest-priority (highest priority number) intent first", () => {
      // 3 AP available. plant=1, buy-seed=1, travel=2 → total 4, need to drop one
      const farmer = spawnFarmer(world, 3, 8, [
        { kind: "plant", priority: 1 },
        { kind: "buy-seed", priority: 2 },
        { kind: "travel", priority: 5 }, // lowest priority (highest number) → should be dropped
      ]);
      system.run(makeContext(0));
      const queue = farmer.intentions!.queue;
      const kinds = queue.map((i) => i.kind);
      // travel should be dropped (priority 5 is "least important")
      expect(kinds).not.toContain("travel");
      expect(farmer.ap!.current).toBeGreaterThanOrEqual(0);
    });

    it("keeps sell-shopkeeper even when it has high priority number", () => {
      // 2 AP available. sell-shopkeeper costs 2, travel costs 2. Both together cost 4.
      // sell-shopkeeper is protected → travel should be dropped, sell kept.
      const farmer = spawnFarmer(world, 2, 8, [
        { kind: "travel", priority: 1 },
        { kind: "sell-shopkeeper", priority: 5 }, // high priority number but protected
      ]);
      system.run(makeContext(0));
      const queue = farmer.intentions!.queue;
      const kinds = queue.map((i) => i.kind);
      expect(kinds).toContain("sell-shopkeeper");
      expect(kinds).not.toContain("travel");
    });

    it("can drop multiple intents if needed", () => {
      // 1 AP available, all three costs 1 each → keep 1, drop 2
      const farmer = spawnFarmer(world, 1, 8, [
        { kind: "plant", priority: 1 },    // keep (lowest priority number = most important)
        { kind: "buy-seed", priority: 2 }, // drop
        { kind: "harvest", priority: 3 },  // drop
      ]);
      system.run(makeContext(0));
      const queue = farmer.intentions!.queue;
      expect(queue.length).toBe(1);
      expect(farmer.ap!.current).toBe(0);
    });
  });

  describe("away flag and penaltyPending", () => {
    it("sets away=true when travel intent is kept", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "travel", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.away).toBe(true);
    });

    it("sets penaltyPending=true when away and AP reaches 0", () => {
      // Exactly enough AP to pay for travel, nothing left
      const farmer = spawnFarmer(world, 2, 8, [{ kind: "travel", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(0);
      expect(farmer.ap!.away).toBe(true);
      expect(farmer.ap!.penaltyPending).toBe(true);
    });

    it("does not set penaltyPending when not away even if AP is 0", () => {
      // Plant costs 1, farmer has exactly 1 AP but no travel
      const farmer = spawnFarmer(world, 1, 8, [{ kind: "plant", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(0);
      expect(farmer.ap!.away).toBe(false);
      expect(farmer.ap!.penaltyPending).toBe(false);
    });

    it("does not set penaltyPending when away but AP > 0", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "travel", priority: 1 }]);
      system.run(makeContext(0));
      // travel costs 2, has 8 → remaining is 6
      expect(farmer.ap!.current).toBe(6);
      expect(farmer.ap!.away).toBe(true);
      expect(farmer.ap!.penaltyPending).toBe(false);
    });
  });

  describe("penalty next day", () => {
    it("resets AP to penaltyCapacity next day if penaltyPending was set", () => {
      // Simulate: farmer in ACT state, will get penalty
      const farmer = spawnFarmer(world, 2, 8, [{ kind: "travel", priority: 1 }]);
      system.run(makeContext(0)); // ACT phase: sets penaltyPending

      expect(farmer.ap!.penaltyPending).toBe(true);

      // Simulate FinishDaySystem running: resets to max
      farmer.ap!.current = farmer.ap!.max; // as FinishDaySystem does
      farmer.fsm!.current = "WAIT_DAY";    // as FinishDaySystem does

      // ApSystem runs again: should apply penalty
      system.run(makeContext(1));

      expect(farmer.ap!.current).toBe(farmer.ap!.penaltyCapacity);
      expect(farmer.ap!.penaltyPending).toBe(false);
    });

    it("resets AP to full max next day if no penalty", () => {
      // Normal day: plant, no travel, AP > 0 after
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "plant", priority: 1 }]);
      system.run(makeContext(0));

      // Simulate FinishDaySystem
      farmer.ap!.current = farmer.ap!.max;
      farmer.fsm!.current = "WAIT_DAY";

      system.run(makeContext(1));

      // No penalty: AP stays at max (ApSystem doesn't touch it when no penaltyPending)
      expect(farmer.ap!.current).toBe(farmer.ap!.max);
      expect(farmer.ap!.penaltyPending).toBe(false);
    });

    it("resets away flag at WAIT_DAY transition", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "travel", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.away).toBe(true);

      // Simulate FinishDaySystem
      farmer.ap!.current = farmer.ap!.max;
      farmer.fsm!.current = "WAIT_DAY";

      system.run(makeContext(1));
      expect(farmer.ap!.away).toBe(false);
    });
  });

  describe("idle intent", () => {
    it("costs 0 AP for idle", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "idle", priority: 10 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(8); // No deduction
    });
  });

  describe("farmers not in ACT state are skipped", () => {
    it("does not deduct AP for farmers in WAIT_DAY state", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "plant", priority: 1 }], "WAIT_DAY");
      system.run(makeContext(0));
      // No deduction, but away reset happens
      expect(farmer.ap!.current).toBe(8);
    });
  });
});
