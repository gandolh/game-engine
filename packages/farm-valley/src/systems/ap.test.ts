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

    it("travel is FREE in AP (brief 28 — time-throttled instead)", () => {
      const farmer = spawnFarmer(world, 8, 8, [{ kind: "travel", priority: 1 }]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBe(8); // unchanged — travel costs 0
    });

    it("deducts AP for a sell (cost 3, brief 28)", () => {
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
      // plant=1 + buy-seed=1 + harvest=1 = 3
      expect(farmer.ap!.current).toBe(5);
    });

    it("does not deduct AP below zero", () => {
      // 2 AP, sell costs 3 → can't fit; should be dropped, AP stays >= 0
      const farmer = spawnFarmer(world, 2, 8, [
        { kind: "plant", priority: 1 },
        { kind: "sell-shopkeeper", priority: 5 }, // cost 3, won't fit
      ]);
      system.run(makeContext(0));
      expect(farmer.ap!.current).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Intent pruning when AP is insufficient", () => {
    it("drops lowest-priority (highest priority number) intent first", () => {
      // 2 AP available. plant=1, buy-seed=1, harvest=1 → total 3, drop one.
      const farmer = spawnFarmer(world, 2, 8, [
        { kind: "plant", priority: 1 },
        { kind: "buy-seed", priority: 2 },
        { kind: "harvest", priority: 5 }, // lowest priority (highest number) → dropped
      ]);
      system.run(makeContext(0));
      const kinds = farmer.intentions!.queue.map((i) => i.kind);
      expect(kinds).not.toContain("harvest");
      expect(farmer.ap!.current).toBeGreaterThanOrEqual(0);
    });

    it("keeps sell-shopkeeper even when it has high priority number", () => {
      // 3 AP. sell-shopkeeper costs 3 (protected), plant costs 1. Both = 4 > 3.
      // sell is protected → plant should be dropped, sell kept.
      const farmer = spawnFarmer(world, 3, 8, [
        { kind: "plant", priority: 1 },
        { kind: "sell-shopkeeper", priority: 5 }, // high priority number but protected
      ]);
      system.run(makeContext(0));
      const kinds = farmer.intentions!.queue.map((i) => i.kind);
      expect(kinds).toContain("sell-shopkeeper");
      expect(kinds).not.toContain("plant");
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
      // Travel is free, but a costly action drains AP to 0 while away.
      // 1 AP: free travel (away=true) + plant (cost 1) → AP 0.
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
      // travel is free now → remaining is 8 (unchanged)
      expect(farmer.ap!.current).toBe(8);
      expect(farmer.ap!.away).toBe(true);
      expect(farmer.ap!.penaltyPending).toBe(false);
    });
  });

  // brief 27 — AP refill / away-reset / penalty handling MOVED out of ApSystem
  // (it used to fire on WAIT_DAY) into the morning PHASE_START wake in
  // PerceiveSystem, because with the intra-day timeline FINISH_DAY→WAIT_DAY
  // happens once per phase. ApSystem now only prunes + deducts during ACT and
  // marks `away` / `unrested` for the morning wake to consume. These tests
  // pin that ApSystem no longer mutates AP on WAIT_DAY; the rested/unrested
  // refill itself is covered in perceive.test.ts.
  describe("no longer refills on WAIT_DAY (brief 27)", () => {
    it("leaves AP untouched in WAIT_DAY even when penaltyPending was set", () => {
      const farmer = spawnFarmer(world, 1, 8, [
        { kind: "travel", priority: 1 }, // free, flags away
        { kind: "plant", priority: 2 }, // cost 1 → AP→0
      ]);
      system.run(makeContext(0)); // ACT: away + AP→0 → penaltyPending
      expect(farmer.ap!.away).toBe(true);
      expect(farmer.ap!.penaltyPending).toBe(true);

      const before = farmer.ap!.current;
      farmer.fsm!.current = "WAIT_DAY";
      system.run(makeContext(1));

      // ApSystem must NOT refill or reset anything on WAIT_DAY anymore.
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

  describe("brief 28 — growing AP ceiling + discount tiers (pure)", () => {
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

  describe("brief 28 — new cost table + friend discount", () => {
    it("sell-from-wall now costs 3 AP (was silently 0)", () => {
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
      expect(f.ap!.current).toBe(6); // 2 + 0
    });

    it("a trade-init is cheaper toward a trusted counterparty (tiered)", () => {
      // buy-from-wall base is 3; trust 0.8 toward seller 99 → 1 AP.
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
      expect(friend.ap!.current).toBe(9); // 10 - 1 (friend discount)
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
      expect(f.ap!.current).toBe(7); // 10 - 3 (no discount)
    });
  });
});
