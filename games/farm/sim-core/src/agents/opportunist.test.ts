import { ZERO_CROPS } from "../economy";
import { describe, expect, it } from "vitest";
import { deliberateOpportunist } from "./opportunist";
import type { GameEntity, CropKind } from "../components";
import type { MarketOffer } from "../protocols/market";
import type { WeatherCondition } from "../protocols/weather";
import type { RegionId } from "../world/regions";

const EMPTY_PLOT_IN_REACH = [{ tileX: 0, tileY: 0 }];

function makeFarmer(overrides: {
  gold?: number;
  crops?: Partial<Record<CropKind, number>>;
  seeds?: Partial<Record<CropKind, number>>;
  weather?: { current?: WeatherCondition; forecast?: WeatherCondition };
  reserve?: number;
  offers?: MarketOffer[];
  trust?: Map<number, number>;
  id?: number;
  region?: RegionId;
}): GameEntity {
  const ZERO: Record<CropKind, number> = { ...ZERO_CROPS };
  const entity: GameEntity = {
    id: overrides.id ?? 1,
    transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 },
    farmer: { name: "F", currentRegion: overrides.region ?? "village" },
    beliefs: {
      data: {
        currentDay: 0,
        plotWater: { planted: 0, due: 0, maxDrySoFar: 0, duePlots: [], emptyPlots: EMPTY_PLOT_IN_REACH },
        ...(overrides.weather ? { weather: overrides.weather } : {}),
        ...(overrides.offers ? { marketOffers: overrides.offers } : {}),
      },
      revision: 0,
    },
    desires: { data: { minGoldReserve: overrides.reserve ?? 50 } },
    intentions: { queue: [] },
    inventory: {
      gold: overrides.gold ?? 200,
      crops: { ...ZERO, ...overrides.crops },
      seeds: { ...ZERO, ...overrides.seeds },
    },
  };
  if (overrides.trust) entity.trust = { byId: overrides.trust };
  return entity;
}

describe("deliberateOpportunist", () => {
  it("plants radish under storm forecast in spring (cheapest in-season)", () => {
    const f = makeFarmer({ seeds: { radish: 1 }, weather: { forecast: "storm" } });
    deliberateOpportunist(f, { tick: 0 });
    const plant = f.intentions!.queue.find((i) => i.kind === "plant");
    expect(plant).toBeDefined();
    expect(plant!.data["crop"]).toBe("radish");
  });

  it("plants wheat under sunny forecast in spring (most valuable in-season)", () => {
    const f = makeFarmer({ seeds: { wheat: 1 }, weather: { forecast: "sunny" } });
    deliberateOpportunist(f, { tick: 0 });
    const plant = f.intentions!.queue.find((i) => i.kind === "plant");
    expect(plant).toBeDefined();
    expect(plant!.data["crop"]).toBe("wheat");
  });

  it("posts at fair price when supply is low (<3 offers)", () => {
    const offers: MarketOffer[] = [
      { offerId: "x", sellerId: 5, crop: "wheat", quantity: 1, pricePerUnit: 12, postedDay: 0 },
    ];
    const f = makeFarmer({ crops: { wheat: 4 }, offers });
    deliberateOpportunist(f, { tick: 0 });
    const post = f.intentions!.queue.find((i) => i.kind === "post-offer" && i.data["crop"] === "wheat");
    expect(post).toBeDefined();
    expect(post!.data["pricePerUnit"]).toBe(12);
  });

  it("dumps to shopkeeper when supply is high (>=3 offers)", () => {
    const offers: MarketOffer[] = [
      { offerId: "x", sellerId: 5, crop: "wheat", quantity: 1, pricePerUnit: 10, postedDay: 0 },
      { offerId: "y", sellerId: 6, crop: "wheat", quantity: 1, pricePerUnit: 11, postedDay: 0 },
      { offerId: "z", sellerId: 7, crop: "wheat", quantity: 1, pricePerUnit: 13, postedDay: 0 },
    ];
    const f = makeFarmer({ crops: { wheat: 4 }, offers });
    deliberateOpportunist(f, { tick: 0 });
    const post = f.intentions!.queue.find((i) => i.kind === "post-offer" && i.data["crop"] === "wheat");
    const sell = f.intentions!.queue.find((i) => i.kind === "sell-shopkeeper" && i.data["crop"] === "wheat");
    expect(post).toBeUndefined();
    expect(sell).toBeDefined();
    expect(sell!.data["quantity"]).toBe(4);
  });

  it("buys at most one offer per day, preferring highest-trust seller", () => {
    const offers: MarketOffer[] = [
      { offerId: "lo-trust", sellerId: 5, crop: "wheat", quantity: 1, pricePerUnit: 12, postedDay: 0 },
      { offerId: "hi-trust", sellerId: 6, crop: "wheat", quantity: 1, pricePerUnit: 13, postedDay: 0 },
    ];
    const trust = new Map<number, number>([
      [5, 0.2],
      [6, 0.9],
    ]);
    const f = makeFarmer({ gold: 500, offers, trust });
    deliberateOpportunist(f, { tick: 0 });
    const buys = f.intentions!.queue.filter((i) => i.kind === "buy-from-wall");
    expect(buys).toHaveLength(1);
    expect(buys[0]!.data["offerId"]).toBe("hi-trust");
  });

  it("ignores offers priced above 110% of shop price (wheat shop=15, ceiling=16.5; 17 rejected)", () => {
    const offers: MarketOffer[] = [
      { offerId: "too-pricey", sellerId: 5, crop: "wheat", quantity: 1, pricePerUnit: 17, postedDay: 0 },
    ];
    const f = makeFarmer({ gold: 500, offers });
    deliberateOpportunist(f, { tick: 0 });
    const buys = f.intentions!.queue.filter((i) => i.kind === "buy-from-wall");
    expect(buys).toHaveLength(0);
  });

  it("always enqueues a read-offers intention", () => {
    const f = makeFarmer({});
    deliberateOpportunist(f, { tick: 0 });
    expect(f.intentions!.queue.some((i) => i.kind === "read-offers")).toBe(true);
  });

  it("falls back to the cheapest affordable crop, not the first hardcoded ladder entry (item 25)", () => {

    const f = makeFarmer({ gold: 57, reserve: 50, seeds: {}, weather: { forecast: "sunny" } });
    deliberateOpportunist(f, { tick: 0 });
    const buy = f.intentions!.queue.find((i) => i.kind === "buy-seed");
    expect(buy).toBeDefined();
    expect(buy!.data["crop"]).toBe("radish");
  });

  it("prepends a travel intent before a market action when not in village", () => {
    const offers: MarketOffer[] = [
      { offerId: "x", sellerId: 5, crop: "wheat", quantity: 1, pricePerUnit: 12, postedDay: 0 },
    ];
    const f = makeFarmer({
      crops: { wheat: 4 },
      offers,
      region: "farm-hannah",
    });
    deliberateOpportunist(f, { tick: 0 });
    const queue = f.intentions!.queue;
    const postIdx = queue.findIndex((i) => i.kind === "post-offer");
    const travelIdx = queue.findIndex(
      (i) => i.kind === "travel" && i.data["targetRegionId"] === "village",
    );
    expect(postIdx).toBeGreaterThan(-1);
    expect(travelIdx).toBeGreaterThan(-1);
    expect(travelIdx).toBeLessThan(postIdx);
  });

  it("prepends a travel intent before a shopkeeper sell when not in village and low on liquidity", () => {
    const f = makeFarmer({
      gold: 10,
      reserve: 50,
      crops: { wheat: 4 },
      region: "farm-hannah",
    });
    f.beliefs!.data["currentDay"] = 5; // avoid deliberateEarlyVillageVisit's day<=1 travel push
    f.inventory!.tools = [
      { kind: "hoe", tier: "wooden", durability: 10 },
    ]; // avoid deliberateBuyTool's own travel-to-village push
    deliberateOpportunist(f, { tick: 5 });
    const queue = f.intentions!.queue;
    const sellIdx = queue.findIndex((i) => i.kind === "sell-shopkeeper");
    const travelIdx = queue.findIndex(
      (i) => i.kind === "travel" && i.data["targetRegionId"] === "village",
    );
    expect(sellIdx).toBeGreaterThan(-1);
    expect(travelIdx).toBeGreaterThan(-1);
    expect(travelIdx).toBeLessThan(sellIdx);
  });

  it("queues exactly one travel intent for multiple crop kinds sold in one tick", () => {
    const f = makeFarmer({
      gold: 10,
      reserve: 50,
      crops: { wheat: 4, carrot: 2, tomato: 1 },
      region: "farm-hannah",
    });
    f.beliefs!.data["currentDay"] = 5; // avoid deliberateEarlyVillageVisit's day<=1 travel push
    f.inventory!.tools = [
      { kind: "hoe", tier: "wooden", durability: 10 },
    ]; // avoid deliberateBuyTool's own travel-to-village push
    deliberateOpportunist(f, { tick: 5 });
    const queue = f.intentions!.queue;
    const sells = queue.filter((i) => i.kind === "sell-shopkeeper");
    const travels = queue.filter(
      (i) => i.kind === "travel" && i.data["targetRegionId"] === "village",
    );
    expect(sells.length).toBe(3);
    expect(travels.length).toBe(1);
  });
});
