import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import {
  generateDailySlate,
  consumeFromSlate,
  DEFAULT_PRICES,
  SLATE_SIZE,
  PRICE_JITTER,
  type ShopOffer,
} from "./shop-slate";

function makeOffer(
  partial: Partial<ShopOffer> & Pick<ShopOffer, "crop" | "unitPrice" | "remaining">,
): ShopOffer {
  return {
    offerId: partial.offerId ?? `o-${partial.crop}-${partial.unitPrice}`,
    kind: "sell",
    crop: partial.crop,
    unitPrice: partial.unitPrice,
    quantity: partial.quantity ?? partial.remaining,
    remaining: partial.remaining,
  };
}

describe("generateDailySlate", () => {
  it("returns exactly SLATE_SIZE entries", () => {
    const rng = createRng(1);
    const slate = generateDailySlate(rng);
    expect(slate).toHaveLength(SLATE_SIZE);
  });

  it("is deterministic: same seed + same call → identical slate", () => {
    const slate1 = generateDailySlate(createRng(42));
    const slate2 = generateDailySlate(createRng(42));
    expect(slate1).toEqual(slate2);
  });

  it("prices are within ±20% of the sell base price for the picked crop", () => {
    const slate = generateDailySlate(createRng(7));
    for (const offer of slate) {
      const base = DEFAULT_PRICES[offer.crop].sell;
      const lo = Math.max(1, Math.round(base * (1 - PRICE_JITTER)));
      const hi = Math.round(base * (1 + PRICE_JITTER));
      expect(offer.unitPrice).toBeGreaterThanOrEqual(lo);
      expect(offer.unitPrice).toBeLessThanOrEqual(hi);
    }
  });

  it("quantities are integers in [5, 20]", () => {
    const slate = generateDailySlate(createRng(99));
    for (const offer of slate) {
      expect(Number.isInteger(offer.quantity)).toBe(true);
      expect(offer.quantity).toBeGreaterThanOrEqual(5);
      expect(offer.quantity).toBeLessThanOrEqual(20);
    }
  });

  it("remaining equals quantity initially", () => {
    const slate = generateDailySlate(createRng(13));
    for (const offer of slate) {
      expect(offer.remaining).toBe(offer.quantity);
    }
  });

  it("all offerIds are distinct", () => {
    const slate = generateDailySlate(createRng(55));
    const ids = slate.map((o) => o.offerId);
    const unique = new Set(ids);
    expect(unique.size).toBe(SLATE_SIZE);
  });

  it("kind is always 'sell' (no buy variant survives brief 08)", () => {
    const slate = generateDailySlate(createRng(2024));
    for (const offer of slate) {
      expect(offer.kind).toBe("sell");
    }
  });

  it("crop is always radish, wheat, or pumpkin", () => {
    const slate = generateDailySlate(createRng(3030));
    for (const offer of slate) {
      expect(["radish", "wheat", "pumpkin"]).toContain(offer.crop);
    }
  });

  it("uses custom PriceTable when provided", () => {
    const customPrices = {
      radish: { buy: 100, sell: 100 },
      wheat: { buy: 100, sell: 100 },
      pumpkin: { buy: 100, sell: 100 },
    };
    const slate = generateDailySlate(createRng(77), customPrices);
    for (const offer of slate) {
      // All prices are derived from 100 ± 20%, so in [80, 120].
      expect(offer.unitPrice).toBeGreaterThanOrEqual(80);
      expect(offer.unitPrice).toBeLessThanOrEqual(120);
    }
  });

  it("different seeds produce different slates", () => {
    const s1 = generateDailySlate(createRng(1));
    const s2 = generateDailySlate(createRng(2));
    // They could be equal by coincidence but with these seeds they won't be.
    const ids1 = s1.map((o) => o.offerId).join(",");
    const ids2 = s2.map((o) => o.offerId).join(",");
    expect(ids1).not.toBe(ids2);
  });
});

describe("consumeFromSlate", () => {
  it("empty slate → no-matching-offer", () => {
    const result = consumeFromSlate([], "radish", 1);
    expect(result).toEqual({ ok: false, reason: "no-matching-offer" });
  });

  it("undefined slate → no-matching-offer", () => {
    const result = consumeFromSlate(undefined, "radish", 1);
    expect(result).toEqual({ ok: false, reason: "no-matching-offer" });
  });

  it("slate has no matching crop → no-matching-offer", () => {
    const slate = [makeOffer({ crop: "wheat", unitPrice: 10, remaining: 5 })];
    const result = consumeFromSlate(slate, "radish", 1);
    expect(result).toEqual({ ok: false, reason: "no-matching-offer" });
  });

  it("match with sufficient stock → ok; remaining decremented; totalCost correct", () => {
    const offer = makeOffer({ crop: "radish", unitPrice: 5, remaining: 10 });
    const slate = [offer];
    const result = consumeFromSlate(slate, "radish", 3);
    expect(result).toEqual({ ok: true, totalCost: 15 });
    expect(offer.remaining).toBe(7);
  });

  it("insufficient stock across all matching offers → ok:false; slate untouched", () => {
    const o1 = makeOffer({ offerId: "a", crop: "radish", unitPrice: 5, remaining: 2 });
    const o2 = makeOffer({ offerId: "b", crop: "radish", unitPrice: 6, remaining: 2 });
    const result = consumeFromSlate([o1, o2], "radish", 5);
    expect(result).toEqual({ ok: false, reason: "insufficient-stock" });
    // Slate must not have been mutated.
    expect(o1.remaining).toBe(2);
    expect(o2.remaining).toBe(2);
  });

  it("cheapest-first across multiple offers — takes from lower price first", () => {
    const expensive = makeOffer({ offerId: "exp", crop: "radish", unitPrice: 8, remaining: 3 });
    const cheap = makeOffer({ offerId: "chp", crop: "radish", unitPrice: 5, remaining: 4 });
    const result = consumeFromSlate([expensive, cheap], "radish", 5);
    // Cheap takes 4, expensive takes 1 → cost = 4*5 + 1*8 = 28
    expect(result).toEqual({ ok: true, totalCost: 28 });
    expect(cheap.remaining).toBe(0);
    expect(expensive.remaining).toBe(2);
  });

  it("tie-break by offerId when prices equal — lexicographically lower id first", () => {
    const a = makeOffer({ offerId: "aaa", crop: "wheat", unitPrice: 10, remaining: 2 });
    const b = makeOffer({ offerId: "bbb", crop: "wheat", unitPrice: 10, remaining: 2 });
    const result = consumeFromSlate([b, a], "wheat", 3);
    // 'aaa' < 'bbb', so 'aaa' consumed fully (2), then 1 from 'bbb'
    expect(result).toEqual({ ok: true, totalCost: 30 });
    expect(a.remaining).toBe(0);
    expect(b.remaining).toBe(1);
  });

  it("dryRun: true returns same ok/totalCost but does NOT mutate slate", () => {
    const offer = makeOffer({ crop: "pumpkin", unitPrice: 20, remaining: 5 });
    const result = consumeFromSlate([offer], "pumpkin", 2, { dryRun: true });
    expect(result).toEqual({ ok: true, totalCost: 40 });
    // Slate must be untouched.
    expect(offer.remaining).toBe(5);
  });

  it("dryRun: true on failing case also leaves slate untouched", () => {
    const offer = makeOffer({ crop: "radish", unitPrice: 5, remaining: 1 });
    const result = consumeFromSlate([offer], "radish", 5, { dryRun: true });
    expect(result).toEqual({ ok: false, reason: "insufficient-stock" });
    expect(offer.remaining).toBe(1);
  });
});
