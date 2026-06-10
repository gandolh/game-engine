import type { AnimalKind, ProductKind } from "../components";

/** Greenhouse build cost. Gold-funded; wood+stone give optional discount (gold-only=140, with materials effective≈90). Heavier than a barn (75) — a genuine late-game decision. */
export const GREENHOUSE_BUILD_COST: {
  goldCost: number;
  woodCost: number;
  stoneCost: number;
  goldDiscount: number;
} = { goldCost: 140, woodCost: 20, stoneCost: 12, goldDiscount: 50 };

/** Number of season-immune plots a greenhouse provides. */
export const GREENHOUSE_PLOT_COUNT = 4;

/** Gold-funded pen cost; wood gives optional discount (coop gold-only=45, with wood≈30; barn gold-only=75, with wood≈50). */
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
/** Faster decay rate when pen is unfed. */
export const CARE_DECAY_UNFED = 0.12;
/** Amount care is raised by a `tend` action. */
export const CARE_TEND_BOOST = 0.20;
