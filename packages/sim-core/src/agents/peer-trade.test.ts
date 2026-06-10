import { ZERO_CROPS } from "../economy";
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

const ZERO: Record<CropKind, number> = { ...ZERO_CROPS };

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
      // brief 59 — bid is now SEED_COST.radish (5) × mult 1.0, not the old
      // flat 4.5 anchored on the (wrong) crop sell price.
      expect(out!.unitPrice).toBe(5);
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
    // brief 59 — seed trades are anchored on SEED_COST.radish (5), not the old
    // CROP_SELL_PRICE.radish (8). buyCeiling 1.05, sellFloor 0.95.
    it("accepts sell offers at or below 105% of seed cost", () => {
      const f = makeFarmer({ gold: 200, reserve: 80 });
      // 105% of 5 = 5.25 → 5 passes, 6 fails.
      expect(
        respondToPeerOfferHoarder(f, offer("sell", "radish", 5, 1), 2, { tick: 0 })
          .decision,
      ).toBe("accept");
      expect(
        respondToPeerOfferHoarder(f, offer("sell", "radish", 6, 1), 2, { tick: 0 })
          .decision,
      ).toBe("decline");
    });

    it("declines sell offer when buying would breach reserve", () => {
      // gold 85, cost 5, reserve 80 → 85-5=80, not < 80 → accept; use gold 84.
      const f = makeFarmer({ gold: 84, reserve: 80 });
      expect(
        respondToPeerOfferHoarder(f, offer("sell", "radish", 5, 1), 2, { tick: 0 })
          .decision,
      ).toBe("decline");
    });

    it("accepts buy offers at >= 95% of seed cost when buffer maintained", () => {
      // 95% of 5 = 4.75; buffer = 2, so need seeds >= qty + 2.
      const f = makeFarmer({ seeds: { radish: 5 } });
      expect(
        respondToPeerOfferHoarder(f, offer("buy", "radish", 4.75, 3), 2, {
          tick: 0,
        }).decision,
      ).toBe("accept");
    });

    it("declines buy offers below 95% floor", () => {
      // 95% of 5 = 4.75; 4 is below the floor.
      const f = makeFarmer({ seeds: { radish: 10 } });
      expect(
        respondToPeerOfferHoarder(f, offer("buy", "radish", 4, 1), 2, {
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
  // brief 59 — anchored on SEED_COST (wheat 8, pumpkin 15). buyCeiling 0.95,
  // sellFloor 1.0.
  it("accepts sell offers at 95% of seed cost", () => {
    const f = makeFarmer({ gold: 100, reserve: 10 });
    // 95% of wheat seed cost 8 = 7.6; pass at 7, fail at 8.
    expect(
      respondToPeerOfferAggressive(f, offer("sell", "wheat", 7, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
    expect(
      respondToPeerOfferAggressive(f, offer("sell", "wheat", 8, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("accepts buy offers at >= seed cost when stocked", () => {
    const f = makeFarmer({ seeds: { pumpkin: 2 } });
    // sellFloor 1.0 × pumpkin seed cost 15 = 15.
    expect(
      respondToPeerOfferAggressive(f, offer("buy", "pumpkin", 15, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
  });

  it("declines buy offer below 100% floor", () => {
    const f = makeFarmer({ seeds: { pumpkin: 2 } });
    // below 15 → too low.
    expect(
      respondToPeerOfferAggressive(f, offer("buy", "pumpkin", 14, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("declines buy offer when out of stock", () => {
    const f = makeFarmer({ seeds: { pumpkin: 0 } });
    expect(
      respondToPeerOfferAggressive(f, offer("buy", "pumpkin", 15, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });
});

describe("conservative peer-trade hooks", () => {
  // brief 59 — anchored on SEED_COST (radish 5, wheat 8). buyCeiling 1.0,
  // sellFloor 0.9, buffer 1.
  it("accepts sell offers at or below seed cost", () => {
    const f = makeFarmer({ gold: 100, reserve: 30 });
    // 100% of radish seed cost 5 = 5; pass at 5, fail at 6.
    expect(
      respondToPeerOfferConservative(f, offer("sell", "radish", 5, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
    expect(
      respondToPeerOfferConservative(f, offer("sell", "radish", 6, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("respects gold reserve", () => {
    const f = makeFarmer({ gold: 34, reserve: 30 });
    // 34 - 5 = 29 < 30 reserve → decline.
    expect(
      respondToPeerOfferConservative(f, offer("sell", "radish", 5, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("accepts buy offers at >= 90% with 1-seed buffer", () => {
    // 90% of wheat seed cost 8 = 7.2; need seeds >= qty + 1.
    const f = makeFarmer({ seeds: { wheat: 3 } });
    expect(
      respondToPeerOfferConservative(f, offer("buy", "wheat", 7.2, 2), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
  });

  it("declines buy offer that would deplete 1-seed buffer", () => {
    const f = makeFarmer({ seeds: { wheat: 2 } });
    expect(
      respondToPeerOfferConservative(f, offer("buy", "wheat", 8, 2), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });
});

describe("opportunist peer-trade hooks", () => {
  // brief 59 — anchored on SEED_COST (pumpkin 15, radish 5). buyCeiling 1.1,
  // sellFloor 0.9, buffer 1.
  it("accepts sell offers at or below 110% of seed cost", () => {
    // 110% of pumpkin seed cost 15 = 16.5; pass at 16, fail at 17.
    const f = makeFarmer({ gold: 200, reserve: 50 });
    expect(
      respondToPeerOfferOpportunist(f, offer("sell", "pumpkin", 16, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
    expect(
      respondToPeerOfferOpportunist(f, offer("sell", "pumpkin", 17, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("accepts buy offers at >= 90% with 1-seed buffer", () => {
    // 90% of radish seed cost 5 = 4.5; need seeds >= qty + 1.
    const f = makeFarmer({ seeds: { radish: 3 } });
    expect(
      respondToPeerOfferOpportunist(f, offer("buy", "radish", 4.5, 2), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
  });

  it("declines buy offer below 90% floor", () => {
    // 90% of 5 = 4.5; 4 is below.
    const f = makeFarmer({ seeds: { radish: 10 } });
    expect(
      respondToPeerOfferOpportunist(f, offer("buy", "radish", 4, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("respects gold reserve on sell offers", () => {
    const f = makeFarmer({ gold: 54, reserve: 50 });
    // 54-5=49<50 → decline.
    expect(
      respondToPeerOfferOpportunist(f, offer("sell", "radish", 5, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });
});
