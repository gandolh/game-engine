import type { AnimalKind, ProductKind } from "../components";

export const GREENHOUSE_BUILD_COST: {
  goldCost: number;
  woodCost: number;
  stoneCost: number;
  goldDiscount: number;
} = { goldCost: 140, woodCost: 20, stoneCost: 12, goldDiscount: 50 };

export const GREENHOUSE_PLOT_COUNT = 4;

export const PEN_BUILD_COST: Record<
  "coop" | "barn",
  { goldCost: number; woodCost: number; goldDiscount: number }
> = {
  coop: { goldCost: 45, woodCost: 8,  goldDiscount: 15 },
  barn: { goldCost: 75, woodCost: 12, goldDiscount: 25 },
};

export const ANIMAL_BUY_COST: Record<AnimalKind, number> = {
  chicken: 15,
  cow:     35,
  sheep:   30,
};

export const PEN_ANIMAL: Record<"coop" | "barn", AnimalKind[]> = {
  coop: ["chicken"],
  barn: ["cow", "sheep"],
};

export const ANIMAL_PRODUCT: Record<AnimalKind, ProductKind> = {
  chicken: "egg",
  cow:     "milk",
  sheep:   "wool",
};

export const PRODUCT_YIELD_PER_ANIMAL: Record<AnimalKind, number> = {
  chicken: 1,
  cow:     1,
  sheep:   1,
};

export const PRODUCT_SELL_PRICE: Record<ProductKind, number> = {
  egg:  8,
  milk: 12,
  wool: 14,
};

export const CARE_DECAY_RATE = 0.05;

export const CARE_DECAY_UNFED = 0.12;

export const CARE_TEND_BOOST = 0.20;
