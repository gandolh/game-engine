/**
 * Building ECS component + entity shape for Citadel.
 *
 * Each placed building is a single ECS entity with a `building` component.
 * The component records the building's type, tile origin, and footprint dims.
 */
import type { EngineEntity } from "@engine/core";

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
};

export function getBuildingDef(type: string): BuildingDef | undefined {
  return BUILDING_DEFS[type];
}
