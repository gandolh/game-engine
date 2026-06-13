import type { CropKind, ToolTier } from "../../components";
import type { Season } from "../../protocols/weather";

export const MILL_PRICE: Record<CropKind, number> = {
  radish:          8,
  wheat:           13,
  carrot:          10,
  tomato:          18,
  corn:            24,
  pumpkin:         33,
  grape:           46,
  "winter-squash": 20,
};

export const MILL_BATCH = 5;

export const FORAGE_ZONES: Record<string, { season: Season; reward: number }> = {
  "mushroom-grove": { season: "autumn", reward: 18 }, 
  "ice-pond":       { season: "winter", reward: 22 }, 
};

export const STONE_IRON_CHANCE  = 0.20;
export const STONE_GEODE_CHANCE = 0.10;

export const UPGRADE_PATH: Record<ToolTier, ToolTier | null> = {
  wooden: "stone",
  stone:  "iron",
  iron:   null,
};

export const UPGRADE_COST: Partial<Record<ToolTier, number>> = {
  stone: 15,
  iron:  25,
};

export const UPGRADE_MATERIAL: Partial<Record<ToolTier, { resource: "stone" | "ironOre"; amount: number }>> = {
  stone: { resource: "stone",   amount: 2 },
  iron:  { resource: "ironOre", amount: 2 },
};

export const HIRE_HELP_GOLD_COST = 25;
