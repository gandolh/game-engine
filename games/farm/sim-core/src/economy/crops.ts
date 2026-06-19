import type { CropKind, CropQuality } from "../components";
import type { Season } from "../protocols/weather";

export const ZERO_CROPS: Record<CropKind, number> = {
  radish: 0, wheat: 0, carrot: 0, tomato: 0, corn: 0, pumpkin: 0, grape: 0, "winter-squash": 0,
};

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

export const QUALITY_MULTIPLIER: Record<CropQuality, number> = {
  normal: 1.0,
  silver: 1.25,
  gold:   1.5,
};

export const OUT_OF_SEASON_GROWTH_RATE = 0.5;
