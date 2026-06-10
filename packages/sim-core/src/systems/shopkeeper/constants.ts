import type { CropKind } from "../../components";

/** Price the shopkeeper PAYS to buy crops from farmers. brief 41 — extended. */
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

/**
 * Seeds the shop knows how to sell at all. The actual unit price now comes
 * from the daily slate (`ShopkeeperSystem.handleSell`); this set just gates
 * "unknown seed" before the slate lookup so unknown crops still get the
 * informative rejection reason rather than `no-matching-offer`.
 *
 * `golden_bean` is intentionally excluded — it's auction-only — and gets its
 * own dedicated rejection branch before this check.
 * brief 41 — extended to all 8 crop kinds.
 */
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
/**
 * brief 24 — an auction must stay open ACROSS the next day boundary so farmers
 * (who only deliberate on day-start) get a deliberation cycle to bid while the
 * CFP is in their beliefs. At 20 ticks/day, 25 ticks means: open on day N's
 * boundary, farmers bid on day N+1's boundary, resolve mid-day N+1. The old
 * 20-tick duration closed exactly as the next day began, so nobody ever bid.
 */
export const AUCTION_DURATION_TICKS = 25;

/**
 * brief 24 — the shop buys a won golden bean back at a fat premium over the
 * auction reserve, so winning + reselling is genuinely profitable and the
 * "like gold" framing holds. Resale price = reserve × this multiplier.
 */
export const GOLDEN_BEAN_RESALE_MULTIPLIER = 3;
