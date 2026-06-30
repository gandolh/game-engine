/**
 * Pure data module for the Citadel "inspect a building" panel.
 *
 * Provides:
 *   - BUILDING_DESCRIPTIONS: per-type player-facing one-liners (every type in PRODUCTION_DEFS).
 *   - productionRatePerDay: human-readable production rate, derived from PRODUCTION_DEFS ×
 *     level multiplier × cycles/day, with optional seasonal grain adjustment for farms.
 *   - getProductionDetails: structured inputs/outputs/cycles tuple for richer panel layout.
 *   - isServiceBuilding / getServiceRadius / getServiceRect: coverage helpers.
 *
 * No DOM, no WebGPU, no Math.random / Date.now — safe to use in tests and workers.
 * All numbers are derived from the live defs; nothing is hardcoded.
 */
import {
  PRODUCTION_DEFS,
  SERVICE_RADII,
  SERVICE_RECTS,
  effectiveOutputPerCycle,
  outputBufferCap,
  type BuildingProductionDef,
} from "@citadel/sim-core";
import { grainMultiplier, type Season } from "@citadel/sim-core";

// ---------------------------------------------------------------------------
// TICKS_PER_DAY — must match games/citadel/client/src/main.ts
// ---------------------------------------------------------------------------

/**
 * The number of sim ticks per in-game day (mirrors the constant in main.ts; main.ts is the
 * browser entry point and can't be imported here without its side effects). A guard test in
 * building-info.test.ts reads main.ts's literal and asserts it equals this, so the two can't
 * silently desync.
 */
export const TICKS_PER_DAY = 20;

// ---------------------------------------------------------------------------
// Per-type descriptions
// ---------------------------------------------------------------------------

/** Player-facing one-line description for every building type in PRODUCTION_DEFS. */
export const BUILDING_DESCRIPTIONS: Readonly<Record<string, string>> = {
  house:       "Houses up to 6 villagers. Upgrade to hold more people.",
  farm:        "Grows grain each cycle. Yield varies by season — nothing in winter.",
  mill:        "Grinds grain into flour. Needs a worker and a road.",
  bakery:      "Bakes flour into bread. Needs a worker and a road.",
  woodcutter:  "Chops wood from forest terrain. Needs 2 workers and a road.",
  storehouse:  "Stores all goods. Extend your supply limit here.",
  road:        "Connects buildings so workers and haulers can move goods.",
  bridge:      "Road segment spanning water. Auto-placed when a road crosses a river.",
  chapel:      "Boosts villager morale nearby. Needs a worker to run services.",
  market:      "Improves commerce and happiness in its coverage area. Needs a worker.",
  watchpost:   "Extends visibility and improves safety in the surrounding area.",
  tradingpost: "Enables trade with passing caravans. Needs a worker.",
  quarry:      "Extracts stone from stone terrain. Needs 2 workers and a road.",
  sawmill:     "Converts wood into planks. Needs a worker and a road.",
  smith:       "Forges stone into tools. Needs a worker and a road.",
  mine:        "Mines raw stone from stone terrain. Needs 2 workers and a road.",
  wall:        "Impassable barrier. Drag-paint a perimeter to keep raiders out.",
  gate:        "Gap in a wall that villagers can pass through. Raiders can breach it.",
  tower:       "Adds 5 defense strength to your settlement. Upgrades add +2 each.",
  garrison:    "Houses soldiers and adds 10 defense strength. Needs 4 workers.",
  keep:        "Your citadel's heart. If sacked the game ends. Adds 8 defense strength.",
  "town-hall": "Each player's match anchor in multiplayer. Sacking it ends that player's run.",
  well:        "Reduces fire ignition in a nearby rectangle. No worker needed.",
  healer:      "Lowers disease onset and mortality in its coverage area. Needs a worker.",
};

// ---------------------------------------------------------------------------
// Structured production details
// ---------------------------------------------------------------------------

/**
 * Structured breakdown of a building's production at a given level/season.
 * The panel can use this to lay out rows instead of parsing the formatted string.
 */
export interface ProductionDetails {
  /** Input good name, or undefined if none. */
  readonly inputGood: string | undefined;
  /** Effective input consumed per day (accounting for level; farms have no input). */
  readonly inputPerDay: number;
  /** Output good name, or undefined if none. */
  readonly outputGood: string | undefined;
  /** Effective output produced per day (accounting for level and season for farms). */
  readonly outputPerDay: number;
  /** Number of full production cycles per day at this ticksPerCycle. */
  readonly cyclesPerDay: number;
  /** Level passed in. */
  readonly level: number;
  /** Season passed in (only relevant for farms). */
  readonly season: Season | undefined;
}

/**
 * Return structured production details for `type` at `level` (1–3) and optional `season`.
 * Returns `undefined` for buildings that produce nothing (services, infrastructure).
 *
 * Derives everything from `PRODUCTION_DEFS` — no hardcoded numbers.
 */
export function getProductionDetails(
  type: string,
  level: number,
  season?: Season,
): ProductionDetails | undefined {
  const def: BuildingProductionDef | undefined = PRODUCTION_DEFS[type];
  if (def === undefined) return undefined;
  if (def.outputGood === undefined) return undefined;

  const cyclesPerDay = TICKS_PER_DAY / def.ticksPerCycle;
  const baseOutputPerCycle = effectiveOutputPerCycle(def, level);

  // Farms apply the seasonal grain multiplier; output is floored again after multiplying.
  const seasonMult =
    type === "farm" && season !== undefined ? grainMultiplier(season) : 1.0;
  const effectiveOutputPerDay = Math.floor(baseOutputPerCycle * seasonMult) * cyclesPerDay;

  // Input does NOT scale with level: the sim (production.ts) draws raw
  // `def.inputPerCycle` from the stockpile each cycle regardless of level — only
  // OUTPUT scales (effectiveOutputPerCycle). So a L3 converter still consumes 1
  // flour/cycle while emitting more bread. Mirror that here, or the panel would
  // overstate the input.
  const effectiveInputPerDay = def.inputPerCycle * cyclesPerDay;

  return {
    inputGood: def.inputGood,
    inputPerDay: effectiveInputPerDay,
    outputGood: def.outputGood,
    outputPerDay: effectiveOutputPerDay,
    cyclesPerDay,
    level,
    season,
  };
}

// ---------------------------------------------------------------------------
// Production-rate string
// ---------------------------------------------------------------------------

/**
 * Return a human-readable production-rate string for `type` at `level` and optional `season`.
 *
 * Examples:
 *   productionRatePerDay("bakery", 1)           → "1 flour → 3 bread/day"
 *   productionRatePerDay("farm", 1, "summer")   → "6 grain/day"
 *   productionRatePerDay("farm", 1, "winter")   → "0 grain/day (winter)"
 *   productionRatePerDay("chapel", 1)           → undefined
 *
 * Returns `undefined` for buildings with no goods output (services, infrastructure).
 */
export function productionRatePerDay(
  type: string,
  level: number,
  season?: Season,
): string | undefined {
  const details = getProductionDetails(type, level, season);
  if (details === undefined) return undefined;

  const { inputGood, inputPerDay, outputGood, outputPerDay } = details;
  const outputPart = `${outputPerDay} ${outputGood}/day`;
  const inputPart = inputGood !== undefined && inputPerDay > 0
    ? `${inputPerDay} ${inputGood} → `
    : "";

  // Annotate when a farm produces nothing due to winter.
  const suffix =
    type === "farm" && season === "winter" ? " (winter)" : "";

  return `${inputPart}${outputPart}${suffix}`;
}

// ---------------------------------------------------------------------------
// Service-building helpers
// ---------------------------------------------------------------------------

/**
 * Whether a building type provides a coverage service (chapel, market, watchpost,
 * well, etc.). Services have an entry in SERVICE_RADII or SERVICE_RECTS.
 */
export function isServiceBuilding(type: string): boolean {
  return type in SERVICE_RADII || type in SERVICE_RECTS;
}

/**
 * Return the Manhattan-radius coverage for a service building, or `undefined`
 * for buildings that use a rectangular reach (SERVICE_RECTS) or are not services.
 */
export function getServiceRadius(type: string): number | undefined {
  return SERVICE_RADII[type];
}

/**
 * Return the rectangular coverage dimensions `{ w, h }` for a service building
 * that uses a rectangle (currently only `well`), or `undefined` for others.
 */
export function getServiceRect(type: string): { readonly w: number; readonly h: number } | undefined {
  return SERVICE_RECTS[type];
}

/**
 * Return whether `type` accepts an input good and which goods flow through it.
 * Useful for the panel to render an "inputs → outputs" row without parsing a string.
 */
export function getGoodsFlow(
  type: string,
): { readonly inputGood: string | undefined; readonly outputGood: string | undefined } | undefined {
  const def = PRODUCTION_DEFS[type];
  if (def === undefined) return undefined;
  return { inputGood: def.inputGood, outputGood: def.outputGood };
}

/**
 * Number of worker slots `type` has at full staff, or 0 for buildings that need
 * no worker (houses, walls, wells, storehouses, roads). Drives the panel's
 * "workers N/M" row and the throttle check (a building with slots but 0 workers
 * is slowed).
 */
export function getWorkerSlots(type: string): number {
  return PRODUCTION_DEFS[type]?.workerSlots ?? 0;
}

/**
 * Whether a building's production is currently SLOWED (post cozy-pivot: throttled,
 * never fully stopped). A producing building is slowed when any of:
 *   - it has worker slots but no worker is assigned (`workerCount === 0`),
 *   - it isn't connected to the road network (`connected === false`),
 *   - its local output buffer is at/over the cap (output has nowhere to go).
 *
 * Buildings that produce nothing (services, infrastructure, housing) are never
 * "slowed" in this sense — returns false for them so the panel omits the note.
 *
 * `level` feeds the buffer cap (cap scales with per-cycle output, which scales
 * with level). Pure — derives the cap from the live defs, no hardcoded numbers.
 */
export function isProductionThrottled(
  type: string,
  level: number,
  live: { workerCount: number; connected: boolean; outputBuffer: number },
): boolean {
  const def = PRODUCTION_DEFS[type];
  if (def === undefined || def.outputGood === undefined) return false; // not a producer
  if (def.workerSlots > 0 && live.workerCount === 0) return true;
  if (!live.connected) return true;
  const cap = outputBufferCap(effectiveOutputPerCycle(def, level));
  if (live.outputBuffer >= cap) return true;
  return false;
}

