import type { CropKind, CropQuality, CropQualityCounts, Inventory, ProductKind, FruitKind } from "../components";
import { CROP_SELL_PRICE, QUALITY_MULTIPLIER } from "./crops";
import { PRODUCT_SELL_PRICE } from "./livestock";
import { FRUIT_SELL_PRICE } from "./fruit";

export function cropInventoryValue(inv: Inventory): number {
  let total = 0;
  const crops = inv.crops;
  const quality = inv.cropQuality;
  for (const cropKey of Object.keys(crops) as CropKind[]) {
    const basePrice = CROP_SELL_PRICE[cropKey];
    const totalUnits = crops[cropKey];
    if (totalUnits <= 0) continue;
    if (quality !== undefined && quality[cropKey] !== undefined) {
      const q = quality[cropKey]!;
      total += q.normal * basePrice * QUALITY_MULTIPLIER.normal;
      total += q.silver * basePrice * QUALITY_MULTIPLIER.silver;
      total += q.gold   * basePrice * QUALITY_MULTIPLIER.gold;
    } else {
      total += totalUnits * basePrice * QUALITY_MULTIPLIER.normal;
    }
  }
  return total;
}

export function totalCropCount(inv: Inventory, crop: CropKind): number {
  return inv.crops[crop];
}

export function bankHarvest(inv: Inventory, crop: CropKind, qty: number, quality: CropQuality): void {
  inv.crops[crop] += qty;
  if (!inv.cropQuality) inv.cropQuality = {};
  if (!inv.cropQuality[crop]) inv.cropQuality[crop] = { normal: 0, silver: 0, gold: 0 };
  inv.cropQuality[crop]![quality] += qty;
}

export function totalProductCount(inv: Inventory, kind: ProductKind): number {
  const q = inv.products?.[kind];
  if (!q) return 0;
  return q.normal + q.silver + q.gold;
}

export function totalFruitCount(inv: Inventory, kind: FruitKind): number {
  const q = inv.fruit?.[kind];
  if (!q) return 0;
  return q.normal + q.silver + q.gold;
}

export function bankProduct(inv: Inventory, kind: ProductKind, qty: number, quality: CropQuality): void {
  if (!inv.products) inv.products = {};
  if (!inv.products[kind]) inv.products[kind] = { normal: 0, silver: 0, gold: 0 };
  inv.products[kind]![quality] += qty;
}

export function bankFruit(inv: Inventory, kind: FruitKind, qty: number, quality: CropQuality): void {
  if (!inv.fruit) inv.fruit = {};
  if (!inv.fruit[kind]) inv.fruit[kind] = { normal: 0, silver: 0, gold: 0 };
  inv.fruit[kind]![quality] += qty;
}

export function productInventoryValue(inv: Inventory): number {
  if (!inv.products) return 0;
  let total = 0;
  for (const [kind, q] of Object.entries(inv.products) as [ProductKind, CropQualityCounts][]) {
    const base = PRODUCT_SELL_PRICE[kind];
    total += q.normal * base * QUALITY_MULTIPLIER.normal;
    total += q.silver * base * QUALITY_MULTIPLIER.silver;
    total += q.gold   * base * QUALITY_MULTIPLIER.gold;
  }
  return total;
}

export function fruitInventoryValue(inv: Inventory): number {
  if (!inv.fruit) return 0;
  let total = 0;
  for (const [kind, q] of Object.entries(inv.fruit) as [FruitKind, CropQualityCounts][]) {
    const base = FRUIT_SELL_PRICE[kind];
    total += q.normal * base * QUALITY_MULTIPLIER.normal;
    total += q.silver * base * QUALITY_MULTIPLIER.silver;
    total += q.gold   * base * QUALITY_MULTIPLIER.gold;
  }
  return total;
}

/**
 * Debit `qty` units of `crop` from an inventory, decrementing `crops[crop]`
 * and the matching `cropQuality[crop]` tiers together in lockstep so the two
 * never drift apart (brief 99, review-findings item 28 — "phantom quality
 * tiers"). This is the ONE place that should ever subtract from
 * `inv.crops[crop]`; every debit site in the sim should route through it
 * (directly, or transitively via `deductCrops` below).
 *
 * Tiers are drained lowest-quality-first by default (silver, normal, gold —
 * the ordering the original `take`/sell path already used here), so a
 * partial debit consumes the least valuable stock first and preserves gold
 * tier for festivals/best pricing unless a caller opts into a different
 * order via `preferQuality` (moved to the front of the drain order).
 *
 * Returns the quantity actually debited (capped by on-hand `crops[crop]`).
 */
export function debitCrop(inv: Inventory, crop: CropKind, qty: number, preferQuality?: CropQuality): number {
  return debitCropDetailed(inv, crop, qty, preferQuality).taken;
}

/**
 * The single implementation behind {@link debitCrop}, additionally reporting
 * WHICH quality tiers the debit consumed. Callers that have to re-credit the
 * same goods somewhere else (the market wall's escrow, brief 98) need the tier
 * breakdown so gold/silver/normal stock is conserved across the move instead of
 * being silently re-minted as `normal`.
 *
 * If the inventory has no `cropQuality` map for the crop (untracked stock), the
 * whole debit is reported as `normal` — the same convention
 * `cropInventoryValue` already uses to price untracked crops, so no value is
 * created or destroyed.
 */
export function debitCropDetailed(
  inv: Inventory,
  crop: CropKind,
  qty: number,
  preferQuality?: CropQuality,
): { taken: number; tiers: CropQualityCounts } {
  const tiers: CropQualityCounts = { normal: 0, silver: 0, gold: 0 };
  const have = inv.crops[crop];
  const taken = Math.min(qty, have);
  if (taken <= 0) return { taken: 0, tiers };
  inv.crops[crop] -= taken;

  let remaining = taken;
  if (inv.cropQuality?.[crop]) {
    const q = inv.cropQuality[crop]!;
    const order: CropQuality[] = preferQuality
      ? [preferQuality, "silver", "normal", "gold"].filter((v, i, a) => a.indexOf(v) === i) as CropQuality[]
      : ["silver", "normal", "gold"] as CropQuality[];
    for (const tier of order) {
      if (remaining <= 0) break;
      const d = Math.min(remaining, q[tier]);
      q[tier] -= d;
      tiers[tier] += d;
      remaining -= d;
    }
  }
  // Untracked (or under-tracked) stock counts as `normal`.
  tiers.normal += remaining;
  return { taken, tiers };
}

/**
 * @deprecated kept as a name-compatible alias for existing callers (e.g.
 * `systems/harbor/system.ts`, owned by a different chunk) — delegates to
 * `debitCrop`, which is now the single implementation.
 */
export function deductCrops(inv: Inventory, crop: CropKind, qty: number, preferQuality?: CropQuality): number {
  return debitCrop(inv, crop, qty, preferQuality);
}
