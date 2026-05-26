import type { Rng } from "@engine/core";

export interface ShopOffer {
  offerId: string;
  /**
   * Always "sell" since brief 08 — the daily slate now models seed sales only
   * (shop → farmer). Crop sales (farmer → shop) bypass the slate and use the
   * fixed-price BUY handler with unlimited liquidity. The literal-typed
   * discriminant is retained so downstream consumers can keep filtering by
   * `kind === "sell"` if they want, and so future expansion can add new
   * variants without reshaping the body type.
   */
  kind: "sell";
  crop: "radish" | "wheat" | "pumpkin";
  unitPrice: number;
  quantity: number;
  remaining: number;
}

export interface PriceTable {
  readonly radish: { buy: number; sell: number };
  readonly wheat: { buy: number; sell: number };
  readonly pumpkin: { buy: number; sell: number };
}

/**
 * Baseline prices that mirror shopkeeper.ts:
 *   shop buys crops at: radish 5 / wheat 8 / pumpkin 22
 *   shop sells seeds at: radish 5 / wheat 10 / pumpkin 20
 */
export const DEFAULT_PRICES: PriceTable = {
  radish: { buy: 5, sell: 5 },
  wheat: { buy: 8, sell: 10 },
  pumpkin: { buy: 22, sell: 20 },
};

export const SLATE_SIZE = 5;
export const PRICE_JITTER = 0.2; // ±20%

const CROPS = ["radish", "wheat", "pumpkin"] as const;

/**
 * Generate a deterministic daily slate of SLATE_SIZE shop offers.
 * The same rng state + prices inputs always produce the same output.
 */
export function generateDailySlate(rng: Rng, prices?: PriceTable): ShopOffer[] {
  const table = prices ?? DEFAULT_PRICES;
  // One fork instance, reused across all SLATE_SIZE slots for offerId generation.
  const idFork = rng.fork("shop.offerId");

  const offers: ShopOffer[] = [];
  for (let i = 0; i < SLATE_SIZE; i++) {
    const crop = CROPS[rng.range(0, 3) | 0]!;
    const base = table[crop].sell;
    const unitPrice = Math.max(1, Math.round(base * (1 + rng.range(-PRICE_JITTER, PRICE_JITTER))));
    const quantity = Math.floor(rng.range(5, 21));
    const offerId = idFork.nextU32().toString(36);

    offers.push({ offerId, kind: "sell", crop, unitPrice, quantity, remaining: quantity });
  }

  return offers;
}
