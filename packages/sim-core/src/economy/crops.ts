import type { CropKind, CropQuality } from "../components";
import type { Season } from "../protocols/weather";

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
