/**
 * Building ECS component + entity shape for Citadel.
 *
 * Each placed building is a single ECS entity with a `building` component.
 * The component records the building's type, tile origin, footprint dims, and
 * (Phase 2) mutable runtime economy state lives in a separate state map.
 */
import type { EngineEntity } from "@engine/core";

/** Goods that flow through the Citadel economy. */
export type GoodType = "grain" | "flour" | "bread" | "wood";

/** Terrain requirements a building may impose on its tiles. */
export type TerrainReq = "forest";

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
};

export function getProductionDef(type: string): BuildingProductionDef | undefined {
  return PRODUCTION_DEFS[type];
}
