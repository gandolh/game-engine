import type { CropKind, CropQuality, CropQualityCounts, Inventory, ProductKind, FruitKind, AnimalKind } from "./components";
import type { Season } from "./protocols/weather";

/**
 * Zero-initialized crop record covering all 8 CropKind values.
 * Use this (spread + override) wherever tests or world-setup need a complete
 * Record<CropKind, number>. Example: `{ ...ZERO_CROPS, wheat: 3 }`.
 */
export const ZERO_CROPS: Record<CropKind, number> = {
  radish: 0, wheat: 0, carrot: 0, tomato: 0, corn: 0, pumpkin: 0, grape: 0, "winter-squash": 0,
};

// Single source of truth for the crop economy constants. These values were
// previously copy-pasted across act.ts, sim-bootstrap.ts, and every agent
// personality (as SHOP_PRICE / PRICE_MAX / *_PEER_SHOP_SELL_PRICE / SEED_COST),
// which risked silent drift between an agent's expectations and the gold it
// actually realizes. Keep them here so a price change lands in one place.

/**
 * Gold a farmer earns selling one unit of a Normal-quality crop to the
 * shopkeeper. Quality multipliers are applied on top (see QUALITY_MULTIPLIER).
 * This is the authoritative sell price: ActSystem pays it out, the leaderboard
 * values inventory by it, and agents use it as their peer/shop sell reference.
 */
export const CROP_SELL_PRICE: Record<CropKind, number> = {
  radish:       8,
  wheat:        14,
  carrot:       11,
  tomato:       20,
  corn:         26,
  pumpkin:      35,
  grape:        50,
  "winter-squash": 22,
};

/** Seed purchase cost per crop. */
export const SEED_COST: Record<CropKind, number> = {
  radish:       5,
  wheat:        8,
  carrot:       6,
  tomato:       10,
  corn:         12,
  pumpkin:      15,
  grape:        20,
  "winter-squash": 9,
};

/** Days from planting until a crop is harvest-ready (in its native season). */
export const GROWTH_DAYS: Record<CropKind, number> = {
  radish:       2,
  wheat:        4,
  carrot:       3,
  tomato:       5,
  corn:         6,
  pumpkin:      7,
  grape:        9,
  "winter-squash": 5,
};

/**
 * brief 41 — season each crop grows full-rate in. Growing out of season yields
 * HALF the normal growth rate (0.5 multiplier applied to the daysGrowing
 * advance in CropGrowthSystem). This creates planning pressure without making
 * off-season planting outright impossible.
 */
export const CROP_SEASON: Record<CropKind, Season> = {
  radish:       "spring",
  wheat:        "spring",
  carrot:       "spring",
  tomato:       "summer",
  corn:         "summer",
  pumpkin:      "autumn",
  grape:        "autumn",
  "winter-squash": "winter",
};

/**
 * brief 41 — quality sell-price multipliers. Silver = ×1.25, Gold = ×1.5.
 * Applied at sell-time on top of CROP_SELL_PRICE[crop].
 */
export const QUALITY_MULTIPLIER: Record<CropQuality, number> = {
  normal: 1.0,
  silver: 1.25,
  gold:   1.5,
};

/**
 * brief 41 — season suitability multiplier for out-of-season growth.
 * In-season crops grow at 1.0; out-of-season crops grow at 0.5 (half rate).
 */
export const OUT_OF_SEASON_GROWTH_RATE = 0.5;

/**
 * brief 41 — compute the quality-weighted sell value of all crops in inventory.
 * Uses `cropQuality` breakdown if present; otherwise treats all units as Normal.
 * Used by leaderboard(), totalValue helpers, and run-history.
 */
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
      // All units are Normal when quality breakdown is absent.
      total += totalUnits * basePrice * QUALITY_MULTIPLIER.normal;
    }
  }
  return total;
}

/**
 * brief 41 — total count of a single crop kind (convenience helper).
 * Equivalent to inv.crops[crop] but clearly named for call sites that want
 * "total regardless of quality".
 */
export function totalCropCount(inv: Inventory, crop: CropKind): number {
  return inv.crops[crop];
}

/**
 * brief 41 — add harvested crops to inventory, respecting the quality split.
 * Increments both `crops[crop]` (total) and `cropQuality[crop][quality]`.
 */
export function bankHarvest(inv: Inventory, crop: CropKind, qty: number, quality: CropQuality): void {
  inv.crops[crop] += qty;
  if (!inv.cropQuality) inv.cropQuality = {};
  if (!inv.cropQuality[crop]) inv.cropQuality[crop] = { normal: 0, silver: 0, gold: 0 };
  inv.cropQuality[crop]![quality] += qty;
}

// ── Livestock economy constants (brief 42) ───────────────────────────────────

/**
 * Cost to build a pen at the carpenter.
 *
 * brief 42 (deliberation fix) — pens are now GOLD-FUNDED with wood as an OPTIONAL
 * discount, rather than wood-GATED. The original `woodCost`-gated recipe made the
 * feature dormant live: AI farmers almost never chop wood (it competes with
 * farming), so a hard wood prerequisite never cleared and ZERO pens were ever
 * built in a 100-day run. The carpenter stays relevant (build still happens
 * there; brief 44 will craft pens there too) and wood stays meaningful (it buys
 * a gold discount), but gold alone now suffices — which is what lets the patient
 * personalities (who bank plenty of gold) actually invest.
 *
 *   goldCost      — gold paid when the farmer has NO wood to spend.
 *   woodCost      — wood consumed to earn the discount (optional; 0 = pay full gold).
 *   goldDiscount  — gold saved when `woodCost` wood is available and spent.
 *
 * With wood in hand the effective cost matches the original recipe
 * (coop = 30 gold + 8 wood, barn = 50 gold + 12 wood).
 */
export const PEN_BUILD_COST: Record<
  "coop" | "barn",
  { goldCost: number; woodCost: number; goldDiscount: number }
> = {
  coop: { goldCost: 45, woodCost: 8,  goldDiscount: 15 },
  barn: { goldCost: 75, woodCost: 12, goldDiscount: 25 },
};

/** Gold cost to buy one animal at the village shopkeeper. */
export const ANIMAL_BUY_COST: Record<AnimalKind, number> = {
  chicken: 15,
  cow:     35,
  sheep:   30,
};

/** Which animal a pen kind can hold (coop → chicken; barn → cow or sheep). */
export const PEN_ANIMAL: Record<"coop" | "barn", AnimalKind[]> = {
  coop: ["chicken"],
  barn: ["cow", "sheep"],
};

/** Which product each animal produces daily. */
export const ANIMAL_PRODUCT: Record<AnimalKind, ProductKind> = {
  chicken: "egg",
  cow:     "milk",
  sheep:   "wool",
};

/** Base daily yield per animal (at full care). */
export const PRODUCT_YIELD_PER_ANIMAL: Record<AnimalKind, number> = {
  chicken: 1,
  cow:     1,
  sheep:   1,
};

/** Sell price per product unit (Normal quality). Quality multipliers apply. */
export const PRODUCT_SELL_PRICE: Record<ProductKind, number> = {
  egg:  8,
  milk: 12,
  wool: 14,
};

/** Daily care decay rate (applied each day; faster decay on unfed days). */
export const CARE_DECAY_RATE = 0.05;
/** Faster decay when pen is unfed. */
export const CARE_DECAY_UNFED = 0.12;
/** Amount care is raised by a `tend` action. */
export const CARE_TEND_BOOST = 0.20;

// ── Orchard economy constants (brief 42) ─────────────────────────────────────

/** Gold cost to plant a fruit tree at the farm. */
export const TREE_PLANT_COST: Record<import("./components").FruitKind, number> = {
  apple:  25,
  cherry: 20,
};

/** Days for a fruit tree to mature (much slower than crops). */
export const ORCHARD_MATURATION_DAYS = 20;

/** Fruit yield per harvest (mature tree, in its yield season). */
export const FRUIT_YIELD_PER_HARVEST = 4;

/** The season each fruit yields in (perennial — once per cycle). */
export const FRUIT_SEASON: Record<FruitKind, Season> = {
  apple:  "autumn",
  cherry: "spring",
};

/** Sell price per fruit unit (Normal quality). Quality multipliers apply. */
export const FRUIT_SELL_PRICE: Record<FruitKind, number> = {
  apple:  18,
  cherry: 20,
};

// ── Livestock inventory helpers (brief 42) ────────────────────────────────────

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

/**
 * brief 42 — deduct harvested crops from inventory respecting quality split.
 * Deducts from the specified quality tier first, then falls back to lower tiers.
 * Returns the amount actually deducted.
 */
export function deductCrops(inv: Inventory, crop: CropKind, qty: number, preferQuality?: CropQuality): number {
  const have = inv.crops[crop];
  const taken = Math.min(qty, have);
  if (taken <= 0) return 0;
  inv.crops[crop] -= taken;

  // Update quality breakdown.
  if (inv.cropQuality?.[crop]) {
    const q = inv.cropQuality[crop]!;
    let remaining = taken;
    // Deduct from requested quality first, then silver, then normal, then gold.
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
