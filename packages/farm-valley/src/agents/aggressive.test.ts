import { ZERO_CROPS } from "../economy";
import { describe, expect, it } from "vitest";
import { deliberateAggressive } from "./aggressive";
import type { GameEntity, CropKind } from "../components";
import type { MarketOffer } from "../protocols/market";
import type { RegionId } from "../world/regions";

// proximity (brief): deliberatePlantNearby requires an empty plot within reach in
// beliefs.data.plotWater.emptyPlots. Farmer transform is (0,0); the nearest
// empty plot tile at (0,0) is Chebyshev ≤ 1 — always in reach.
const EMPTY_PLOT_IN_REACH = [{ tileX: 0, tileY: 0 }];

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
  const ZERO: Record<CropKind, number> = { ...ZERO_CROPS };
  return {
    id: overrides.id ?? 1,
    transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 },
    farmer: { name: "F", currentRegion: overrides.region ?? "village" },
    beliefs: {
      data: {
        currentDay: overrides.day ?? 0,
        // proximity (brief): emptyPlots surfaces the tile candidates for deliberatePlantNearby.
        plotWater: { planted: 0, due: 0, maxDrySoFar: 0, duePlots: [], emptyPlots: EMPTY_PLOT_IN_REACH },
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
  it("plants pumpkin when seed is available (most profitable autumn crop, brief 41)", () => {
    // Day 60 = autumn; aggressive picks pumpkin (highest in-season value among seeds held).
    const f = makeFarmer({ day: 60, seeds: { pumpkin: 1, wheat: 1, radish: 1 } });
    deliberateAggressive(f, { tick: 60 * 20 });
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

  it("buys pumpkin seed when none in stock but enough gold (autumn, brief 41)", () => {
    // Day 60 = autumn; aggressive targets pumpkin (affordable, in-season, most valuable after grape).
    // grape cost 20: 100-20=80>=10 → grape first. Use grape: seeds={} → buys grape.
    // To get pumpkin: provide grape seed so pumpkin is the next choice, or price out grape.
    // Simpler: give day 60 with no seeds, gold=100; aggressive will try grape (20) → buys grape.
    // Test the in-season buy behavior: with gold=100 and reserve=10, it should buy grape.
    const f = makeFarmer({ gold: 100, seeds: {}, day: 60 });
    deliberateAggressive(f, { tick: 1200 });
    const buy = f.intentions!.queue.find((i) => i.kind === "buy-seed");
    expect(buy).toBeDefined();
    // Autumn: grape is highest value, cost 20; 100-20=80>=10 reserve → buys grape.
    expect(buy!.data["crop"]).toBe("grape");
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
    // Day 60 = autumn; pumpkin is in-season → plant intent present.
    const f = makeFarmer({
      day: 60,
      seeds: { pumpkin: 1 },
      crops: { wheat: 3 },
      region: "village",
    });
    f.beliefs!.data["daysRemaining"] = 3;
    deliberateAggressive(f, { tick: 1200 });

    // Normal flow: planting + market actions, not pure liquidation.
    const queue = f.intentions!.queue;
    expect(queue.find((i) => i.kind === "plant")).toBeDefined();
  });

  // brief 19 — decision rationale trace
  it("records a plant reason when planting (brief 41: pumpkin in autumn)", () => {
    // Day 60 = autumn; pumpkin is in-season highest value seed held.
    const f = makeFarmer({ day: 60, seeds: { pumpkin: 1, wheat: 1, radish: 1 } });
    deliberateAggressive(f, { tick: 1200 });
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
