import type { CropKind, ToolTier } from "../../components";
import type { Season } from "../../protocols/weather";

/** Mill pays more than the shopkeeper but costs a trip + 2 AP. */
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
/** Crops processed per `process-crop` action. */
export const MILL_BATCH = 5;

/** Foraging zones — productive only in-season; zones stay walkable year-round. */
export const FORAGE_ZONES: Record<string, { season: Season; reward: number }> = {
  "mushroom-grove": { season: "autumn", reward: 18 }, // truffles in autumn
  "ice-pond":       { season: "winter", reward: 22 }, // ice-fishing in winter
};

/** Stone drop table: [ironOre chance, geode chance]. Rest is plain stone. */
export const STONE_IRON_CHANCE  = 0.20;
export const STONE_GEODE_CHANCE = 0.10;

/** Upgrade path: wooden → stone → iron. */
export const UPGRADE_PATH: Record<ToolTier, ToolTier | null> = {
  wooden: "stone",
  stone:  "iron",
  iron:   null,
};

/** Gold cost to upgrade at blacksmith (per tier of destination). */
export const UPGRADE_COST: Partial<Record<ToolTier, number>> = {
  stone: 15,
  iron:  25,
};

/** Ore required per upgrade tier — missing ore rejects the upgrade (no mutation). */
export const UPGRADE_MATERIAL: Partial<Record<ToolTier, { resource: "stone" | "ironOre"; amount: number }>> = {
  stone: { resource: "stone",   amount: 2 },
  iron:  { resource: "ironOre", amount: 2 },
};

/** Gold a farmer pays the tavern to hire a day-helper. */
export const HIRE_HELP_GOLD_COST = 25;
