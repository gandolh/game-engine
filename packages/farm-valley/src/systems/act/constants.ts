import type { CropKind, ToolTier } from "../../components";
import type { Season } from "../../protocols/weather";

/**
 * Mill processing price per crop unit — the gold a farmer earns by milling raw
 * crops into goods at the mill. Set above the shopkeeper's buy price to create
 * an economic gradient: the mill pays more, but it costs a trip + 2 AP.
 * brief 41 — extended to cover all crop kinds.
 */
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

/**
 * Seasonal foraging zones: each is only productive in its season. Foraging in
 * the right zone + right season yields gold; out of season (or wrong zone) it's
 * a no-op. This is the seasonal "lock" — enforced here, not in pathfinding, so
 * the zones stay walkable year-round but only reward in-season.
 */
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

/**
 * brief 44 — the blacksmith now VALIDATES upgrades for real instead of
 * assume-success: each tier consumes ore from the farmer's ResourceInventory in
 * addition to gold. wooden→stone needs raw STONE; stone→iron needs IRON ORE.
 * Without the ore the upgrade is rejected (no mutation). The blacksmith is where
 * mining pays off — you turn the rock you dug into a better tool.
 */
export const UPGRADE_MATERIAL: Partial<Record<ToolTier, { resource: "stone" | "ironOre"; amount: number }>> = {
  stone: { resource: "stone",   amount: 2 },
  iron:  { resource: "ironOre", amount: 2 },
};

/** brief 44 — gold a farmer pays the tavern to hire a day-helper. */
export const HIRE_HELP_GOLD_COST = 25;
