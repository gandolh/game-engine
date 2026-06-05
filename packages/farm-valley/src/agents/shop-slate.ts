import type { Rng } from "@engine/core";
import type { CropKind } from "../components";

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
  /** brief 41 — expanded crop union (all 8 kinds may appear on the slate). */
  crop: import("../components").CropKind;
  unitPrice: number;
  quantity: number;
  remaining: number;
}

export interface PriceTable {
  readonly radish: { buy: number; sell: number };
  readonly wheat: { buy: number; sell: number };
  readonly carrot: { buy: number; sell: number };
  readonly tomato: { buy: number; sell: number };
  readonly corn: { buy: number; sell: number };
  readonly pumpkin: { buy: number; sell: number };
  readonly grape: { buy: number; sell: number };
  readonly "winter-squash": { buy: number; sell: number };
}

/**
 * Baseline prices (brief 41 — extended to all 8 crops):
 *   shop buys crops at SHOP_BUY_PRICE in shopkeeper.ts
 *   shop sells seeds at SEED_COST in economy.ts
 */
export const DEFAULT_PRICES: PriceTable = {
  radish:          { buy: 5,  sell: 5  },
  wheat:           { buy: 8,  sell: 8  },
  carrot:          { buy: 7,  sell: 6  },
  tomato:          { buy: 13, sell: 10 },
  corn:            { buy: 17, sell: 12 },
  pumpkin:         { buy: 22, sell: 15 },
  grape:           { buy: 32, sell: 20 },
  "winter-squash": { buy: 14, sell: 9  },
};

export const SLATE_SIZE = 5;
export const PRICE_JITTER = 0.2; // ±20%

/** brief 41 — all 8 crop kinds on the daily slate. */
const CROPS = [
  "radish", "wheat", "carrot", "tomato", "corn", "pumpkin", "grape", "winter-squash",
] as const;

export interface SlateConsumeResult {
  ok: boolean;
  totalCost?: number;
  reason?: "no-matching-offer" | "insufficient-stock";
}

export interface SlateConsumeOptions {
  /** When true, return result without mutating any offer.remaining. */
  dryRun?: boolean;
}

/**
 * Atomically reserve `quantity` units of `crop` from the slate, cheapest-first
 * across multiple matching offers. On success, decrements `remaining` on the
 * chosen offers (in place) and returns `{ ok: true, totalCost }`. On failure,
 * leaves the slate untouched and returns `{ ok: false, reason }`.
 *
 * When `options.dryRun` is true, behaves identically but never mutates any
 * offer — useful for pre-checking cost before committing.
 *
 * The atomicity guarantee: the consumption plan is fully computed and checked
 * before any offer is touched. If the stock check fails, no mutation happens.
 */
export function consumeFromSlate(
  slate: ShopOffer[] | undefined,
  crop: CropKind,
  quantity: number,
  options: SlateConsumeOptions = {},
): SlateConsumeResult {
  if (!slate || slate.length === 0) {
    return { ok: false, reason: "no-matching-offer" };
  }

  // Filter matching offers (same crop, still have stock, kind === "sell").
  const matching = slate.filter(
    (o) => o.kind === "sell" && o.crop === crop && o.remaining > 0,
  );

  if (matching.length === 0) {
    return { ok: false, reason: "no-matching-offer" };
  }

  // Sort ascending by unitPrice, tie-break by offerId (lexicographic).
  const ordered = [...matching].sort(
    (a, b) => a.unitPrice - b.unitPrice || (a.offerId < b.offerId ? -1 : a.offerId > b.offerId ? 1 : 0),
  );

  // Build consumption plan.
  const plan: Array<{ offer: ShopOffer; take: number }> = [];
  let qtyLeft = quantity;
  let totalCost = 0;

  for (const offer of ordered) {
    if (qtyLeft <= 0) break;
    const take = Math.min(offer.remaining, qtyLeft);
    plan.push({ offer, take });
    totalCost += take * offer.unitPrice;
    qtyLeft -= take;
  }

  if (qtyLeft > 0) {
    return { ok: false, reason: "insufficient-stock" };
  }

  // Commit phase — skip when dryRun.
  if (!options.dryRun) {
    for (const { offer, take } of plan) {
      offer.remaining -= take;
    }
  }

  return { ok: true, totalCost };
}

/**
 * Generate a deterministic daily slate of SLATE_SIZE shop offers.
 * The same rng state + prices inputs always produce the same output.
 */
export function generateDailySlate(rng: Rng, prices?: Partial<PriceTable>): ShopOffer[] {
  const table = prices ?? DEFAULT_PRICES;
  // One fork instance, reused across all SLATE_SIZE slots for offerId generation.
  const idFork = rng.fork("shop.offerId");

  const offers: ShopOffer[] = [];
  for (let i = 0; i < SLATE_SIZE; i++) {
    const crop = CROPS[rng.range(0, CROPS.length) | 0]!;
    const base = (table[crop] ?? DEFAULT_PRICES[crop]).sell;
    const unitPrice = Math.max(1, Math.round(base * (1 + rng.range(-PRICE_JITTER, PRICE_JITTER))));
    const quantity = Math.floor(rng.range(5, 21));
    const offerId = idFork.nextU32().toString(36);

    offers.push({ offerId, kind: "sell", crop, unitPrice, quantity, remaining: quantity });
  }

  return offers;
}
