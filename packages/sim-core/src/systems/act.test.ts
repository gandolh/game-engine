import { ZERO_CROPS } from "../economy";
import { describe, it, expect, beforeEach } from "vitest";
import { World, MessageBus } from "@engine/core";
import type { GameEntity, FarmerFsmState } from "../components";
import { ActSystem } from "./act";
import { maxApForDay, SHRINE_AP_BOOST, SHRINE_COOLDOWN_DAYS, HELPER_AP_BOOST, HELPER_AP_MARGIN } from "./ap";
import { ShopkeeperSystem } from "./shopkeeper";
import { AuctionSystem } from "./auction";
import { InboxDispatchSystem } from "./inbox-dispatch";
import { spawnShopkeeper } from "../agents/market-wall";
import { createRng } from "@engine/core";
import { ONT_SHOP, type ShopSellBody } from "../protocols/shop";
import { PERFORMATIVE } from "../protocols/performatives";
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
      crops: { ...ZERO_CROPS },
      seeds: { ...ZERO_CROPS, ...(opts.seeds ?? {}) },
    },
    beliefs: { data: { currentDay: 0 }, revision: 0 },
  });
}

// buy-seed emits ONT_SHOP.SELL; ShopkeeperSystem owns slate/gold/seed mutation.
describe("ActSystem buy-seed (emits ONT_SHOP.SELL)", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: ActSystem;
  let shopEntity: GameEntity;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    sys = new ActSystem(world, createRng(1), bus);
    shopEntity = spawnShopkeeper(world);
  });

  it("buy-seed emits one ONT_SHOP.SELL message addressed to the shopkeeper", () => {
    const farmer = makeFarmer(world, { gold: 50 });
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "radish", quantity: 3 },
      priority: 0,
    });

    sys.run({ tick: 1 });
    bus.flush();
    const sent = bus.drain();

    const sell = sent.filter((m) => m.ontology === ONT_SHOP.SELL);
    expect(sell.length).toBe(1);
    const m = sell[0]!;
    expect(m.recipient).toBe(shopEntity.id);
    expect(m.sender).toBe(farmer.id);
    expect(m.performative).toBe(PERFORMATIVE.REQUEST);
    const body = m.body as unknown as ShopSellBody;
    expect(body.item).toBe("seed");
    expect(body.crop).toBe("radish");
    expect(body.quantity).toBe(3);

    expect(farmer.fsm!.current).toBe("FINISH_DAY");
    expect(farmer.intentions!.queue.length).toBe(0);

    // ActSystem does NOT touch inventory or slate — only emits the message.
    expect(farmer.inventory!.gold).toBe(50);
    expect(farmer.inventory!.seeds.radish).toBe(0);
  });

  it("buy-seed defaults quantity to 1 when omitted", () => {
    const farmer = makeFarmer(world);
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "wheat" },
      priority: 0,
    });

    sys.run({ tick: 1 });
    bus.flush();
    const body = bus.drain().find((m) => m.ontology === ONT_SHOP.SELL)!
      .body as unknown as ShopSellBody;
    expect(body.quantity).toBe(1);
  });

  it("buy-seed emits nothing when no shopkeeper entity exists", () => {
    const freshWorld = new World<GameEntity>();
    const freshBus = new MessageBus();
    const freshSys = new ActSystem(freshWorld, createRng(1), freshBus);
    const farmer = makeFarmer(freshWorld);
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "radish", quantity: 1 },
      priority: 0,
    });

    freshSys.run({ tick: 1 });
    freshBus.flush();
    expect(freshBus.drain().filter((m) => m.ontology === ONT_SHOP.SELL).length).toBe(0);
  });
});

// Seed lands one tick after buy-seed ACT (accepted one-tick latency through bus pipeline).
describe("ActSystem buy-seed end-to-end through the shopkeeper", () => {
  it("credits seeds + decrements gold and slate one tick later", () => {
    const world = new World<GameEntity>();
    const bus = new MessageBus();
    const act = new ActSystem(world, createRng(1), bus);
    const dispatch = new InboxDispatchSystem(bus, world);
    const auction = new AuctionSystem(bus, world, createRng(1));
    const shop = new ShopkeeperSystem(bus, world, auction);

    const shopEntity = spawnShopkeeper(world);
    const radishOffer = makeOffer({ crop: "radish", unitPrice: 5, remaining: 10 });
    shopEntity.shopkeeper!.dailySlate = [radishOffer];

    const farmer = makeFarmer(world, { gold: 50 });
    farmer.intentions!.queue.push({
      kind: "buy-seed",
      data: { crop: "radish", quantity: 3 },
      priority: 0,
    });

    // Tick 1: ActSystem emits the SELL; nothing applied yet.
    act.run({ tick: 1 });
    expect(farmer.inventory!.gold).toBe(50);
    expect(farmer.inventory!.seeds.radish).toBe(0);

    // Tick 2: dispatch delivers to the shop inbox, ShopkeeperSystem applies it.
    dispatch.run({ tick: 2 });
    shop.run({ tick: 2 });

    expect(farmer.inventory!.gold).toBe(35); // 50 - 5*3
    expect(farmer.inventory!.seeds.radish).toBe(3);
    expect(radishOffer.remaining).toBe(7);
  });
});

describe("ActSystem upgrade-tool (blacksmith validates materials)", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: ActSystem;

  function blacksmithFarmer(
    opts: { gold?: number; tier?: "wooden" | "stone"; stone?: number; ironOre?: number },
  ): GameEntity {
    const tier = opts.tier ?? "wooden";
    return world.spawn({
      farmer: { name: "Smith", currentRegion: "blacksmith" as const },
      fsm: { current: "ACT" as FarmerFsmState, enteredTick: 0 },
      intentions: { queue: [] },
      inventory: {
        gold: opts.gold ?? 100,
        crops: { ...ZERO_CROPS },
        seeds: { ...ZERO_CROPS },
        tools: [{ kind: "hoe", tier, durability: 100 }],
      },
      resources: { wood: 0, stone: opts.stone ?? 0, ironOre: opts.ironOre ?? 0, geodes: 0 },
      beliefs: { data: { currentDay: 5 }, revision: 0 },
    });
  }

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    sys = new ActSystem(world, createRng(1), bus);
    world.spawn({ blacksmith: { isBlacksmith: true } });
  });

  it("upgrades wooden→stone, consuming raw stone + gold", () => {
    const farmer = blacksmithFarmer({ gold: 100, tier: "wooden", stone: 5 });
    farmer.intentions!.queue.push({ kind: "upgrade-tool", data: { toolKind: "hoe" }, priority: 0 });
    sys.run({ tick: 0 });
    const hoe = farmer.inventory!.tools!.find((t) => t.kind === "hoe")!;
    expect(hoe.tier).toBe("stone");
    expect(farmer.resources!.stone).toBe(3); // 5 - 2 consumed
    expect(farmer.inventory!.gold).toBe(85); // 100 - 15
  });

  it("rejects the upgrade when the farmer has no ore (no mutation)", () => {
    const farmer = blacksmithFarmer({ gold: 100, tier: "wooden", stone: 0 });
    farmer.intentions!.queue.push({ kind: "upgrade-tool", data: { toolKind: "hoe" }, priority: 0 });
    sys.run({ tick: 0 });
    const hoe = farmer.inventory!.tools!.find((t) => t.kind === "hoe")!;
    expect(hoe.tier).toBe("wooden"); // unchanged
    expect(farmer.inventory!.gold).toBe(100); // not charged
  });

  it("stone→iron consumes iron ore", () => {
    const farmer = blacksmithFarmer({ gold: 100, tier: "stone", ironOre: 3 });
    farmer.intentions!.queue.push({ kind: "upgrade-tool", data: { toolKind: "hoe" }, priority: 0 });
    sys.run({ tick: 0 });
    const hoe = farmer.inventory!.tools!.find((t) => t.kind === "hoe")!;
    expect(hoe.tier).toBe("iron");
    expect(farmer.resources!.ironOre).toBe(1); // 3 - 2
    expect(farmer.inventory!.gold).toBe(75); // 100 - 25
  });
});

describe("ActSystem hire-help (tavern day-helper)", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let sys: ActSystem;

  function villageFarmer(opts: {
    gold?: number;
    region?: "village" | "farm-cora";
    day?: number;
    apCurrent?: number;
    apMax?: number;
  }): GameEntity {
    const day = opts.day ?? 5;
    return world.spawn({
      farmer: { name: "Hannah", currentRegion: (opts.region ?? "village") as never },
      fsm: { current: "ACT" as FarmerFsmState, enteredTick: 0 },
      intentions: { queue: [] },
      inventory: { gold: opts.gold ?? 100, crops: { ...ZERO_CROPS }, seeds: { ...ZERO_CROPS } },
      ap: {
        current: opts.apCurrent ?? 10,
        max: opts.apMax ?? maxApForDay(day),
        penaltyPending: false,
        penaltyCapacity: 0,
        away: false,
      },
      beliefs: { data: { currentDay: day }, revision: 0 },
    });
  }

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    sys = new ActSystem(world, createRng(1), bus);
  });

  it("charges gold, boosts AP same-day, and records the hire day", () => {
    const farmer = villageFarmer({ gold: 100, day: 5, apCurrent: 10 });
    farmer.intentions!.queue.push({ kind: "hire-help", data: {}, priority: 0 });
    sys.run({ tick: 0 });
    expect(farmer.inventory!.gold).toBe(75); // 100 - 25
    expect(farmer.ap!.current).toBe(10 + HELPER_AP_BOOST); // same-day boost
    expect(farmer.farmer!.helperHiredDay).toBe(5);
  });

  it("a second hire the same day is a no-op (once-per-day cooldown)", () => {
    const farmer = villageFarmer({ gold: 100, day: 5, apCurrent: 10 });
    farmer.intentions!.queue.push({ kind: "hire-help", data: {}, priority: 0 });
    sys.run({ tick: 0 });
    const goldAfterFirst = farmer.inventory!.gold;
    const apAfterFirst = farmer.ap!.current;
    // Try again the same day.
    farmer.fsm!.current = "ACT" as FarmerFsmState;
    farmer.intentions!.queue.push({ kind: "hire-help", data: {}, priority: 0 });
    sys.run({ tick: 1 });
    expect(farmer.inventory!.gold).toBe(goldAfterFirst); // no further charge
    expect(farmer.ap!.current).toBe(apAfterFirst); // no further boost
  });

  it("clamps the same-day boost to maxApForDay + margin (no snowball)", () => {
    const day = 5;
    const cap = maxApForDay(day);
    // Start already at the day ceiling: the boost can't push past cap + margin.
    const farmer = villageFarmer({ gold: 100, day, apCurrent: cap, apMax: cap });
    farmer.intentions!.queue.push({ kind: "hire-help", data: {}, priority: 0 });
    sys.run({ tick: 0 });
    const ceiling = cap + HELPER_AP_MARGIN;
    expect(farmer.ap!.current).toBe(Math.min(cap + HELPER_AP_BOOST, ceiling));
    expect(farmer.ap!.current).toBeLessThanOrEqual(ceiling);
    // max is nudged up to preserve current ≤ max when the margin bites.
    expect(farmer.ap!.max).toBeGreaterThanOrEqual(farmer.ap!.current);
  });

  it("does nothing when not in the village", () => {
    const farmer = villageFarmer({ gold: 100, region: "farm-cora", apCurrent: 10 });
    farmer.intentions!.queue.push({ kind: "hire-help", data: {}, priority: 0 });
    sys.run({ tick: 0 });
    expect(farmer.inventory!.gold).toBe(100);
    expect(farmer.ap!.current).toBe(10); // no boost
    expect(farmer.farmer!.helperHiredDay).toBeUndefined();
  });

  it("does nothing when too poor to afford the hire", () => {
    const farmer = villageFarmer({ gold: 10, apCurrent: 10 });
    farmer.intentions!.queue.push({ kind: "hire-help", data: {}, priority: 0 });
    sys.run({ tick: 0 });
    expect(farmer.inventory!.gold).toBe(10);
    expect(farmer.ap!.current).toBe(10); // no boost
    expect(farmer.farmer!.helperHiredDay).toBeUndefined();
  });
});

describe("ActSystem pray-at-shrine (interactive shrine)", () => {
  let world: World<GameEntity>;
  let sys: ActSystem;

  function shrineFarmer(opts: {
    region?: "shrine" | "farm-cora";
    day?: number;
    apCurrent?: number;
    apMax?: number;
    prayedDay?: number;
  }): GameEntity {
    const day = opts.day ?? 5;
    return world.spawn({
      farmer: {
        name: "Olin",
        currentRegion: (opts.region ?? "shrine") as never,
        ...(opts.prayedDay !== undefined ? { shrinePrayedDay: opts.prayedDay } : {}),
      },
      fsm: { current: "ACT" as FarmerFsmState, enteredTick: 0 },
      intentions: { queue: [] },
      inventory: { gold: 100, crops: { ...ZERO_CROPS }, seeds: { ...ZERO_CROPS } },
      ap: {
        current: opts.apCurrent ?? 20,
        max: opts.apMax ?? maxApForDay(day),
        penaltyPending: false,
        penaltyCapacity: 0,
        away: false,
      },
      beliefs: { data: { currentDay: day }, revision: 0 },
    });
  }

  beforeEach(() => {
    world = new World<GameEntity>();
    sys = new ActSystem(world, createRng(1));
  });

  it("raises AP by the boost and records the prayer day when ON the shrine and OFF cooldown", () => {
    const farmer = shrineFarmer({ region: "shrine", day: 5, apCurrent: 20 });
    farmer.intentions!.queue.push({ kind: "pray-at-shrine", data: {}, priority: 0 });
    sys.run({ tick: 0 });
    expect(farmer.ap!.current).toBe(20 + SHRINE_AP_BOOST);
    expect(farmer.farmer!.shrinePrayedDay).toBe(5);
  });

  it("clamps the boost to maxApForDay (never exceeds a full day)", () => {
    const day = 5;
    const cap = maxApForDay(day);
    const farmer = shrineFarmer({ region: "shrine", day, apCurrent: cap - 3, apMax: cap });
    farmer.intentions!.queue.push({ kind: "pray-at-shrine", data: {}, priority: 0 });
    sys.run({ tick: 0 });
    expect(farmer.ap!.current).toBe(cap); // would be cap+9 unclamped
    expect(farmer.ap!.current).toBeLessThanOrEqual(maxApForDay(day));
  });

  it("is a no-op when NOT on the shrine", () => {
    const farmer = shrineFarmer({ region: "farm-cora", day: 5, apCurrent: 20 });
    farmer.intentions!.queue.push({ kind: "pray-at-shrine", data: {}, priority: 0 });
    sys.run({ tick: 0 });
    expect(farmer.ap!.current).toBe(20);
    expect(farmer.farmer!.shrinePrayedDay).toBeUndefined();
  });

  it("is a no-op while still on cooldown (< SHRINE_COOLDOWN_DAYS since last prayer)", () => {
    // prayed on day 5, now day 5 + (cooldown - 1) → still on cooldown.
    const day = 5 + (SHRINE_COOLDOWN_DAYS - 1);
    const farmer = shrineFarmer({ region: "shrine", day, apCurrent: 20, prayedDay: 5 });
    farmer.intentions!.queue.push({ kind: "pray-at-shrine", data: {}, priority: 0 });
    sys.run({ tick: 0 });
    expect(farmer.ap!.current).toBe(20);
    expect(farmer.farmer!.shrinePrayedDay).toBe(5); // unchanged
  });

  it("prays again once the cooldown has elapsed", () => {
    const day = 5 + SHRINE_COOLDOWN_DAYS;
    const farmer = shrineFarmer({ region: "shrine", day, apCurrent: 20, prayedDay: 5 });
    farmer.intentions!.queue.push({ kind: "pray-at-shrine", data: {}, priority: 0 });
    sys.run({ tick: 0 });
    expect(farmer.ap!.current).toBe(20 + SHRINE_AP_BOOST);
    expect(farmer.farmer!.shrinePrayedDay).toBe(day);
  });
});
