import type { Rng } from "@engine/core";
import type { CropKind } from "../components";

export interface ShopOffer {
  offerId: string;
  /** Always "sell" — models seed sales (shop → farmer) only; crop-buy uses a fixed-price handler. */
  kind: "sell";
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

/** Baseline prices: shop buys crops at SHOP_BUY_PRICE (shopkeeper.ts); sells seeds at SEED_COST (economy.ts). */
export const DEFAULT_PRICES: PriceTable = {
  radish:          { buy: 6,  sell: 5  },
  wheat:           { buy: 10, sell: 8  },
  carrot:          { buy: 8,  sell: 6  },
  tomato:          { buy: 13, sell: 10 },
  corn:            { buy: 16, sell: 13 },
  pumpkin:         { buy: 19, sell: 15 },
  grape:           { buy: 24, sell: 19 },
  "winter-squash": { buy: 13, sell: 11 },
};

export const SLATE_SIZE = 5;
export const PRICE_JITTER = 0.2; // ±20%

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
 * Reserve `quantity` units of `crop` cheapest-first. Decrements `remaining` on success;
 * leaves slate untouched on failure. `dryRun` checks cost without mutating.
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

  const matching = slate.filter(
    (o) => o.kind === "sell" && o.crop === crop && o.remaining > 0,
  );

  if (matching.length === 0) {
    return { ok: false, reason: "no-matching-offer" };
  }

  const ordered = [...matching].sort(
    (a, b) => a.unitPrice - b.unitPrice || (a.offerId < b.offerId ? -1 : a.offerId > b.offerId ? 1 : 0),
  );

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

  if (!options.dryRun) {
    for (const { offer, take } of plan) {
      offer.remaining -= take;
    }
  }

  return { ok: true, totalCost };
}

/** Generate a deterministic daily slate of SLATE_SIZE shop offers. */
export function generateDailySlate(rng: Rng, prices?: Partial<PriceTable>): ShopOffer[] {
  const table = prices ?? DEFAULT_PRICES;
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
