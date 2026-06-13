import { describe, it, expect, beforeEach } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { ApSystem, maxApForDay, tradeInitCost } from "./ap";

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
    farmer: { name: "Test", currentRegion: "farm-cora" as const },
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

    it("travel is free in AP (time-throttled)", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "travel", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(8); 
    });

    it("deducts AP for a sell (cost 3)", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "sell-shopkeeper", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(5);
    });

    it("deducts cumulative AP for multiple intentions", () => {
      const farmer = spawnFarmer(world, 8, 8, [
        { kind: "plant", priority: 1 },
        { kind: "buy-seed", priority: 2 },
        { kind: "harvest", priority: 3 },
      ]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(5); 
    });

    it("does not deduct AP below zero", () => {
      const farmer = spawnFarmer(world, 2, 8, [
        { kind: "plant", priority: 1 },
        { kind: "sell-shopkeeper", priority: 5 }, 
      ]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Intent pruning when AP is insufficient", () => {
    it("drops lowest-priority (highest priority number) intent first", () => {
      const farmer = spawnFarmer(world, 2, 8, [
        { kind: "plant", priority: 1 },
        { kind: "buy-seed", priority: 2 },
        { kind: "harvest", priority: 5 }, 
      ]);
      system.run(makeContext(0));
      const kinds = farmer.intentions!.queue.map((i) => i.kind);
      expect(kinds).not.toContain("harvest");
      expect(farmer.ap!.current).toBeGreaterThanOrEqual(0);
    });

    it("keeps sell-shopkeeper even when it has high priority number", () => {
      const farmer = spawnFarmer(world, 3, 8, [
        { kind: "plant", priority: 1 },
        { kind: "sell-shopkeeper", priority: 5 }, 
      ]);
      system.run(makeContext(0));
      const kinds = farmer.intentions!.queue.map((i) => i.kind);
      expect(kinds).toContain("sell-shopkeeper");
      expect(kinds).not.toContain("plant");
    });

    it("can drop multiple intents if needed", () => {
      const farmer = spawnFarmer(world, 1, 8, [
        { kind: "plant", priority: 1 },    
        { kind: "buy-seed", priority: 2 }, 
        { kind: "harvest", priority: 3 },  
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
      const farmer = spawnFarmer(world, 1, 8, [
        { kind: "travel", priority: 1 },
        { kind: "plant", priority: 2 },
      ]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(0);
      expect(farmer.ap!.away).toBe(true);
      expect(farmer.ap!.penaltyPending).toBe(true);
    });

    it("does not set penaltyPending when not away even if AP is 0", () => {
      const farmer = spawnFarmer(world, 1, 8, [{ kind: "plant", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(0);
      expect(farmer.ap!.away).toBe(false);
      expect(farmer.ap!.penaltyPending).toBe(false);
    });

    it("does not set penaltyPending when away but AP > 0", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "travel", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(8);
      expect(farmer.ap!.away).toBe(true);
      expect(farmer.ap!.penaltyPending).toBe(false);
    });
  });

  describe("no longer refills on WAIT_DAY", () => {
    it("leaves AP untouched in WAIT_DAY even when penaltyPending was set", () => {
      const farmer = spawnFarmer(world, 1, 8, [
        { kind: "travel", priority: 1 }, 
        { kind: "plant", priority: 2 }, 
      ]);
      system.run(makeContext(0));
      expect(farmer.ap!.away).toBe(true);
      expect(farmer.ap!.penaltyPending).toBe(true);

      const before = farmer.ap!.current;
      farmer.fsm!.current = "WAIT_DAY";
      system.run(makeContext(1));

      expect(farmer.ap!.current).toBe(before);
      expect(farmer.ap!.away).toBe(true);
      expect(farmer.ap!.penaltyPending).toBe(true);
    });

    it("marks away during ACT when a travel intent is kept", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "travel", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.away).toBe(true);
    });
  });

  describe("idle intent", () => {
    it("costs 0 AP for idle", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "idle", priority: 10 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(8);
    });
  });

  describe("farmers not in ACT state are skipped", () => {
    it("does not deduct AP for farmers in WAIT_DAY state", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "plant", priority: 1 }], "WAIT_DAY");
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(8);
    });
  });

  describe("growing AP ceiling + discount tiers (pure)", () => {
    it("maxApForDay = 100 + 2*day", () => {
      expect(maxApForDay(0)).toBe(100);
      expect(maxApForDay(1)).toBe(102);
      expect(maxApForDay(100)).toBe(300);
    });
    it("tradeInitCost is tiered on trust", () => {
      expect(tradeInitCost(0.9)).toBe(1);
      expect(tradeInitCost(0.7)).toBe(1);
      expect(tradeInitCost(0.6)).toBe(2);
      expect(tradeInitCost(0.5)).toBe(2);
      expect(tradeInitCost(0.49)).toBe(3);
      expect(tradeInitCost(0)).toBe(3);
    });
  });

  describe("AP cost table + friend discount", () => {
    it("sell-from-wall costs 3 AP", () => {
      const f = spawnFarmer(world, 8, 8, [{ kind: "sell-from-wall", priority: 1 }]);
      system.run(makeContext(0));
      expect(f.ap!.current).toBe(5);
    });

    it("auction-entry costs 2 AP, the bid is free", () => {
      const f = spawnFarmer(world, 8, 8, [
        { kind: "auction-entry", priority: 1 },
        { kind: "auction-bid", priority: 1 },
      ]);
      system.run(makeContext(0));
      expect(f.ap!.current).toBe(6); 
    });

    it("a trade-init is cheaper toward a trusted counterparty (tiered)", () => {
      const friend = world.spawn({
        farmer: { name: "Friendly", currentRegion: "village" as const },
        fsm: { current: "ACT", enteredTick: 0 },
        ap: { current: 10, max: 10, penaltyPending: false, penaltyCapacity: 5, away: false },
        intentions: {
          queue: [{ kind: "buy-from-wall", data: { sellerId: 99 }, priority: 1 }],
        },
        beliefs: { data: {}, revision: 0 },
        desires: { data: {} },
        inbox: { messages: [] },
        trust: { byId: new Map<number, number>([[99, 0.8]]) },
      });
      system.run(makeContext(0));
      expect(friend.ap!.current).toBe(9); 
    });

    it("a trade-init toward a distrusted counterparty pays the full 3 AP", () => {
      const f = world.spawn({
        farmer: { name: "Wary", currentRegion: "village" as const },
        fsm: { current: "ACT", enteredTick: 0 },
        ap: { current: 10, max: 10, penaltyPending: false, penaltyCapacity: 5, away: false },
        intentions: {
          queue: [{ kind: "buy-from-wall", data: { sellerId: 7 }, priority: 1 }],
        },
        beliefs: { data: {}, revision: 0 },
        desires: { data: {} },
        inbox: { messages: [] },
        trust: { byId: new Map<number, number>([[7, 0.2]]) },
      });
      system.run(makeContext(0));
      expect(f.ap!.current).toBe(7); 
    });
  });
});
