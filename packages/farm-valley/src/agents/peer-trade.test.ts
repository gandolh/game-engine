import { describe, expect, it } from "vitest";
import type { GameEntity, CropKind } from "../components";
import type { MeetBody, OfferSeedBody } from "../protocols/encounter";
import {
  initiatePeerTradeHoarder,
  respondToPeerOfferHoarder,
} from "./hoarder";
import { respondToPeerOfferAggressive } from "./aggressive";
import { respondToPeerOfferConservative } from "./conservative";
import { respondToPeerOfferOpportunist } from "./opportunist";

const ZERO: Record<CropKind, number> = { radish: 0, wheat: 0, pumpkin: 0 };

function makeFarmer(overrides: {
  id?: number;
  gold?: number;
  reserve?: number;
  seeds?: Partial<Record<CropKind, number>>;
  day?: number;
}): GameEntity {
  return {
    id: overrides.id ?? 1,
    farmer: { name: "F", currentRegion: "village" },
    beliefs: { data: { currentDay: overrides.day ?? 0 }, revision: 0 },
    desires: { data: { minGoldReserve: overrides.reserve ?? 30 } },
    intentions: { queue: [] },
    inventory: {
      gold: overrides.gold ?? 200,
      crops: { ...ZERO },
      seeds: { ...ZERO, ...overrides.seeds },
    },
  };
}

function offer(
  direction: "buy" | "sell",
  crop: CropKind,
  unitPrice: number,
  quantity: number,
): OfferSeedBody {
  return { offerId: "t", crop, quantity, unitPrice, direction };
}

const MEET: MeetBody = { peerId: 99, regionId: "village" };

describe("hoarder peer-trade hooks", () => {
  describe("initiate", () => {
    it("emits a buy offer for radish with deterministic offerId", () => {
      const f = makeFarmer({ id: 1, gold: 200, reserve: 80, seeds: { radish: 0 } });
      f.beliefs!.data["currentDay"] = 2;
      const out = initiatePeerTradeHoarder(f, MEET, { tick: 42 });
      expect(out).not.toBeNull();
      expect(out!.crop).toBe("radish");
      expect(out!.direction).toBe("buy");
      expect(out!.quantity).toBe(3);
      expect(out!.unitPrice).toBe(4.5);
      expect(out!.offerId).toBe("peer-1-99-42-2-radish");
    });

    it("returns null when hoarder already has 3+ radish seeds", () => {
      const f = makeFarmer({ id: 1, gold: 200, seeds: { radish: 3 } });
      expect(initiatePeerTradeHoarder(f, MEET, { tick: 0 })).toBeNull();
    });

    it("returns null when funds would dip below reserve", () => {
      // qty 3 * price 4.5 = 13.5; reserve 80 → need gold >= 93.5
      const f = makeFarmer({ id: 1, gold: 90, reserve: 80, seeds: {} });
      expect(initiatePeerTradeHoarder(f, MEET, { tick: 0 })).toBeNull();
    });

    it("returns deterministic offerId on same inputs and differs by tick", () => {
      const f = makeFarmer({ id: 7, gold: 200, reserve: 80 });
      f.beliefs!.data["currentDay"] = 5;
      const a = initiatePeerTradeHoarder(f, MEET, { tick: 10 })!;
      const b = initiatePeerTradeHoarder(f, MEET, { tick: 10 })!;
      const c = initiatePeerTradeHoarder(f, MEET, { tick: 11 })!;
      expect(a.offerId).toBe(b.offerId);
      expect(a.offerId).not.toBe(c.offerId);
    });
  });

  describe("respond", () => {
    it("accepts sell offers at or below 105% of shop price", () => {
      const f = makeFarmer({ gold: 200, reserve: 80 });
      expect(
        respondToPeerOfferHoarder(f, offer("sell", "radish", 8, 1), 2, { tick: 0 })
          .decision,
      ).toBe("accept");
      // 105% of 8 = 8.4 → 8 passes, 9 fails.
      expect(
        respondToPeerOfferHoarder(f, offer("sell", "radish", 9, 1), 2, { tick: 0 })
          .decision,
      ).toBe("decline");
    });

    it("declines sell offer when buying would breach reserve", () => {
      // gold 85, cost 8, reserve 80 → 85-8=77 < 80 → decline.
      const f = makeFarmer({ gold: 85, reserve: 80 });
      expect(
        respondToPeerOfferHoarder(f, offer("sell", "radish", 8, 1), 2, { tick: 0 })
          .decision,
      ).toBe("decline");
    });

    it("accepts buy offers at >= 95% of shop price when buffer maintained", () => {
      // 95% of 8 = 7.6; buffer = 2, so need seeds >= qty + 2.
      const f = makeFarmer({ seeds: { radish: 5 } });
      expect(
        respondToPeerOfferHoarder(f, offer("buy", "radish", 7.6, 3), 2, {
          tick: 0,
        }).decision,
      ).toBe("accept");
    });

    it("declines buy offers below 95% floor", () => {
      const f = makeFarmer({ seeds: { radish: 10 } });
      expect(
        respondToPeerOfferHoarder(f, offer("buy", "radish", 7, 1), 2, {
          tick: 0,
        }).decision,
      ).toBe("decline");
    });

    it("declines buy offers that would deplete the 2-seed buffer", () => {
      // qty=3, buffer=2 → needs 5; we have 4.
      const f = makeFarmer({ seeds: { radish: 4 } });
      expect(
        respondToPeerOfferHoarder(f, offer("buy", "radish", 8, 3), 2, {
          tick: 0,
        }).decision,
      ).toBe("decline");
    });
  });
});

describe("aggressive peer-trade hooks", () => {
  it("accepts sell offers at 95% of shop price", () => {
    const f = makeFarmer({ gold: 100, reserve: 10 });
    // 95% of 14 = 13.3; pass at 13, fail at 14.
    expect(
      respondToPeerOfferAggressive(f, offer("sell", "wheat", 13, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
    expect(
      respondToPeerOfferAggressive(f, offer("sell", "wheat", 14, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("accepts buy offers at >= shop price when stocked", () => {
    const f = makeFarmer({ seeds: { pumpkin: 2 } });
    expect(
      respondToPeerOfferAggressive(f, offer("buy", "pumpkin", 35, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
  });

  it("declines buy offer below 100% floor", () => {
    const f = makeFarmer({ seeds: { pumpkin: 2 } });
    expect(
      respondToPeerOfferAggressive(f, offer("buy", "pumpkin", 34, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("declines buy offer when out of stock", () => {
    const f = makeFarmer({ seeds: { pumpkin: 0 } });
    expect(
      respondToPeerOfferAggressive(f, offer("buy", "pumpkin", 35, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });
});

describe("conservative peer-trade hooks", () => {
  it("accepts sell offers at or below shop price", () => {
    const f = makeFarmer({ gold: 100, reserve: 30 });
    expect(
      respondToPeerOfferConservative(f, offer("sell", "radish", 8, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
    expect(
      respondToPeerOfferConservative(f, offer("sell", "radish", 9, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("respects gold reserve", () => {
    const f = makeFarmer({ gold: 33, reserve: 30 });
    // 33 - 8 = 25 < 30 reserve → decline.
    expect(
      respondToPeerOfferConservative(f, offer("sell", "radish", 8, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("accepts buy offers at >= 90% with 1-seed buffer", () => {
    // 90% of 14 = 12.6; need seeds >= qty + 1.
    const f = makeFarmer({ seeds: { wheat: 3 } });
    expect(
      respondToPeerOfferConservative(f, offer("buy", "wheat", 13, 2), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
  });

  it("declines buy offer that would deplete 1-seed buffer", () => {
    const f = makeFarmer({ seeds: { wheat: 2 } });
    expect(
      respondToPeerOfferConservative(f, offer("buy", "wheat", 14, 2), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });
});

describe("opportunist peer-trade hooks", () => {
  it("accepts sell offers at or below 110% of shop price", () => {
    // 110% of 35 = 38.5; pass at 38, fail at 39.
    const f = makeFarmer({ gold: 200, reserve: 50 });
    expect(
      respondToPeerOfferOpportunist(f, offer("sell", "pumpkin", 38, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
    expect(
      respondToPeerOfferOpportunist(f, offer("sell", "pumpkin", 39, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("accepts buy offers at >= 90% with 1-seed buffer", () => {
    const f = makeFarmer({ seeds: { radish: 3 } });
    expect(
      respondToPeerOfferOpportunist(f, offer("buy", "radish", 7.2, 2), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
  });

  it("declines buy offer below 90% floor", () => {
    const f = makeFarmer({ seeds: { radish: 10 } });
    expect(
      respondToPeerOfferOpportunist(f, offer("buy", "radish", 7, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("respects gold reserve on sell offers", () => {
    const f = makeFarmer({ gold: 55, reserve: 50 });
    // 55-8=47<50 → decline.
    expect(
      respondToPeerOfferOpportunist(f, offer("sell", "radish", 8, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });
});
