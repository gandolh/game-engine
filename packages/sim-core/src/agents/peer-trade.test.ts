import { ZERO_CROPS } from "../economy";
import { describe, expect, it } from "vitest";
import type { GameEntity, CropKind } from "../components";
import type { MeetBody, OfferSeedBody } from "../protocols/encounter";
import {
  initiatePeerTradeHoarder,
  initiateCropTradeHoarder,
  respondToPeerOfferHoarder,
} from "./hoarder";
import { MAX_FRIEND_DISCOUNT } from "./peer-trade-policy";
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
      expect(out!.unitPrice).toBe(5); 
      expect(out!.offerId).toBe("peer-1-99-42-2-radish");
    });

    it("returns null when hoarder already has 3+ radish seeds", () => {
      const f = makeFarmer({ id: 1, gold: 200, seeds: { radish: 3 } });
      expect(initiatePeerTradeHoarder(f, MEET, { tick: 0 })).toBeNull();
    });

    it("returns null when funds would dip below reserve", () => {
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
    it("accepts sell offers at or below 105% of seed cost (SEED_COST.radish=5; 5 passes, 6 fails)", () => {
      const f = makeFarmer({ gold: 200, reserve: 80 });
      expect(
        respondToPeerOfferHoarder(f, offer("sell", "radish", 5, 1), 2, { tick: 0 })
          .decision,
      ).toBe("accept");
      expect(
        respondToPeerOfferHoarder(f, offer("sell", "radish", 6, 1), 2, { tick: 0 })
          .decision,
      ).toBe("decline");
    });

    it("declines sell offer when buying would breach reserve (84-5=79<80)", () => {
      const f = makeFarmer({ gold: 84, reserve: 80 });
      expect(
        respondToPeerOfferHoarder(f, offer("sell", "radish", 5, 1), 2, { tick: 0 })
          .decision,
      ).toBe("decline");
    });

    it("accepts buy offers at >= 95% of seed cost when buffer maintained (95%×5=4.75; need seeds≥qty+2)", () => {
      const f = makeFarmer({ seeds: { radish: 5 } });
      expect(
        respondToPeerOfferHoarder(f, offer("buy", "radish", 4.75, 3), 2, {
          tick: 0,
        }).decision,
      ).toBe("accept");
    });

    it("declines buy offers below 95% floor (95%×5=4.75; 4 fails)", () => {
      const f = makeFarmer({ seeds: { radish: 10 } });
      expect(
        respondToPeerOfferHoarder(f, offer("buy", "radish", 4, 1), 2, {
          tick: 0,
        }).decision,
      ).toBe("decline");
    });

    it("declines buy offers that would deplete the 2-seed buffer (need 5, have 4)", () => {
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
  it("accepts sell offers at 95% of seed cost (SEED_COST.wheat=8; 95%=7.6; 7 passes, 8 fails)", () => {
    const f = makeFarmer({ gold: 100, reserve: 10 });
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

  it("accepts buy offers at >= seed cost when stocked (sellFloor=1.0; pumpkin SEED_COST=15)", () => {
    const f = makeFarmer({ seeds: { pumpkin: 2 } });
    expect(
      respondToPeerOfferAggressive(f, offer("buy", "pumpkin", 15, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
  });

  it("declines buy offer below 100% floor (14 < 15)", () => {
    const f = makeFarmer({ seeds: { pumpkin: 2 } });
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
  it("accepts sell offers at or below seed cost (SEED_COST.radish=5; 5 passes, 6 fails)", () => {
    const f = makeFarmer({ gold: 100, reserve: 30 });
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

  it("respects gold reserve (34-5=29<30)", () => {
    const f = makeFarmer({ gold: 34, reserve: 30 });
    expect(
      respondToPeerOfferConservative(f, offer("sell", "radish", 5, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("accepts buy offers at >= 90% with 1-seed buffer (90%×8=7.2; need seeds≥qty+1)", () => {
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
  it("accepts sell offers at or below 110% of seed cost (SEED_COST.pumpkin=15; 110%=16.5; 16 passes, 17 fails)", () => {
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

  it("accepts buy offers at >= 90% with 1-seed buffer (90%×5=4.5; need seeds≥qty+1)", () => {
    const f = makeFarmer({ seeds: { radish: 3 } });
    expect(
      respondToPeerOfferOpportunist(f, offer("buy", "radish", 4.5, 2), 2, {
        tick: 0,
      }).decision,
    ).toBe("accept");
  });

  it("declines buy offer below 90% floor (4 < 4.5)", () => {
    const f = makeFarmer({ seeds: { radish: 10 } });
    expect(
      respondToPeerOfferOpportunist(f, offer("buy", "radish", 4, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });

  it("respects gold reserve on sell offers (54-5=49<50)", () => {
    const f = makeFarmer({ gold: 54, reserve: 50 });
    expect(
      respondToPeerOfferOpportunist(f, offer("sell", "radish", 5, 1), 2, {
        tick: 0,
      }).decision,
    ).toBe("decline");
  });
});

describe("friend trust-discount on sell-surplus initiation", () => {

  const BASE = 15 * 0.95;

  function seller(trustTowardPeer?: number): GameEntity {
    const f: GameEntity = {
      id: 1,
      farmer: { name: "F", currentRegion: "village" },
      beliefs: { data: { currentDay: 3 }, revision: 0 },
      desires: { data: { minGoldReserve: 30 } },
      intentions: { queue: [] },
      inventory: { gold: 200, crops: { ...ZERO, wheat: 10 }, seeds: { ...ZERO } },
    };
    if (trustTowardPeer !== undefined) {
      f.trust = { byId: new Map([[MEET.peerId, trustTowardPeer]]) };
    }
    return f;
  }

  it("no discount at baseline trust (0.5) or when trust is unset", () => {
    expect(initiateCropTradeHoarder(seller(), MEET, { tick: 1 })!.unitPrice).toBeCloseTo(BASE);
    expect(initiateCropTradeHoarder(seller(0.5), MEET, { tick: 1 })!.unitPrice).toBeCloseTo(BASE);
  });

  it("full discount (MAX) at maximal trust (1.0)", () => {
    const out = initiateCropTradeHoarder(seller(1.0), MEET, { tick: 1 })!;
    expect(out.unitPrice).toBeCloseTo(BASE * (1 - MAX_FRIEND_DISCOUNT));
  });

  it("scales linearly between baseline and max trust", () => {
    const out = initiateCropTradeHoarder(seller(0.75), MEET, { tick: 1 })!;

    expect(out.unitPrice).toBeCloseTo(BASE * (1 - MAX_FRIEND_DISCOUNT / 2));
  });

  it("no surcharge below baseline (a rival still pays base, not more)", () => {
    expect(initiateCropTradeHoarder(seller(0.1), MEET, { tick: 1 })!.unitPrice).toBeCloseTo(BASE);
  });
});
