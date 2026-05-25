import { describe, expect, it } from "vitest";
import { deliberateOpportunist } from "./opportunist";
import type { GameEntity, CropKind } from "../components";
import type { MarketOffer } from "../protocols/market";
import type { WeatherCondition } from "../protocols/weather";

function makeFarmer(overrides: {
  gold?: number;
  crops?: Partial<Record<CropKind, number>>;
  seeds?: Partial<Record<CropKind, number>>;
  weather?: { current?: WeatherCondition; forecast?: WeatherCondition };
  reserve?: number;
  offers?: MarketOffer[];
  trust?: Map<number, number>;
  id?: number;
}): GameEntity {
  const ZERO: Record<CropKind, number> = { radish: 0, wheat: 0, pumpkin: 0 };
  const entity: GameEntity = {
    id: overrides.id ?? 1,
    beliefs: {
      data: {
        currentDay: 0,
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
  it("plants wheat under storm forecast", () => {
    const f = makeFarmer({ seeds: { wheat: 1 }, weather: { forecast: "storm" } });
    deliberateOpportunist(f, { tick: 0 });
    const plant = f.intentions!.queue.find((i) => i.kind === "plant");
    expect(plant!.data["crop"]).toBe("wheat");
  });

  it("plants pumpkin under sunny forecast", () => {
    const f = makeFarmer({ seeds: { pumpkin: 1 }, weather: { forecast: "sunny" } });
    deliberateOpportunist(f, { tick: 0 });
    const plant = f.intentions!.queue.find((i) => i.kind === "plant");
    expect(plant!.data["crop"]).toBe("pumpkin");
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

  it("ignores offers priced above 110% of shop price", () => {
    const offers: MarketOffer[] = [
      // wheat shop=14, 110% = 15.4 — 16 is too expensive
      { offerId: "too-pricey", sellerId: 5, crop: "wheat", quantity: 1, pricePerUnit: 16, postedDay: 0 },
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
});
