import type { RegionId } from "../world/regions";

export type CropKind =
  | "radish"       
  | "wheat"        
  | "carrot"       
  | "tomato"       
  | "corn"         
  | "pumpkin"      
  | "grape"        
  | "winter-squash"; 

export type CropQuality = "normal" | "silver" | "gold";

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

  greenhouse?: boolean;
}

export type PlotState =
  | {
      kind: "empty";

      daysSinceTended?: number;
    }
  | {
      kind: "planted";
      crop: CropKind;
      daysGrowing: number;
      readyAtDay: number;
      weatherSum: number;

      daysSinceWater?: number;

      wateredToday?: boolean;
    };

export const PLOT_DECAY_DAYS = 5;
