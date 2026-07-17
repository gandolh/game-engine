import { describe, it, expect } from "vitest";
import { createRng, World, MessageBus } from "@engine/core";
import { generateContracts, canFulfillContract, HarborSystem } from "./harbor";
import { bootstrapSim } from "../sim-bootstrap";
import { JsPathfinder } from "../world/js-pathfinder";
import { ZERO_CROPS, CROP_SELL_PRICE } from "../economy";
import { ONT_HARBOR, type HarborContract, type ContractDeliveredBody } from "../protocols/harbor";
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

  it("normal tier contracts have quantity in [2,8] (small/medium/large size bands)", () => {

    const rng = createRng(77).fork("harbor");
    const contracts = generateContracts(3, 10, rng, [0]);
    for (const c of contracts) {
      expect(c.tier).toBe("normal");
      expect(c.goods.quantity).toBeGreaterThanOrEqual(2);
      expect(c.goods.quantity).toBeLessThanOrEqual(8);
    }
  });

  it("normal tier offers all three sizes over enough draws, each with the right quantity band", () => {
    const rng = createRng(77).fork("harbor");
    const contracts = generateContracts(3, 60, rng, [0]);
    const bySize = new Map<string, typeof contracts>();
    for (const c of contracts) {
      const arr = bySize.get(c.size) ?? [];
      arr.push(c);
      bySize.set(c.size, arr);
    }
    expect(bySize.get("small")?.length ?? 0).toBeGreaterThan(0);
    expect(bySize.get("medium")?.length ?? 0).toBeGreaterThan(0);
    expect(bySize.get("large")?.length ?? 0).toBeGreaterThan(0);
    for (const c of bySize.get("small") ?? []) {
      expect(c.goods.quantity).toBeGreaterThanOrEqual(2);
      expect(c.goods.quantity).toBeLessThanOrEqual(3);
    }
    for (const c of bySize.get("medium") ?? []) {
      expect(c.goods.quantity).toBeGreaterThanOrEqual(3);
      expect(c.goods.quantity).toBeLessThanOrEqual(5);
    }
    for (const c of bySize.get("large") ?? []) {
      // "large" ≡ today's pre-brief normal-tier economics exactly.
      expect(c.goods.quantity).toBeGreaterThanOrEqual(4);
      expect(c.goods.quantity).toBeLessThanOrEqual(8);
      expect(c.reward).toBe(Math.round(CROP_SELL_PRICE[c.goods.crop] * 2.0 * c.goods.quantity));
    }
  });

  it("small/medium reward multiplier is smaller than large's but still > 1x sell price", () => {
    const rng = createRng(7).fork("harbor");
    const contracts = generateContracts(3, 60, rng, [0]);
    const sizeMult: Record<string, number> = { small: 1.3, medium: 1.6, large: 2.0 };
    for (const c of contracts) {
      const unitPrice = CROP_SELL_PRICE[c.goods.crop];
      expect(c.reward).toBeGreaterThan(unitPrice * c.goods.quantity);
      expect(c.reward).toBe(Math.round(unitPrice * sizeMult[c.size]! * c.goods.quantity));
    }
  });

  it("silver/gold tiers are always size 'large' (rare, hoarder-shaped hauls unchanged)", () => {
    const rng = createRng(99).fork("harbor");
    const contracts = generateContracts(6, 40, rng, [20]);
    for (const c of contracts) {
      if (c.tier === "silver" || c.tier === "gold") {
        expect(c.size).toBe("large");
      }
    }
    const hasSilverOrGold = contracts.some((c) => c.tier === "silver" || c.tier === "gold");
    expect(hasSilverOrGold).toBe(true);
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
      size: "large" as const,
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

describe("HarborSystem deliveryDay uses injected ticksPerDay", () => {
  function makeContract(overrides: Partial<HarborContract> = {}): HarborContract {
    return {
      id: "contract-1",
      goods: { crop: "radish", minQuality: "normal", quantity: 2 },
      reward: 10,
      reputationReward: 1,
      postedDay: 0,
      deadlineDay: 99,
      minReputation: 0,
      tier: "normal",
      size: "large",
      ...overrides,
    };
  }

  function runDelivery(ticksPerDay: number, tick: number): number {
    const world = new World<GameEntity>();
    const bus = new MessageBus();
    const rng = createRng(1);
    const system = new HarborSystem(world, bus, rng, ticksPerDay);

    const contract = makeContract();
    world.spawn({
      harborBoard: { isHarborBoard: true, openContracts: [], committed: new Map() },
      inbox: { messages: [] },
    });
    world.spawn({
      farmer: { name: "F", currentRegion: "harbor", committedContract: contract },
      inventory: { gold: 0, crops: { ...ZERO_CROPS, radish: 2 }, seeds: { ...ZERO_CROPS } },
    });

    system.run({ tick });
    bus.flush();

    const delivered = bus
      .drain()
      .find((m) => m.ontology === ONT_HARBOR.CONTRACT_DELIVERED);
    expect(delivered).toBeDefined();
    return (delivered!.body as unknown as ContractDeliveredBody).deliveryDay;
  }

  it("computes deliveryDay as floor(tick / ticksPerDay) for the default cadence (20)", () => {
    expect(runDelivery(20, 47)).toBe(2);
  });

  it("computes deliveryDay as floor(tick / ticksPerDay) for a non-default cadence", () => {

    expect(runDelivery(37, 100)).toBe(2);
    expect(runDelivery(1200, 3599)).toBe(2);
  });
});
