import { describe, expect, it } from "vitest";
import { deliberateAggressive } from "./aggressive";
import type { GameEntity, CropKind } from "../components";
import type { MarketOffer } from "../protocols/market";

function makeFarmer(overrides: {
  gold?: number;
  crops?: Partial<Record<CropKind, number>>;
  seeds?: Partial<Record<CropKind, number>>;
  day?: number;
  weather?: string;
  reserve?: number;
  offers?: MarketOffer[];
  id?: number;
}): GameEntity {
  const ZERO: Record<CropKind, number> = { radish: 0, wheat: 0, pumpkin: 0 };
  return {
    id: overrides.id ?? 1,
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
});
