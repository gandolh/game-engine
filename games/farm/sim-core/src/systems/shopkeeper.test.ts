import { ZERO_CROPS } from "../economy";
import { describe, it, expect, beforeEach } from "vitest";
import { MessageBus, World, createRng } from "@engine/core";
import type { GameEntity } from "../components";
import { ShopkeeperSystem } from "./shopkeeper";
import { AuctionSystem } from "./auction";
import { spawnShopkeeper } from "../agents/market-wall";
import { ONT_SHOP } from "../protocols/shop";
import { PERFORMATIVE } from "../protocols/performatives";
import type { ShopOffer } from "../agents/shop-slate";

function makeFarmer(
  world: World<GameEntity>,
  opts: { gold?: number; crops?: Partial<Record<"radish" | "wheat" | "pumpkin", number>>; day?: number } = {},
): GameEntity {
  return world.spawn({
    farmer: { name: "F", currentRegion: "village" as const },
    inbox: { messages: [] },
    inventory: {
      gold: opts.gold ?? 100,
      crops: { ...ZERO_CROPS, ...(opts.crops ?? {}) },
      seeds: { ...ZERO_CROPS },
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

function seedSlate(shop: GameEntity, offers: ShopOffer[]): void {
  shop.shopkeeper!.dailySlate = offers;
}

function offer(
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

    expect(farmer.inventory!.gold).toBe(24);
    expect(farmer.inventory!.crops.radish).toBe(0);

    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    expect(confirms).toHaveLength(1);
    expect(confirms[0]!.recipient).toBe(farmer.id);
    const body = confirms[0]!.body as { ok: boolean; goldDelta: number; itemDelta: { crop: string; quantity: number } };
    expect(body.ok).toBe(true);
    expect(body.goldDelta).toBe(24);
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

    expect(farmer.inventory!.gold).toBe(68);
    expect(farmer.inventory!.crops.wheat).toBe(0);
    expect(farmer.inventory!.crops.pumpkin).toBe(0);
  });

  it("BUY debits cropQuality in lockstep with crops (no phantom tier after a partial buy)", () => {
    // Brief 99, review-findings item 28: the shopkeeper used to do
    // `farmer.inventory.crops[crop] -= taken` directly, never touching
    // cropQuality — leaving a phantom tier count once crops[] shrank out
    // from under it. Regression-guards the debitCrop() routing.
    const farmer = makeFarmer(world, { gold: 0, crops: { radish: 4 } });
    farmer.inventory!.cropQuality = { radish: { normal: 0, silver: 0, gold: 4 } };

    pushToShop(shop, {
      ontology: ONT_SHOP.BUY,
      sender: farmer.id!,
      body: { crop: "radish", quantity: 2 },
    });
    sys.run({ tick: 1 });

    expect(farmer.inventory!.crops.radish).toBe(2);
    const q = farmer.inventory!.cropQuality!.radish!;
    expect(q.normal + q.silver + q.gold).toBe(farmer.inventory!.crops.radish);
    expect(q).toEqual({ normal: 0, silver: 0, gold: 2 });
  });

  it("SELL of seed reads price from slate, mutates farmer + decrements offer.remaining", () => {
    const farmer = makeFarmer(world, { gold: 100 });
    const radishOffer = offer({ crop: "radish", unitPrice: 5, remaining: 10 });
    seedSlate(shop, [radishOffer]);
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "radish", quantity: 2 },
    });
    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(90);
    expect(farmer.inventory!.seeds.radish).toBe(2);
    expect(radishOffer.remaining).toBe(8);
  });

  it("SELL uses the slate unit price, not the legacy fixed price", () => {

    const farmer = makeFarmer(world, { gold: 100 });
    seedSlate(shop, [offer({ crop: "radish", unitPrice: 7, remaining: 10 })]);
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "radish", quantity: 2 },
    });
    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(86);
    expect(farmer.inventory!.seeds.radish).toBe(2);

    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    expect(confirms).toHaveLength(1);
    const body = confirms[0]!.body as { ok: boolean; goldDelta: number };
    expect(body.ok).toBe(true);
    expect(body.goldDelta).toBe(-14);
  });

  it("SELL fails with no-matching-offer when slate has no matching crop", () => {
    const farmer = makeFarmer(world, { gold: 100 });
    seedSlate(shop, [offer({ crop: "wheat", unitPrice: 9, remaining: 10 })]);
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "radish", quantity: 1 },
    });
    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(100);
    expect(farmer.inventory!.seeds.radish).toBe(0);

    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    expect(confirms[0]!.performative).toBe(PERFORMATIVE.FAILURE);
    const body = confirms[0]!.body as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("no-matching-offer");
  });

  it("SELL fails with no-matching-offer when slate is missing entirely", () => {
    const farmer = makeFarmer(world, { gold: 100 });

    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "radish", quantity: 1 },
    });
    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(100);
    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    const body = confirms[0]!.body as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("no-matching-offer");
  });

  it("SELL fails with insufficient-stock when cumulative remaining < qty", () => {
    const farmer = makeFarmer(world, { gold: 1000 });
    const o1 = offer({ crop: "radish", unitPrice: 5, remaining: 2 });
    const o2 = offer({ crop: "radish", unitPrice: 6, remaining: 2 });
    seedSlate(shop, [o1, o2]);
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "radish", quantity: 5 }, 
    });
    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(1000);
    expect(farmer.inventory!.seeds.radish).toBe(0);
    expect(o1.remaining).toBe(2);
    expect(o2.remaining).toBe(2);

    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    const body = confirms[0]!.body as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("insufficient-stock");
  });

  it("SELL fills across multiple matching offers cheapest-first", () => {
    const farmer = makeFarmer(world, { gold: 1000 });

    const expensive = offer({ crop: "radish", unitPrice: 8, remaining: 3 });
    const cheap = offer({ crop: "radish", unitPrice: 5, remaining: 4 });
    seedSlate(shop, [expensive, cheap]);
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "radish", quantity: 5 },
    });
    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(972);
    expect(farmer.inventory!.seeds.radish).toBe(5);
    expect(cheap.remaining).toBe(0);
    expect(expensive.remaining).toBe(2);

    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    const body = confirms[0]!.body as { ok: boolean; goldDelta: number; itemDelta: { crop: string; quantity: number } };
    expect(body.ok).toBe(true);
    expect(body.goldDelta).toBe(-28);
    expect(body.itemDelta).toEqual({ crop: "radish", quantity: 5 });
  });

  it("SELL only fills as many offers as needed (preserves later offer.remaining)", () => {
    const farmer = makeFarmer(world, { gold: 1000 });
    const a = offer({ crop: "wheat", unitPrice: 6, remaining: 4 });
    const b = offer({ crop: "wheat", unitPrice: 7, remaining: 2 });
    seedSlate(shop, [a, b]);
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "wheat", quantity: 3 },
    });
    sys.run({ tick: 1 });

    expect(a.remaining).toBe(1);
    expect(b.remaining).toBe(2);
    expect(farmer.inventory!.gold).toBe(1000 - 3 * 6);
    expect(farmer.inventory!.seeds.wheat).toBe(3);
  });

  it("SELL respects golden_bean ban with FAILURE CONFIRM", () => {
    const farmer = makeFarmer(world, { gold: 100000 });
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "golden_bean", quantity: 1 },
    });
    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(100000);

    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    expect(confirms).toHaveLength(1);
    expect(confirms[0]!.performative).toBe(PERFORMATIVE.FAILURE);
    const body = confirms[0]!.body as { ok: boolean; reason?: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("golden-bean-auction-only");
  });

  it("SELL with insufficient gold fails and does not mutate farmer or offers", () => {
    const farmer = makeFarmer(world, { gold: 4 }); 
    const radishOffer = offer({ crop: "radish", unitPrice: 5, remaining: 10 });
    seedSlate(shop, [radishOffer]);
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "radish", quantity: 1 },
    });
    sys.run({ tick: 1 });

    expect(farmer.inventory!.gold).toBe(4);
    expect(farmer.inventory!.seeds.radish).toBe(0);

    expect(radishOffer.remaining).toBe(10);

    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    expect(confirms[0]!.performative).toBe(PERFORMATIVE.FAILURE);
    const body = confirms[0]!.body as { ok: boolean; reason?: string };
    expect(body.reason).toBe("insufficient-gold");
  });

  it("triggers an auction every K days and registers it with AuctionSystem", () => {

    const sys2 = new ShopkeeperSystem(bus, world, auction, {
      auctionEveryDays: 2,
      auctionDurationTicks: 10,
    });
    const farmer = makeFarmer(world, { day: 0 });
    sys2.run({ tick: 0 });
    expect(auction.auctions.size).toBe(1);

    farmer.beliefs!.data.currentDay = 1;
    sys2.run({ tick: 1 });
    expect(auction.auctions.size).toBe(1);

    farmer.beliefs!.data.currentDay = 2;
    sys2.run({ tick: 2 });
    expect(auction.auctions.size).toBe(2);

    bus.flush();
    const cfps = bus.drain().filter((m) => m.ontology === ONT_SHOP.AUCTION_CFP);
    expect(cfps.length).toBeGreaterThanOrEqual(1);
    expect(cfps[0]!.recipient).toBe("broadcast");
  });
});
