import { describe, it, expect, beforeEach } from "vitest";
import { MessageBus, World, createRng } from "@engine/core";
import type { GameEntity } from "../components";
import { ShopkeeperSystem } from "./shopkeeper";
import { AuctionSystem } from "./auction";
import { spawnShopkeeper } from "../agents/market-wall";
import { ONT_SHOP } from "../protocols/shop";
import { PERFORMATIVE } from "../protocols/performatives";

function makeFarmer(
  world: World<GameEntity>,
  opts: { gold?: number; crops?: Partial<Record<"radish" | "wheat" | "pumpkin", number>>; day?: number } = {},
): GameEntity {
  return world.spawn({
    farmer: { name: "F", currentRegion: "village" as const },
    inbox: { messages: [] },
    inventory: {
      gold: opts.gold ?? 100,
      crops: { radish: 0, wheat: 0, pumpkin: 0, ...(opts.crops ?? {}) },
      seeds: { radish: 0, wheat: 0, pumpkin: 0 },
    },
    beliefs: { data: { currentDay: opts.day ?? 0 }, revision: 0 },
  });
}

function pushToShop(shop: GameEntity, msg: {
  ontology: string;
  sender: number;
  body: Record<string, unknown>;
}): void {
  shop.inbox!.messages.push({
    performative: PERFORMATIVE.REQUEST,
    ontology: msg.ontology,
    sender: msg.sender,
    body: msg.body,
    tickIssued: 0,
  });
}

describe("ShopkeeperSystem", () => {
  let world: World<GameEntity>;
  let bus: MessageBus;
  let shop: GameEntity;
  let sys: ShopkeeperSystem;
  let auction: AuctionSystem;

  beforeEach(() => {
    world = new World<GameEntity>();
    bus = new MessageBus();
    shop = spawnShopkeeper(world);
    const rng = createRng(7);
    auction = new AuctionSystem(bus, world, rng);
    sys = new ShopkeeperSystem(bus, world, auction);
  });

  it("BUY responds with correct CONFIRM payload and mutates farmer inventory", () => {
    const farmer = makeFarmer(world, { gold: 0, crops: { radish: 4 } });
    pushToShop(shop, {
      ontology: ONT_SHOP.BUY,
      sender: farmer.id!,
      body: { crop: "radish", quantity: 4 },
    });
    sys.run({ tick: 1 });

    // radish buy price = 5/unit; 4 units → +20 gold, -4 radish
    expect(farmer.inventory!.gold).toBe(20);
    expect(farmer.inventory!.crops.radish).toBe(0);

    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    expect(confirms).toHaveLength(1);
    expect(confirms[0]!.recipient).toBe(farmer.id);
    const body = confirms[0]!.body as { ok: boolean; goldDelta: number; itemDelta: { crop: string; quantity: number } };
    expect(body.ok).toBe(true);
    expect(body.goldDelta).toBe(20);
    expect(body.itemDelta).toEqual({ crop: "radish", quantity: -4 });
  });

  it("BUY gold delta matches the price table for wheat and pumpkin", () => {
    const farmer = makeFarmer(world, { gold: 0, crops: { wheat: 3, pumpkin: 2 } });
    pushToShop(shop, {
      ontology: ONT_SHOP.BUY,
      sender: farmer.id!,
      body: { crop: "wheat", quantity: 3 },
    });
    pushToShop(shop, {
      ontology: ONT_SHOP.BUY,
      sender: farmer.id!,
      body: { crop: "pumpkin", quantity: 2 },
    });
    sys.run({ tick: 1 });

    // wheat 8*3 = 24, pumpkin 22*2 = 44, total = 68
    expect(farmer.inventory!.gold).toBe(68);
    expect(farmer.inventory!.crops.wheat).toBe(0);
    expect(farmer.inventory!.crops.pumpkin).toBe(0);
  });

  it("SELL of seed updates gold/seeds and acks", () => {
    const farmer = makeFarmer(world, { gold: 100 });
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "radish", quantity: 2 },
    });
    sys.run({ tick: 1 });

    // radish seed cost = 5/unit; 2 units → -10 gold, +2 seeds
    expect(farmer.inventory!.gold).toBe(90);
    expect(farmer.inventory!.seeds.radish).toBe(2);
  });

  it("SELL respects golden_bean ban with FAILURE CONFIRM", () => {
    const farmer = makeFarmer(world, { gold: 100000 });
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "golden_bean", quantity: 1 },
    });
    sys.run({ tick: 1 });

    // Gold unchanged.
    expect(farmer.inventory!.gold).toBe(100000);

    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    expect(confirms).toHaveLength(1);
    expect(confirms[0]!.performative).toBe(PERFORMATIVE.FAILURE);
    const body = confirms[0]!.body as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("golden-bean-auction-only");
  });

  it("SELL with insufficient gold fails and does not mutate", () => {
    const farmer = makeFarmer(world, { gold: 4 }); // need 5 for one radish seed
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "radish", quantity: 1 },
    });
    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(4);
    expect(farmer.inventory!.seeds.radish).toBe(0);

    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    expect(confirms[0]!.performative).toBe(PERFORMATIVE.FAILURE);
  });

  it("triggers an auction every K days and registers it with AuctionSystem", () => {
    // Default interval is 5 days; first eligible day relative to -Infinity is day 0.
    const sys2 = new ShopkeeperSystem(bus, world, auction, {
      auctionEveryDays: 2,
      auctionDurationTicks: 10,
    });
    const farmer = makeFarmer(world, { day: 0 });
    sys2.run({ tick: 0 });
    expect(auction.auctions.size).toBe(1);

    // Day 1 — too soon, no new auction.
    farmer.beliefs!.data.currentDay = 1;
    sys2.run({ tick: 1 });
    expect(auction.auctions.size).toBe(1);

    // Day 2 — interval elapsed, another auction.
    farmer.beliefs!.data.currentDay = 2;
    sys2.run({ tick: 2 });
    expect(auction.auctions.size).toBe(2);

    // Confirm CFP broadcast was sent.
    bus.flush();
    const cfps = bus.drain().filter((m) => m.ontology === ONT_SHOP.AUCTION_CFP);
    expect(cfps.length).toBeGreaterThanOrEqual(1);
    expect(cfps[0]!.recipient).toBe("broadcast");
  });
});
