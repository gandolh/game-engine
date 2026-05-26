import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import {
  generateDailySlate,
  DEFAULT_PRICES,
  SLATE_SIZE,
  PRICE_JITTER,
} from "./shop-slate";

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
