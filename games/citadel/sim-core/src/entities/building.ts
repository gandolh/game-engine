/**
 * Building ECS component + entity shape for Citadel.
 *
 * Each placed building is a single ECS entity with a `building` component.
 * The component records the building's type, tile origin, footprint dims, and
 * (Phase 2) mutable runtime economy state lives in a separate state map.
 */
import type { EngineEntity } from "@engine/core";

/** Goods that flow through the Citadel economy. */
export type GoodType = "grain" | "flour" | "bread" | "wood" | "stone" | "planks" | "tools";

/** Terrain requirements a building may impose on its tiles. */
export type TerrainReq = "forest" | "stone";

/**
 * Mutable per-building runtime economy state. NOT readonly — mutated in place
 * by the production / villager / connectivity systems each tick.
 */
export interface BuildingRuntimeState {
  outputBuffer: number;
  inputBuffer: number;
  workerCount: number;
  connected: boolean;
  productionTick: number;
  /** Upgrade level 1..BUILDING_MAX_LEVEL. New buildings start at 1. */
  level: number;
}

export interface BuildingComponent {
  /** e.g. "house" */
  readonly type: string;
  /** Top-left tile column */
  readonly x: number;
  /** Top-left tile row */
  readonly y: number;
  /** Footprint width in tiles */
  readonly w: number;
  /** Footprint height in tiles */
  readonly h: number;
  /**
   * Owning player id (Citadel 28). Single-player is the 1-player case where
   * every building is owned by player 0. Per-player systems group buildings by
   * this id; iteration over players is in stable id order for determinism.
   */
  readonly ownerId: number;
}

/** ECS entity shape for buildings in Citadel. */
export interface BuildingEntity extends EngineEntity {
  building: BuildingComponent;
}

// ---------------------------------------------------------------------------
// Building type registry — footprint sizes per type
// ---------------------------------------------------------------------------

export interface BuildingDef {
  readonly w: number;
  readonly h: number;
}

const BUILDING_DEFS: Readonly<Record<string, BuildingDef>> = {
  house: { w: 2, h: 2 },
  farm: { w: 3, h: 3 },
  mill: { w: 2, h: 2 },
  bakery: { w: 2, h: 2 },
  woodcutter: { w: 2, h: 2 },
  storehouse: { w: 3, h: 2 },
  road: { w: 1, h: 1 },
  // Phase 3: service buildings
  chapel:      { w: 2, h: 2 },
  market:      { w: 2, h: 2 },
  watchpost:   { w: 2, h: 2 },
  tradingpost: { w: 3, h: 2 },
  // Phase 4: refining + siege
  quarry:   { w: 2, h: 2 }, // terrain-locked on Stone terrain
  sawmill:  { w: 2, h: 2 }, // wood → planks
  smith:    { w: 2, h: 2 }, // stone → tools
  mine:     { w: 2, h: 2 }, // produces stone (same terrain req as quarry)
  wall:     { w: 1, h: 1 }, // impassable, drag-paint
  gate:     { w: 1, h: 1 }, // passable to villagers (NOT wall-blocked)
  tower:    { w: 2, h: 2 }, // defensive strength contributor
  garrison: { w: 3, h: 2 }, // houses soldiers, worker/pop sink
  keep:     { w: 3, h: 3 }, // the heart; if sacked → game-over
  // Citadel 29 (MP): each player's match-start anchor; sacked → elimination.
  "town-hall": { w: 3, h: 3 },
  // Phase 4.5: hazard mitigation
  well:    { w: 1, h: 1 }, // reduces fire ignition chance nearby
  healer:  { w: 2, h: 2 }, // reduces disease onset and mortality
};

/** Service radius for buildings that provide needs coverage (in tiles, Manhattan). */
export const SERVICE_RADII: Readonly<Record<string, number>> = {
  chapel: 8,
  watchpost: 8,
  market: 8,
  // Phase 4: defensive buildings extend a safety footprint too
  tower: 6,
  garrison: 8,
  keep: 10,
  "town-hall": 10,
  // Phase 4.5: hazard mitigation radii
  well: 5,
  healer: 8,
};

export function getBuildingDef(type: string): BuildingDef | undefined {
  return BUILDING_DEFS[type];
}

// ---------------------------------------------------------------------------
// Production registry — per-type economy config
// ---------------------------------------------------------------------------

export interface BuildingProductionDef {
  readonly workerSlots: number;
  readonly inputGood?: GoodType;
  readonly outputGood?: GoodType;
  readonly inputPerCycle: number;
  readonly outputPerCycle: number;
  readonly ticksPerCycle: number;
  readonly terrainReq?: TerrainReq;
  readonly isStorage?: boolean;
  readonly isRoad?: boolean;
  readonly isHousing?: boolean;
  readonly housingCapacity?: number;
  // Phase 4: siege flags
  readonly isWall?: boolean;
  readonly isGate?: boolean;
  readonly isGarrison?: boolean;
  readonly isKeep?: boolean;
  readonly defenseStrength?: number;
  // Phase 4.5: hazard service flags
  readonly isWell?: boolean;
  readonly isHealer?: boolean;
}

export const PRODUCTION_DEFS: Readonly<Record<string, BuildingProductionDef>> = {
  house: {
    workerSlots: 0,
    isHousing: true,
    housingCapacity: 6,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  farm: {
    workerSlots: 2,
    outputGood: "grain",
    // 3 grain/cycle × 2 cycles/day = 6 grain/day in summer
    // spring×0.5=1.5→floor=1/cycle, autumn×1.2=3.6→floor=3/cycle, winter×0=0
    outputPerCycle: 3,
    ticksPerCycle: 10,
    inputPerCycle: 0,
  },
  mill: {
    workerSlots: 1,
    inputGood: "grain",
    outputGood: "flour",
    // Converts 1 grain → 2 flour per cycle (2 cycles/day = 4 flour/day)
    inputPerCycle: 1,
    outputPerCycle: 2,
    ticksPerCycle: 10,
  },
  bakery: {
    workerSlots: 1,
    inputGood: "flour",
    outputGood: "bread",
    // Converts 1 flour → 3 bread per cycle (2 cycles/day = 6 bread/day)
    inputPerCycle: 1,
    outputPerCycle: 3,
    ticksPerCycle: 10,
  },
  woodcutter: {
    workerSlots: 2,
    outputGood: "wood",
    outputPerCycle: 2,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    terrainReq: "forest",
  },
  storehouse: {
    workerSlots: 0,
    isStorage: true,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  road: {
    workerSlots: 0,
    isRoad: true,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  // Phase 3: service buildings (worker slots but no goods production)
  chapel: {
    workerSlots: 1,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  market: {
    workerSlots: 1,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  watchpost: {
    workerSlots: 1,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  tradingpost: {
    workerSlots: 1,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  // Phase 4: refining chains
  quarry: {
    workerSlots: 2,
    outputGood: "stone",
    outputPerCycle: 2,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    terrainReq: "stone",
  },
  sawmill: {
    workerSlots: 1,
    inputGood: "wood",
    outputGood: "planks",
    inputPerCycle: 1,
    outputPerCycle: 2,
    ticksPerCycle: 10,
  },
  smith: {
    workerSlots: 1,
    inputGood: "stone",
    outputGood: "tools",
    inputPerCycle: 1,
    outputPerCycle: 1,
    ticksPerCycle: 20,
  },
  mine: {
    workerSlots: 2,
    outputGood: "stone",
    outputPerCycle: 1,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    terrainReq: "stone",
  },
  // Phase 4: siege structures
  wall: {
    workerSlots: 0,
    isWall: true,
    isRoad: false,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  gate: {
    workerSlots: 0,
    isGate: true,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  tower: {
    workerSlots: 1,
    ticksPerCycle: 20,
    defenseStrength: 5,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  garrison: {
    workerSlots: 4,
    isGarrison: true,
    ticksPerCycle: 20,
    defenseStrength: 10,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  keep: {
    workerSlots: 2,
    isKeep: true,
    ticksPerCycle: 20,
    defenseStrength: 8,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  // Citadel 29 (MP): the town-hall is each player's anchor — placed at match
  // start on an unclaimed tile, NOT tier-locked (so it's the first building).
  // Reuses the keep's anchor semantics (sets keepPosition; sacking it ends the
  // player's run — the elimination point consumed by brief 32).
  "town-hall": {
    workerSlots: 0,
    isKeep: true,
    ticksPerCycle: 20,
    defenseStrength: 8,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  // Phase 4.5: hazard mitigation buildings
  well: {
    workerSlots: 0,
    isWell: true,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
  healer: {
    workerSlots: 1,
    isHealer: true,
    ticksPerCycle: 20,
    inputPerCycle: 0,
    outputPerCycle: 0,
  },
};

export function getProductionDef(type: string): BuildingProductionDef | undefined {
  return PRODUCTION_DEFS[type];
}

// ---------------------------------------------------------------------------
// Citadel 08: building upgrades (level 1 → 3, material-cost, tier-gated)
// ---------------------------------------------------------------------------

/** Buildings upgrade L1 → L2 → L3. */
export const BUILDING_MAX_LEVEL = 3;

/**
 * Settlement tier (by name) required to upgrade INTO a given level.
 * Kept as plain strings here — building.ts must NOT import tiers.ts
 * (tiers.ts already imports getProductionDef from this module; importing
 * back would create a cycle). The call site converts to SettlementTier.
 *
 * L2 = Village, L3 = Town.
 */
export function tierNameRequiredForLevel(level: 2 | 3): "Village" | "Town" {
  return level === 2 ? "Village" : "Town";
}

/**
 * Material cost (drawn from the global stockpile) to upgrade INTO `toLevel`.
 * Rising cost gives the refining chain (planks/stone/tools) a demand sink:
 *   L2 = { planks: 4, stone: 4 }
 *   L3 = { planks: 8, stone: 6, tools: 2 }
 * Cost is uniform across building types this round (tunable per-type later).
 */
export function upgradeCost(_type: string, toLevel: number): Partial<Record<GoodType, number>> {
  if (toLevel === 2) return { planks: 4, stone: 4 };
  if (toLevel === 3) return { planks: 8, stone: 6, tools: 2 };
  return {};
}

/** Output multiplier per level: L1=1, L2=1.5, L3=2 (floored at the call site). */
function outputMultiplierForLevel(level: number): number {
  if (level >= 3) return 2;
  if (level === 2) return 1.5;
  return 1;
}

/** Effective per-cycle output for a building at `level` (floored). */
export function effectiveOutputPerCycle(def: BuildingProductionDef, level: number): number {
  return Math.floor(def.outputPerCycle * outputMultiplierForLevel(level));
}

/** Effective housing capacity for a housing building at `level` (+3 per level above 1). */
export function effectiveHousingCapacity(def: BuildingProductionDef, level: number): number {
  if (def.isHousing !== true || def.housingCapacity === undefined) return 0;
  return def.housingCapacity + (level - 1) * 3;
}

/**
 * Effective defense strength for a building at `level`.
 * CAPPED / gentle additive curve (+2 per level above 1) — NOT multiplicative —
 * so upgrading towers/keeps does not trivialize the siege layer.
 */
export function effectiveDefenseStrength(def: BuildingProductionDef, level: number): number {
  if (def.defenseStrength === undefined) return 0;
  return def.defenseStrength + (level - 1) * 2;
}
