import type { RegionId } from "../world/regions";

/**
 * brief 41 — expanded crop roster. Season-gated (each crop has a primary season
 * in economy.ts cropSeason; growing out of season accrues growth at half rate).
 */
export type CropKind =
  | "radish"       // spring,  2d,  cost 5,  sell 8
  | "wheat"        // spring,  4d,  cost 8,  sell 14
  | "carrot"       // spring,  3d,  cost 6,  sell 11
  | "tomato"       // summer,  5d,  cost 10, sell 20
  | "corn"         // summer,  6d,  cost 12, sell 26
  | "pumpkin"      // autumn,  7d,  cost 15, sell 35
  | "grape"        // autumn,  9d,  cost 20, sell 50
  | "winter-squash"; // winter,  5d,  cost 9,  sell 22

/**
 * brief 41 — quality tier earned at harvest. Normal is the baseline; Silver
 * and Gold reward consistent watering + husbandry + a seeded roll.
 * Multipliers: Normal ×1.0 / Silver ×1.25 / Gold ×1.5 (see economy.ts).
 */
export type CropQuality = "normal" | "silver" | "gold";

/**
 * Per-quality count for one crop kind. Used in `cropQuality` parallel inventory
 * (see Inventory comment below).
 */
export interface CropQualityCounts {
  normal: number;
  silver: number;
  gold: number;
}

export interface Plot {
  ownerId: number;
  regionId: RegionId;
  tileX: number;
  tileY: number;
  state: PlotState;
  /**
   * brief 43 — greenhouse plot flag. When true, this plot is inside a built
   * greenhouse: crops grow at FULL rate regardless of season (CropGrowthSystem
   * skips the out-of-season suitability multiplier). Optional/defaulted so all
   * existing open-field plots read as `false` (season-gated as before).
   */
  greenhouse?: boolean;
}

export type PlotState =
  | {
      kind: "empty";
      /**
       * Days since the plot was last tended (planted or watered). When this
       * exceeds PLOT_DECAY_DAYS the plot reverts to green (entity removed).
       * Optional/defaulted to 0 so existing empty plots start fresh.
       */
      daysSinceTended?: number;
    }
  | {
      kind: "planted";
      crop: CropKind;
      daysGrowing: number;
      readyAtDay: number;
      weatherSum: number;
      /**
       * brief 29 — irrigation. Days since this plot was last watered (by an
       * agent's `water` action or by rain). 0 on the day it's planted/watered.
       * Growth only advances on watered days; exceeding the grace window kills
       * the crop. Optional/defaulted so pre-29 planted states read as 0.
       */
      daysSinceWater?: number;
      /** True if watered (or rained on) during the current day. */
      wateredToday?: boolean;
    };

/** Days without tending before an empty plot reverts to green. */
export const PLOT_DECAY_DAYS = 5;
