import { describe, it, expect, beforeEach } from "vitest";
import { World } from "@engine/core";
import type { GameEntity, FarmerFsmState } from "../components";
import { ActSystem } from "./act";
import { spawnShopkeeper } from "../agents/market-wall";
import type { ShopOffer } from "../agents/shop-slate";

function makeOffer(
  partial: Partial<ShopOffer> & Pick<ShopOffer, "crop" | "unitPrice" | "remaining">,
): ShopOffer {
  return {
    offerId: partial.offerId ?? `o-${partial.crop}-${partial.unitPrice}-${partial.remaining}`,
    kind: "sell",
    crop: partial.crop,
    unitPrice: partial.unitPrice,
    quantity: partial.quantity ?? partial.remaining,
    remaining: partial.remaining,
  };
}

function makeFarmer(
  world: World<GameEntity>,
  opts: { gold?: number; seeds?: Partial<Record<"radish" | "wheat" | "pumpkin", number>> } = {},
): GameEntity {
  return world.spawn({
    farmer: { name: "F", currentRegion: "village" as const },
    fsm: { current: "ACT" as FarmerFsmState, enteredTick: 0 },
    intentions: { queue: [] },
    inventory: {
      gold: opts.gold ?? 100,
      crops: { radish: 0, wheat: 0, pumpkin: 0 },
      seeds: { radish: 0, wheat: 0, pumpkin: 0, ...(opts.seeds ?? {}) },
    },
    beliefs: { data: { currentDay: 0 }, revision: 0 },
  });
}

describe("ActSystem buy-seed (slate-driven)", () => {
  let world: World<GameEntity>;
  let sys: ActSystem;
  let shopEntity: GameEntity;

  beforeEach(() => {
    world = new World<GameEntity>();
    sys = new ActSystem(world);
    shopEntity = spawnShopkeeper(world);
  });

  it("buy-seed succeeds when slate has matching offer: gold decremented, seeds incremented, remaining decremented", () => {
    const radishOffer = makeOffer({ crop: "radish", unitPrice: 5, remaining: 10 });
    shopEntity.shopkeeper!.dailySlate = [radishOffer];

    const farmer = makeFarmer(world, { gold: 50 });
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "radish", quantity: 3 },
      priority: 0,
    });

    sys.run({ tick: 1 });

    // cost = 5 * 3 = 15
    expect(farmer.inventory!.gold).toBe(35);
    expect(farmer.inventory!.seeds.radish).toBe(3);
    expect(radishOffer.remaining).toBe(7);
    // Farmer transitions to FINISH_DAY
    expect(farmer.fsm!.current).toBe("FINISH_DAY");
    // Queue is cleared
    expect(farmer.intentions!.queue.length).toBe(0);
  });

  it("buy-seed does nothing when slate has no matching offer", () => {
    const wheatOffer = makeOffer({ crop: "wheat", unitPrice: 10, remaining: 5 });
    shopEntity.shopkeeper!.dailySlate = [wheatOffer];

    const farmer = makeFarmer(world, { gold: 100 });
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "radish", quantity: 1 },
      priority: 0,
    });

    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(100);
    expect(farmer.inventory!.seeds.radish).toBe(0);
    // Wheat offer untouched
    expect(wheatOffer.remaining).toBe(5);
  });

  it("buy-seed does nothing when qty > total remaining; slate untouched (no partial)", () => {
    const o1 = makeOffer({ offerId: "a", crop: "radish", unitPrice: 5, remaining: 2 });
    const o2 = makeOffer({ offerId: "b", crop: "radish", unitPrice: 6, remaining: 2 });
    shopEntity.shopkeeper!.dailySlate = [o1, o2];

    const farmer = makeFarmer(world, { gold: 1000 });
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "radish", quantity: 5 }, // 5 > 2+2
      priority: 0,
    });

    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(1000);
    expect(farmer.inventory!.seeds.radish).toBe(0);
    expect(o1.remaining).toBe(2);
    expect(o2.remaining).toBe(2);
  });

  it("buy-seed does nothing when farmer gold is insufficient", () => {
    const radishOffer = makeOffer({ crop: "radish", unitPrice: 5, remaining: 10 });
    shopEntity.shopkeeper!.dailySlate = [radishOffer];

    // 4 gold < 5 needed for 1 seed
    const farmer = makeFarmer(world, { gold: 4 });
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "radish", quantity: 1 },
      priority: 0,
    });

    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(4);
    expect(farmer.inventory!.seeds.radish).toBe(0);
    expect(radishOffer.remaining).toBe(10);
  });

  it("buy-seed does nothing when no shopkeeper entity exists", () => {
    // Use a fresh world without a shopkeeper.
    const freshWorld = new World<GameEntity>();
    const freshSys = new ActSystem(freshWorld);
    const farmer = freshWorld.spawn({
      farmer: { name: "F", currentRegion: "village" as const },
      fsm: { current: "ACT" as FarmerFsmState, enteredTick: 0 },
      intentions: { queue: [] },
      inventory: {
        gold: 100,
        crops: { radish: 0, wheat: 0, pumpkin: 0 },
        seeds: { radish: 0, wheat: 0, pumpkin: 0 },
      },
      beliefs: { data: { currentDay: 0 }, revision: 0 },
    });
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "radish", quantity: 1 },
      priority: 0,
    });

    freshSys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(100);
    expect(farmer.inventory!.seeds.radish).toBe(0);
  });
});
