import type { CropKind } from "../../components";

/** Price the shopkeeper PAYS to buy crops from farmers. */
export const SHOP_BUY_PRICE: Record<CropKind, number> = {
  radish:          5,
  wheat:           8,
  carrot:          7,
  tomato:          13,
  corn:            17,
  pumpkin:         22,
  grape:           32,
  "winter-squash": 14,
};

/** Seeds the shop can sell. golden_bean excluded (auction-only); gates "unknown seed" rejection before slate lookup. */
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
/** Auction must cross a day boundary so farmers get a deliberation cycle to bid (CFP lands, they deliberate next morning). */
export const AUCTION_DURATION_TICKS = 25;
/** Resale price = reserve × multiplier; winning + reselling is genuinely profitable. */
export const GOLDEN_BEAN_RESALE_MULTIPLIER = 3;
