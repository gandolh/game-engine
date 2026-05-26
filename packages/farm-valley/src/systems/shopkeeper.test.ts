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

    // unitPrice = 5/unit (from the seeded slate, not a hard-coded table);
    // 2 units → -10 gold, +2 seeds, offer.remaining 10 → 8.
    expect(farmer.inventory!.gold).toBe(90);
    expect(farmer.inventory!.seeds.radish).toBe(2);
    expect(radishOffer.remaining).toBe(8);
  });

  it("SELL uses the slate unit price, not the legacy fixed price", () => {
    // Jittered price: 7 (not the legacy SHOP_SEED_PRICE.radish=5).
    const farmer = makeFarmer(world, { gold: 100 });
    seedSlate(shop, [offer({ crop: "radish", unitPrice: 7, remaining: 10 })]);
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "radish", quantity: 2 },
    });
    sys.run({ tick: 1 });

    // Cost = 7 * 2 = 14.
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
    // Do not seed the slate — `shop.shopkeeper.dailySlate` is undefined.
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
      body: { item: "seed", crop: "radish", quantity: 5 }, // 5 > 2 + 2
    });
    sys.run({ tick: 1 });

    // Atomic: no mutation on stock failure.
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
    // Slate-order is expensive-first; cheapest-first sort flips the consumption.
    const expensive = offer({ crop: "radish", unitPrice: 8, remaining: 3 });
    const cheap = offer({ crop: "radish", unitPrice: 5, remaining: 4 });
    seedSlate(shop, [expensive, cheap]);
    pushToShop(shop, {
      ontology: ONT_SHOP.SELL,
      sender: farmer.id!,
      body: { item: "seed", crop: "radish", quantity: 5 },
    });
    sys.run({ tick: 1 });

    // Cheap (5) takes 4, expensive (8) takes 1 → cost = 4*5 + 1*8 = 28.
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

    // 3 wheat all come from cheapest (a). b untouched.
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

  it("SELL with insufficient gold fails and does not mutate farmer or offers", () => {
    const farmer = makeFarmer(world, { gold: 4 }); // need 5 for one radish seed
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
    // Atomic: offer.remaining must not have decremented on gold failure.
    expect(radishOffer.remaining).toBe(10);

    bus.flush();
    const confirms = bus.drain().filter((m) => m.ontology === ONT_SHOP.CONFIRM);
    expect(confirms[0]!.performative).toBe(PERFORMATIVE.FAILURE);
    const body = confirms[0]!.body as { ok: boolean; reason?: string };
    expect(body.reason).toBe("insufficient-gold");
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
