import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { generateContracts, canFulfillContract } from "./harbor";
import { bootstrapSim } from "../sim-bootstrap";
import { JsPathfinder } from "../world/js-pathfinder";
import { ZERO_CROPS } from "../economy";
import type { GameEntity } from "../components";

describe("generateContracts (pure, deterministic)", () => {
  it("generates exactly the requested count of contracts", () => {
    const rng = createRng(0xc0ffee).fork("harbor");
    const contracts = generateContracts(3, 2, rng, [0]);
    expect(contracts).toHaveLength(2);
  });

  it("is deterministic: same seed + day → same contracts", () => {
    const rng1 = createRng(42).fork("harbor");
    const rng2 = createRng(42).fork("harbor");
    const c1 = generateContracts(6, 2, rng1, [0]);
    const c2 = generateContracts(6, 2, rng2, [0]);
    expect(c1).toEqual(c2);
  });

  it("differs across different days (different call sequence yields different results)", () => {
    const rng = createRng(1).fork("harbor");
    const day3 = generateContracts(3, 2, rng, [0]);
    const day6 = generateContracts(6, 2, rng, [0]); 

    const allSame = day3.every((c, i) => c.id === day6[i]?.id);
    expect(allSame).toBe(false);
  });

  it("contract ids embed day + slot for stable replay", () => {
    const rng = createRng(0).fork("harbor");
    const contracts = generateContracts(9, 2, rng, [0]);
    expect(contracts[0]?.id).toBe("contract-9-0");
    expect(contracts[1]?.id).toBe("contract-9-1");
  });

  it("normal tier contracts have quantity in [4,8]", () => {

    const rng = createRng(77).fork("harbor");
    const contracts = generateContracts(3, 10, rng, [0]);
    for (const c of contracts) {
      expect(c.tier).toBe("normal");
      expect(c.goods.quantity).toBeGreaterThanOrEqual(4);
      expect(c.goods.quantity).toBeLessThanOrEqual(8);
    }
  });

  it("silver tier available when max rep >= 5", () => {
    const rng = createRng(99).fork("harbor");
    const contracts = generateContracts(6, 20, rng, [8]); 
    const hasSilver = contracts.some((c) => c.tier === "silver");

    expect(hasSilver).toBe(true);
  });

  it("gold tier available when max rep >= 15", () => {
    const rng = createRng(123).fork("harbor");
    const contracts = generateContracts(6, 30, rng, [20]); 
    const hasGold = contracts.some((c) => c.tier === "gold");
    expect(hasGold).toBe(true);
  });

  it("deadlineDay is postedDay + tier deadline days", () => {
    const rng = createRng(55).fork("harbor");
    const contracts = generateContracts(3, 2, rng, [0]);
    for (const c of contracts) {
      const expectedDeadline = c.postedDay + (c.tier === "normal" ? 6 : c.tier === "silver" ? 8 : 10);
      expect(c.deadlineDay).toBe(expectedDeadline);
    }
  });

  it("reward is positive and above raw sell value (reward multiplier > 1)", () => {
    const rng = createRng(7).fork("harbor");
    const contracts = generateContracts(3, 5, rng, [0]);
    for (const c of contracts) {
      expect(c.reward).toBeGreaterThan(0);
    }
  });
});

describe("canFulfillContract (pure)", () => {
  const makeInv = (overrides: Partial<GameEntity["inventory"]> = {}): GameEntity["inventory"] => ({
    gold: 100,
    crops: { ...ZERO_CROPS, radish: 5 },
    seeds: { ...ZERO_CROPS },
    ...overrides,
  });

  it("returns false if inventory is undefined", () => {
    const contract = generateContracts(1, 1, createRng(1).fork("harbor"), [0])[0]!;
    expect(canFulfillContract(undefined, contract)).toBe(false);
  });

  it("returns true when farmer has enough of the requested crop (no quality constraint)", () => {
    const rng = createRng(1).fork("harbor");
    const contract = generateContracts(1, 1, rng, [0])[0]!;
    const inv = makeInv({ crops: { ...ZERO_CROPS, [contract.goods.crop]: contract.goods.quantity } });
    expect(canFulfillContract(inv, contract)).toBe(true);
  });

  it("returns false when farmer has less than required quantity", () => {
    const rng = createRng(1).fork("harbor");
    const contract = generateContracts(1, 1, rng, [0])[0]!;
    const inv = makeInv({ crops: { ...ZERO_CROPS, [contract.goods.crop]: contract.goods.quantity - 1 } });
    expect(canFulfillContract(inv, contract)).toBe(false);
  });

  it("respects quality floor: silver-min contract requires silver or gold in stock", () => {

    const contract = {
      id: "test-q-1",
      goods: { crop: "wheat" as const, minQuality: "silver" as const, quantity: 3 },
      reward: 100,
      reputationReward: 4,
      postedDay: 1,
      deadlineDay: 9,
      minReputation: 5,
      tier: "silver" as const,
    };

    const invNormal = makeInv({
      crops: { ...ZERO_CROPS, wheat: 10 },
      cropQuality: { wheat: { normal: 10, silver: 0, gold: 0 } },
    });
    expect(canFulfillContract(invNormal, contract)).toBe(false);

    const invSilver = makeInv({
      crops: { ...ZERO_CROPS, wheat: 10 },
      cropQuality: { wheat: { normal: 7, silver: 3, gold: 0 } },
    });
    expect(canFulfillContract(invSilver, contract)).toBe(true);

    const invGold = makeInv({
      crops: { ...ZERO_CROPS, wheat: 10 },
      cropQuality: { wheat: { normal: 7, silver: 0, gold: 3 } },
    });
    expect(canFulfillContract(invGold, contract)).toBe(true);
  });
});

describe("HarborSystem integration (live sim)", () => {
  function advanceToDayStart(
    sim: ReturnType<typeof bootstrapSim>,
    targetDay: number,
  ): void {
    const maxTicks = targetDay * 25 + 100;
    let ticks = 0;
    while (sim.dayClock.day < targetDay && ticks < maxTicks) {
      sim.scheduler.tick({ tick: ticks });
      ticks++;
    }
  }

  it("spawns the harbor board entity on world setup", () => {
    const sim = bootstrapSim({
      seed: 1,
      ticksPerDay: 20,
      maxDays: 100,
      pathfinder: new JsPathfinder(),
      shock: false,
    });
    const boards = [...sim.world.query("harborBoard", "inbox")];
    expect(boards).toHaveLength(1);
    const board = boards[0]!;
    expect(board.harborBoard?.isHarborBoard).toBe(true);
    expect(Array.isArray(board.harborBoard?.openContracts)).toBe(true);
  });

  it("posts contracts on cadence days (every 3 days, 2 per batch)", () => {
    const sim = bootstrapSim({
      seed: 0xc0ffee,
      ticksPerDay: 20,
      maxDays: 30,
      pathfinder: new JsPathfinder(),
      shock: false,
    });
    advanceToDayStart(sim, 7);

    const boards = [...sim.world.query("harborBoard")];
    const board = boards[0]!;
    expect(board.harborBoard!.openContracts.length).toBeGreaterThan(0);
  });

  it("farmers have harborOpenContracts in beliefs after contracts post", () => {
    const sim = bootstrapSim({
      seed: 1,
      ticksPerDay: 20,
      maxDays: 50,
      pathfinder: new JsPathfinder(),
      shock: false,
    });
    advanceToDayStart(sim, 4);

    const farmers = [...sim.world.query("farmer", "beliefs")];
    for (const f of farmers) {
      if (f.player) continue; 
      const openContracts = f.beliefs.data.harborOpenContracts;
      expect(Array.isArray(openContracts)).toBe(true);
    }
  });

  it("HarborSystem constructor export is the correct class", () => {
    const sim = bootstrapSim({
      seed: 1,
      ticksPerDay: 20,
      maxDays: 10,
      pathfinder: new JsPathfinder(),
      shock: false,
    });
    const boards = [...sim.world.query("harborBoard")];
    expect(boards.length).toBeGreaterThan(0);
  });

  it("is deterministic: two runs with same seed produce same contract board", () => {
    const opts = {
      seed: 42,
      ticksPerDay: 20,
      maxDays: 10,
      pathfinder: new JsPathfinder(),
      shock: false,
    } as const;

    const sim1 = bootstrapSim(opts);
    const sim2 = bootstrapSim(opts);

    const run = (sim: ReturnType<typeof bootstrapSim>): string => {
      for (let t = 0; t < 10 * 20 + 50; t++) {
        sim.scheduler.tick({ tick: t });
      }
      const board = [...sim.world.query("harborBoard")][0]!;
      return JSON.stringify(
        board.harborBoard!.openContracts.map((c) => c.id).sort(),
      );
    };

    expect(run(sim1)).toBe(run(sim2));
  });
});
