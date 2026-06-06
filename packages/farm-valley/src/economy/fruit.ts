import type { FruitKind } from "../components";
import type { Season } from "../protocols/weather";

// ── Orchard economy constants (brief 42) ─────────────────────────────────────

/** Gold cost to plant a fruit tree at the farm. */
export const TREE_PLANT_COST: Record<FruitKind, number> = {
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
