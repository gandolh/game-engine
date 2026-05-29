import { describe, expect, it } from "vitest";
import { deliberateAggressive } from "./aggressive";
import type { GameEntity, CropKind } from "../components";
import type { MarketOffer } from "../protocols/market";
import type { RegionId } from "../world/regions";

function makeFarmer(overrides: {
  gold?: number;
  crops?: Partial<Record<CropKind, number>>;
  seeds?: Partial<Record<CropKind, number>>;
  day?: number;
  weather?: string;
  reserve?: number;
  offers?: MarketOffer[];
  id?: number;
  region?: RegionId;
}): GameEntity {
  const ZERO: Record<CropKind, number> = { radish: 0, wheat: 0, pumpkin: 0 };
  return {
    id: overrides.id ?? 1,
    farmer: { name: "F", currentRegion: overrides.region ?? "village" },
    beliefs: {
      data: {
        currentDay: overrides.day ?? 0,
        ...(overrides.weather ? { weather: { current: overrides.weather } } : {}),
        ...(overrides.offers ? { marketOffers: overrides.offers } : {}),
      },
      revision: 0,
    },
    desires: { data: { minGoldReserve: overrides.reserve ?? 10 } },
    intentions: { queue: [] },
    inventory: {
      gold: overrides.gold ?? 100,
      crops: { ...ZERO, ...overrides.crops },
      seeds: { ...ZERO, ...overrides.seeds },
    },
  };
}

describe("deliberateAggressive", () => {
  it("plants pumpkin when seed is available (most profitable)", () => {
    const f = makeFarmer({ seeds: { pumpkin: 1, wheat: 1, radish: 1 } });
    deliberateAggressive(f, { tick: 0 });
    const plant = f.intentions!.queue.find((i) => i.kind === "plant");
    expect(plant).toBeDefined();
    expect(plant!.data["crop"]).toBe("pumpkin");
  });

  it("downgrades to radish under storm weather", () => {
    const f = makeFarmer({
      seeds: { pumpkin: 1, radish: 1 },
      weather: "storm",
    });
    deliberateAggressive(f, { tick: 0 });
    const plant = f.intentions!.queue.find((i) => i.kind === "plant");
    expect(plant!.data["crop"]).toBe("radish");
  });

  it("buys pumpkin seed when none in stock but enough gold", () => {
    const f = makeFarmer({ gold: 100, seeds: {} });
    deliberateAggressive(f, { tick: 0 });
    const buy = f.intentions!.queue.find((i) => i.kind === "buy-seed");
    expect(buy).toBeDefined();
    expect(buy!.data["crop"]).toBe("pumpkin");
  });

  it("posts inventory on the market wall every 2 days", () => {
    const f = makeFarmer({ day: 2, crops: { pumpkin: 5 } });
    deliberateAggressive(f, { tick: 2 });
    const post = f.intentions!.queue.find((i) => i.kind === "post-offer");
    expect(post).toBeDefined();
    expect(post!.data["crop"]).toBe("pumpkin");
    expect(post!.data["quantity"]).toBe(5);
    expect(post!.data["pricePerUnit"]).toBe(35);
  });

  it("does not post on odd days", () => {
    const f = makeFarmer({ day: 1, crops: { pumpkin: 5 } });
    deliberateAggressive(f, { tick: 1 });
    const post = f.intentions!.queue.find((i) => i.kind === "post-offer");
    expect(post).toBeUndefined();
  });

  it("undercuts wall offers below 90% of shop price", () => {
    const cheap: MarketOffer = {
      offerId: "o1",
      sellerId: 99,
      crop: "wheat",
      quantity: 2,
      pricePerUnit: 5, // shop=14, 90% = 12.6; 5 is well below
      postedDay: 0,
    };
    const fair: MarketOffer = {
      offerId: "o2",
      sellerId: 98,
      crop: "wheat",
      quantity: 2,
      pricePerUnit: 13,
      postedDay: 0,
    };
    const f = makeFarmer({ day: 2, gold: 1000, offers: [cheap, fair] });
    deliberateAggressive(f, { tick: 2 });
    const buys = f.intentions!.queue.filter((i) => i.kind === "buy-from-wall");
    expect(buys).toHaveLength(1);
    expect(buys[0]!.data["offerId"]).toBe("o1");
  });

  it("queues intentions sorted by priority", () => {
    const f = makeFarmer({ day: 2, seeds: { pumpkin: 1 }, crops: { wheat: 3 } });
    deliberateAggressive(f, { tick: 2 });
    const prios = f.intentions!.queue.map((i) => i.priority);
    const sorted = [...prios].sort((a, b) => a - b);
    expect(prios).toEqual(sorted);
  });

  it("prepends a travel intent before post-offer when not in village", () => {
    const f = makeFarmer({
      day: 2,
      crops: { pumpkin: 5 },
      region: "farm-cora",
    });
    deliberateAggressive(f, { tick: 2 });
    const queue = f.intentions!.queue;
    const postIdx = queue.findIndex((i) => i.kind === "post-offer");
    const travelIdx = queue.findIndex(
      (i) => i.kind === "travel" && i.data["targetRegionId"] === "village",
    );
    expect(postIdx).toBeGreaterThan(-1);
    expect(travelIdx).toBeGreaterThan(-1);
    expect(travelIdx).toBeLessThan(postIdx);
  });

  it("liquidates all crops when daysRemaining <= 2", () => {
    const f = makeFarmer({
      day: 98,
      crops: { radish: 4, wheat: 2, pumpkin: 3 },
      region: "village",
    });
    f.beliefs!.data["daysRemaining"] = 2;
    deliberateAggressive(f, { tick: 1960 });

    const queue = f.intentions!.queue;
    const sells = queue.filter((i) => i.kind === "sell-shopkeeper");
    expect(sells).toHaveLength(3);
    const cropQtys: Record<string, number> = {};
    for (const s of sells) {
      cropQtys[s.data["crop"] as string] = s.data["quantity"] as number;
    }
    expect(cropQtys["radish"]).toBe(4);
    expect(cropQtys["wheat"]).toBe(2);
    expect(cropQtys["pumpkin"]).toBe(3);
    // No planting, no market posting, no wall scanning.
    expect(queue.find((i) => i.kind === "plant")).toBeUndefined();
    expect(queue.find((i) => i.kind === "buy-seed")).toBeUndefined();
    expect(queue.find((i) => i.kind === "post-offer")).toBeUndefined();
    expect(queue.find((i) => i.kind === "read-offers")).toBeUndefined();
  });

  it("liquidation prepends travel-to-village when not in village", () => {
    const f = makeFarmer({
      day: 99,
      crops: { pumpkin: 1 },
      region: "farm-cora",
    });
    f.beliefs!.data["daysRemaining"] = 1;
    deliberateAggressive(f, { tick: 1980 });

    const queue = f.intentions!.queue;
    const travelIdx = queue.findIndex(
      (i) => i.kind === "travel" && i.data["targetRegionId"] === "village",
    );
    const sellIdx = queue.findIndex((i) => i.kind === "sell-shopkeeper");
    expect(travelIdx).toBeGreaterThan(-1);
    expect(sellIdx).toBeGreaterThan(-1);
    expect(travelIdx).toBeLessThan(sellIdx);
  });

  it("does not liquidate when daysRemaining > 2", () => {
    const f = makeFarmer({
      day: 50,
      seeds: { pumpkin: 1 },
      crops: { wheat: 3 },
      region: "village",
    });
    f.beliefs!.data["daysRemaining"] = 3;
    deliberateAggressive(f, { tick: 1000 });

    // Normal flow: planting + market actions, not pure liquidation.
    const queue = f.intentions!.queue;
    expect(queue.find((i) => i.kind === "plant")).toBeDefined();
  });

  // brief 19 — decision rationale trace
  it("records a plant reason when planting", () => {
    const f = makeFarmer({ seeds: { pumpkin: 1, wheat: 1, radish: 1 } });
    deliberateAggressive(f, { tick: 0 });
    expect(f.decisionTrace).toBeDefined();
    expect(
      f.decisionTrace!.reasons.some((r) => r.startsWith("plant pumpkin:")),
    ).toBe(true);
  });

  it("records a liquidation reason in the last 2 days", () => {
    const f = makeFarmer({ crops: { wheat: 3 }, region: "village", day: 50 });
    f.beliefs!.data["daysRemaining"] = 1;
    deliberateAggressive(f, { tick: 1000 });
    expect(
      f.decisionTrace!.reasons.some((r) => r.includes("liquidate")),
    ).toBe(true);
  });
});
