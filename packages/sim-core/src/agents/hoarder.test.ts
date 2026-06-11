import { ZERO_CROPS } from "../economy";
import { describe, expect, it, beforeEach } from "vitest";
import { deliberateHoarder, _resetCnpCoordinatorsForTests } from "./hoarder";
import type { GameEntity, CropKind } from "../components";
import type { MarketOffer } from "../protocols/market";
import type { RegionId } from "../world/regions";

// Farmer transform (0,0); tile (0,0) is always within Chebyshev reach.
const EMPTY_PLOT_IN_REACH = [{ tileX: 0, tileY: 0 }];

function makeFarmer(overrides: {
  gold?: number;
  crops?: Partial<Record<CropKind, number>>;
  seeds?: Partial<Record<CropKind, number>>;
  day?: number;
  reserve?: number;
  offers?: MarketOffer[];
  trust?: Map<number, number>;
  id?: number;
  plotId?: number;
  region?: RegionId;
}): GameEntity {
  const ZERO: Record<CropKind, number> = { ...ZERO_CROPS };
  const entity: GameEntity = {
    id: overrides.id ?? 1,
    transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 },
    farmer: { name: "F", currentRegion: overrides.region ?? "village" },
    beliefs: {
      data: {
        currentDay: overrides.day ?? 0,
        plotWater: { planted: 0, due: 0, maxDrySoFar: 0, duePlots: [], emptyPlots: EMPTY_PLOT_IN_REACH },
        ...(overrides.offers ? { marketOffers: overrides.offers } : {}),
        ...(overrides.plotId !== undefined ? { plotId: overrides.plotId } : {}),
      },
      revision: 0,
    },
    desires: { data: { minGoldReserve: overrides.reserve ?? 80 } },
    intentions: { queue: [] },
    inventory: {
      gold: overrides.gold ?? 300,
      crops: { ...ZERO, ...overrides.crops },
      seeds: { ...ZERO, ...overrides.seeds },
    },
  };
  if (overrides.trust) entity.trust = { byId: overrides.trust };
  return entity;
}

describe("deliberateHoarder", () => {
  beforeEach(() => {
    _resetCnpCoordinatorsForTests();
  });

  it("plants grape when seed is available (highest autumn value, day 60)", () => {
    const f = makeFarmer({ seeds: { grape: 1 }, plotId: 0, day: 60 });
    deliberateHoarder(f, { tick: 1200 });
    const plant = f.intentions!.queue.find((i) => i.kind === "plant");
    expect(plant).toBeDefined();
    expect(plant!.data["crop"]).toBe("grape");
  });

  it("falls back to seed on hand when no preferred crop can be bought (day 60, gold barely above reserve)", () => {
    // gold=82, reserve=80: grape(20) and pumpkin(15) both dip below reserve; pumpkin seed in hand → plants it.
    const f = makeFarmer({ seeds: { pumpkin: 1 }, plotId: 0, day: 60, gold: 82, reserve: 80 });
    deliberateHoarder(f, { tick: 1200 });
    const plant = f.intentions!.queue.find((i) => i.kind === "plant");
    expect(plant).toBeDefined();
    expect(plant!.data["crop"]).toBe("pumpkin");
  });

  it("falls back to radish only when no high-tier crop is affordable", () => {
    // gold=85, reserve=80: only radish(5) fits (85-5=80≥80); high-tier seeds would dip below.
    const f = makeFarmer({ gold: 85, reserve: 80, seeds: {}, plotId: 0 });
    deliberateHoarder(f, { tick: 0 });
    const buy = f.intentions!.queue.find((i) => i.kind === "buy-seed");
    expect(buy).toBeDefined();
    expect(buy!.data["crop"]).toBe("radish");
  });

  it("buys radish offers from market wall up to 105% of shop price (shop=9, ceiling=9.45)", () => {
    const offers: MarketOffer[] = [
      { offerId: "ok", sellerId: 5, crop: "radish", quantity: 2, pricePerUnit: 9, postedDay: 0 },
      { offerId: "too-pricey", sellerId: 6, crop: "radish", quantity: 2, pricePerUnit: 10, postedDay: 0 },
    ];
    const f = makeFarmer({ gold: 500, offers, day: 1 });
    deliberateHoarder(f, { tick: 0 });
    const buys = f.intentions!.queue.filter((i) => i.kind === "buy-from-wall");
    expect(buys).toHaveLength(1);
    expect(buys[0]!.data["offerId"]).toBe("ok");
  });

  it("prioritizes higher-trust sellers when buying from the wall", () => {
    const offers: MarketOffer[] = [
      { offerId: "lo", sellerId: 5, crop: "radish", quantity: 1, pricePerUnit: 7, postedDay: 0 },
      { offerId: "hi", sellerId: 6, crop: "radish", quantity: 1, pricePerUnit: 7, postedDay: 0 },
    ];
    const trust = new Map<number, number>([
      [5, 0.1],
      [6, 0.9],
    ]);
    const f = makeFarmer({ gold: 500, offers, day: 1, trust });
    deliberateHoarder(f, { tick: 0 });
    const buys = f.intentions!.queue.filter((i) => i.kind === "buy-from-wall");
    expect(buys[0]!.data["offerId"]).toBe("hi");
  });

  it("queues read-offers intention with a radish filter", () => {
    const f = makeFarmer({ day: 1 });
    deliberateHoarder(f, { tick: 0 });
    const read = f.intentions!.queue.find((i) => i.kind === "read-offers");
    expect(read).toBeDefined();
    const filter = read!.data["filter"] as { crop?: string } | undefined;
    expect(filter?.crop).toBe("radish");
  });

  it("prepends a travel intent before buy-from-wall when not in village", () => {
    const offers: MarketOffer[] = [
      { offerId: "ok", sellerId: 5, crop: "radish", quantity: 2, pricePerUnit: 8, postedDay: 0 },
    ];
    const f = makeFarmer({
      gold: 500,
      offers,
      day: 1,
      region: "farm-otto",
    });
    deliberateHoarder(f, { tick: 0 });
    const queue = f.intentions!.queue;
    const buyIdx = queue.findIndex((i) => i.kind === "buy-from-wall");
    const travelIdx = queue.findIndex(
      (i) => i.kind === "travel" && i.data["targetRegionId"] === "village",
    );
    expect(buyIdx).toBeGreaterThan(-1);
    expect(travelIdx).toBeGreaterThan(-1);
    expect(travelIdx).toBeLessThan(buyIdx);
  });
});
