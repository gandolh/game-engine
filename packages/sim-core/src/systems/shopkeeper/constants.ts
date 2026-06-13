import type { CropKind } from "../../components";

export const SHOP_BUY_PRICE: Record<CropKind, number> = {
  radish:          6,
  wheat:           10,
  carrot:          8,
  tomato:          13,
  corn:            16,
  pumpkin:         19,
  grape:           24,
  "winter-squash": 13,
};

export const SELLABLE_SEED_CROPS: ReadonlySet<string> = new Set<string>([
  "radish",
  "wheat",
  "carrot",
  "tomato",
  "corn",
  "pumpkin",
  "grape",
  "winter-squash",
]);

export const AUCTION_TRIGGER_INTERVAL_DAYS = 5;
export const AUCTION_RESERVE_PRICE = 50;

export const AUCTION_DURATION_TICKS = 25;

export const GOLDEN_BEAN_RESALE_MULTIPLIER = 3;
