import type { Rng } from "@engine/core";

export interface ShopOffer {
  offerId: string;
  kind: "buy" | "sell"; // shop buys from farmer | shop sells to farmer
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
    const kind: "buy" | "sell" = rng.range(0, 1) < 0.5 ? "buy" : "sell";
    const crop = CROPS[rng.range(0, 3) | 0]!;
    const base = table[crop][kind];
    const unitPrice = Math.max(1, Math.round(base * (1 + rng.range(-PRICE_JITTER, PRICE_JITTER))));
    const quantity = Math.floor(rng.range(5, 21));
    const offerId = idFork.nextU32().toString(36);

    offers.push({ offerId, kind, crop, unitPrice, quantity, remaining: quantity });
  }

  return offers;
}
