export type ToolKind = "hoe" | "axe" | "pickaxe" | "fishing-rod";
export type ToolTier = "wooden" | "stone" | "iron";

export const TOOL_WORK_TICKS: Record<ToolTier, number> = {
  wooden: 60,
  stone:  40,
  iron:   20,
};

export const TOOL_PRICE: Record<ToolTier, number> = {
  wooden: 5,
  stone:  7,
  iron:   10,
};

export interface Tool {
  kind: ToolKind;
  tier: ToolTier;
  durability: number; 
}

export interface WateringCan {
  charges: number;    
  maxCharges: number; 
}
