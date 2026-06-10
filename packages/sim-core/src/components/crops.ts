import type { RegionId } from "../world/regions";

/** Season-gated crops. Out-of-season growth accrues at half rate (see economy.ts cropSeason). */
export type CropKind =
  | "radish"       // spring,  2d,  cost 5,  sell 8
  | "wheat"        // spring,  4d,  cost 8,  sell 14
  | "carrot"       // spring,  3d,  cost 6,  sell 11
  | "tomato"       // summer,  5d,  cost 10, sell 20
  | "corn"         // summer,  6d,  cost 12, sell 26
  | "pumpkin"      // autumn,  7d,  cost 15, sell 35
  | "grape"        // autumn,  9d,  cost 20, sell 50
  | "winter-squash"; // winter,  5d,  cost 9,  sell 22

/** Quality tier. Multipliers: Normal ×1.0 / Silver ×1.25 / Gold ×1.5 (see economy.ts). */
export type CropQuality = "normal" | "silver" | "gold";

/** Per-quality count for one crop kind. Used in `Inventory.cropQuality`. */
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
  /** When true, CropGrowthSystem skips the out-of-season growth penalty. */
  greenhouse?: boolean;
}

export type PlotState =
  | {
      kind: "empty";
      /** Exceeding PLOT_DECAY_DAYS reverts plot to green. Optional → 0. */
      daysSinceTended?: number;
    }
  | {
      kind: "planted";
      crop: CropKind;
      daysGrowing: number;
      readyAtDay: number;
      weatherSum: number;
      /** Days since last watered. Growth only advances on watered days; exceeding grace kills the crop. Optional → 0. */
      daysSinceWater?: number;
      /** True if watered (or rained on) during the current day. */
      wateredToday?: boolean;
    };

/** Days without tending before an empty plot reverts to green. */
export const PLOT_DECAY_DAYS = 5;
