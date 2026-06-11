import type { CropKind, CropQuality } from "../components";
import type { Season } from "../protocols/weather";

/** Zero-initialized record for all CropKind values. Spread + override in tests/setup: `{ ...ZERO_CROPS, wheat: 3 }`. */
export const ZERO_CROPS: Record<CropKind, number> = {
  radish: 0, wheat: 0, carrot: 0, tomato: 0, corn: 0, pumpkin: 0, grape: 0, "winter-squash": 0,
};

/** Authoritative sell price per Normal-quality crop unit. ActSystem pays it out; agents use it for peer/shop reference. Quality multipliers apply on top. */
export const CROP_SELL_PRICE: Record<CropKind, number> = {
  radish:       9,
  wheat:        15,
  carrot:       12,
  tomato:       20,
  corn:         25,
  pumpkin:      30,
  grape:        38,
  "winter-squash": 21,
};

/** Seed purchase cost per crop. */
export const SEED_COST: Record<CropKind, number> = {
  radish:       5,
  wheat:        8,
  carrot:       6,
  tomato:       10,
  corn:         13,
  pumpkin:      15,
  grape:        19,
  "winter-squash": 11,
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

/** Native season for each crop (full rate); out-of-season growth runs at OUT_OF_SEASON_GROWTH_RATE. */
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

/** Quality multipliers applied on top of CROP_SELL_PRICE at sell-time (normal=1.0, silver=1.25, gold=1.5). */
export const QUALITY_MULTIPLIER: Record<CropQuality, number> = {
  normal: 1.0,
  silver: 1.25,
  gold:   1.5,
};

/** Growth rate for out-of-season crops (0.5 = half rate). In-season = 1.0. */
export const OUT_OF_SEASON_GROWTH_RATE = 0.5;
