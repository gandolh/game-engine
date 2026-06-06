// Barrel — re-exports every public symbol from the economy sub-modules so that
// existing importers of `../economy` continue to resolve without modification.

export {
  ZERO_CROPS,
  CROP_SELL_PRICE,
  SEED_COST,
  GROWTH_DAYS,
  CROP_SEASON,
  QUALITY_MULTIPLIER,
  OUT_OF_SEASON_GROWTH_RATE,
} from "./crops";

export {
  GREENHOUSE_BUILD_COST,
  GREENHOUSE_PLOT_COUNT,
  PEN_BUILD_COST,
  ANIMAL_BUY_COST,
  PEN_ANIMAL,
  ANIMAL_PRODUCT,
  PRODUCT_YIELD_PER_ANIMAL,
  PRODUCT_SELL_PRICE,
  CARE_DECAY_RATE,
  CARE_DECAY_UNFED,
  CARE_TEND_BOOST,
} from "./livestock";

export {
  TREE_PLANT_COST,
  ORCHARD_MATURATION_DAYS,
  FRUIT_YIELD_PER_HARVEST,
  FRUIT_SEASON,
  FRUIT_SELL_PRICE,
} from "./fruit";

export {
  HARBOR_REP_THRESHOLD,
  HARBOR_REP_MISS_PENALTY,
  HARBOR_POST_CADENCE,
  HARBOR_BATCH_SIZE,
  CONTRACT_REWARD_MULT,
  CONTRACT_REP_REWARD,
  CONTRACT_DEADLINE_DAYS,
  contractRewardValue,
} from "./harbor";

export {
  cropInventoryValue,
  totalCropCount,
  bankHarvest,
  totalProductCount,
  totalFruitCount,
  bankProduct,
  bankFruit,
  productInventoryValue,
  fruitInventoryValue,
  deductCrops,
} from "./helpers";
