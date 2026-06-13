import type { FruitKind } from "../components";
import type { Season } from "../protocols/weather";

export const TREE_PLANT_COST: Record<FruitKind, number> = {
  apple:  25,
  cherry: 20,
};

export const ORCHARD_MATURATION_DAYS = 20;

export const FRUIT_YIELD_PER_HARVEST = 4;

export const FRUIT_SEASON: Record<FruitKind, Season> = {
  apple:  "autumn",
  cherry: "spring",
};

export const FRUIT_SELL_PRICE: Record<FruitKind, number> = {
  apple:  18,
  cherry: 20,
};
