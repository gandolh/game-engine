import type { CropKind } from "./components";

// Single source of truth for the crop economy constants. These values were
// previously copy-pasted across act.ts, sim-bootstrap.ts, and every agent
// personality (as SHOP_PRICE / PRICE_MAX / *_PEER_SHOP_SELL_PRICE / SEED_COST),
// which risked silent drift between an agent's expectations and the gold it
// actually realizes. Keep them here so a price change lands in one place.

/**
 * Gold a farmer earns selling one unit of a crop to the shopkeeper. This is the
 * authoritative sell price: ActSystem pays it out, the leaderboard values
 * inventory by it, and agents use it as their peer/shop sell reference.
 */
export const CROP_SELL_PRICE: Record<CropKind, number> = {
  radish: 8,
  wheat: 14,
  pumpkin: 35,
};

/** Seed purchase cost per crop. */
export const SEED_COST: Record<CropKind, number> = {
  radish: 5,
  wheat: 8,
  pumpkin: 15,
};

/** Days from planting until a crop is harvest-ready. */
export const GROWTH_DAYS: Record<CropKind, number> = {
  radish: 2,
  wheat: 4,
  pumpkin: 7,
};
