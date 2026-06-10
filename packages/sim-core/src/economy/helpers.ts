import type { CropKind, CropQuality, CropQualityCounts, Inventory, ProductKind, FruitKind } from "../components";
import { CROP_SELL_PRICE, QUALITY_MULTIPLIER } from "./crops";
import { PRODUCT_SELL_PRICE } from "./livestock";
import { FRUIT_SELL_PRICE } from "./fruit";

/** Quality-weighted sell value of all crops. Falls back to Normal quality if breakdown absent. */
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

/** Total units of a crop regardless of quality. */
export function totalCropCount(inv: Inventory, crop: CropKind): number {
  return inv.crops[crop];
}

/** Add harvested crops to inventory; increments both total count and quality breakdown. */
export function bankHarvest(inv: Inventory, crop: CropKind, qty: number, quality: CropQuality): void {
  inv.crops[crop] += qty;
  if (!inv.cropQuality) inv.cropQuality = {};
  if (!inv.cropQuality[crop]) inv.cropQuality[crop] = { normal: 0, silver: 0, gold: 0 };
  inv.cropQuality[crop]![quality] += qty;
}

/** Total count of a product kind in inventory (sum across quality tiers). */
export function totalProductCount(inv: Inventory, kind: ProductKind): number {
  const q = inv.products?.[kind];
  if (!q) return 0;
  return q.normal + q.silver + q.gold;
}

/** Total count of a fruit kind in inventory (sum across quality tiers). */
export function totalFruitCount(inv: Inventory, kind: FruitKind): number {
  const q = inv.fruit?.[kind];
  if (!q) return 0;
  return q.normal + q.silver + q.gold;
}

/** Add product units at a given quality tier to inventory. */
export function bankProduct(inv: Inventory, kind: ProductKind, qty: number, quality: CropQuality): void {
  if (!inv.products) inv.products = {};
  if (!inv.products[kind]) inv.products[kind] = { normal: 0, silver: 0, gold: 0 };
  inv.products[kind]![quality] += qty;
}

/** Add fruit units at a given quality tier to inventory. */
export function bankFruit(inv: Inventory, kind: FruitKind, qty: number, quality: CropQuality): void {
  if (!inv.fruit) inv.fruit = {};
  if (!inv.fruit[kind]) inv.fruit[kind] = { normal: 0, silver: 0, gold: 0 };
  inv.fruit[kind]![quality] += qty;
}

/** Quality-weighted sell value of all held products. */
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

/** Quality-weighted sell value of all held fruit. */
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

/** Deduct crops from inventory respecting quality split; preferred tier first. Returns amount deducted. */
export function deductCrops(inv: Inventory, crop: CropKind, qty: number, preferQuality?: CropQuality): number {
  const have = inv.crops[crop];
  const taken = Math.min(qty, have);
  if (taken <= 0) return 0;
  inv.crops[crop] -= taken;

  if (inv.cropQuality?.[crop]) {
    const q = inv.cropQuality[crop]!;
    let remaining = taken;
    const order: CropQuality[] = preferQuality
      ? [preferQuality, "silver", "normal", "gold"].filter((v, i, a) => a.indexOf(v) === i) as CropQuality[]
      : ["silver", "normal", "gold"] as CropQuality[];
    for (const tier of order) {
      if (remaining <= 0) break;
      const d = Math.min(remaining, q[tier]);
      q[tier] -= d;
      remaining -= d;
    }
  }
  return taken;
}
