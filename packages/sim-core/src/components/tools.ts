export type ToolKind = "hoe" | "axe" | "pickaxe" | "fishing-rod";
export type ToolTier = "wooden" | "stone" | "iron";

/** Work-ticks (at 20 Hz) per action by tier. 3s / 2s / 1s. */
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
  durability: number; // remaining uses
}

export interface WateringCan {
  charges: number;    // remaining uses before refill
  maxCharges: number; // always 10
}
