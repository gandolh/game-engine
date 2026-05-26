export type RegionId = 'village' | 'farm-cora' | 'farm-atticus' | 'farm-hannah' | 'farm-otto';
export type RegionKind = 'village' | 'farm';

export interface RegionDef {
  id: RegionId;
  kind: RegionKind;
  ownerId?: number | undefined; // farmer entity id for farms; undefined for village
  bounds: { minX: number; minY: number; maxX: number; maxY: number }; // inclusive
  center: { x: number; y: number };
}

// Layout constants
export const FARM_SIZE = 12;    // 12×12 tiles per farm
export const VILLAGE_SIZE = 12; // 12×12 village
export const ROAD_LEN = 4;      // tiles of road between farm edge and village edge
export const ROAD_WIDTH = 2;

export const WORLD_WIDTH = 40;
export const WORLD_HEIGHT = 40;

// Region bounds (inclusive)
const VILLAGE_BOUNDS = { minX: 14, minY: 14, maxX: 25, maxY: 25 };
const FARM_CORA_BOUNDS = { minX: 14, minY: 0, maxX: 25, maxY: 11 };   // North
const FARM_ATTICUS_BOUNDS = { minX: 28, minY: 14, maxX: 39, maxY: 25 }; // East
const FARM_HANNAH_BOUNDS = { minX: 14, minY: 28, maxX: 25, maxY: 39 }; // South
const FARM_OTTO_BOUNDS = { minX: 0, minY: 14, maxX: 11, maxY: 25 };   // West

function midpoint(bounds: { minX: number; minY: number; maxX: number; maxY: number }): { x: number; y: number } {
  return {
    x: Math.floor((bounds.minX + bounds.maxX) / 2),
    y: Math.floor((bounds.minY + bounds.maxY) / 2),
  };
}

export const REGIONS: readonly RegionDef[] = [
  {
    id: 'village',
    kind: 'village',
    bounds: VILLAGE_BOUNDS,
    center: midpoint(VILLAGE_BOUNDS),
  },
  {
    id: 'farm-cora',
    kind: 'farm',
    bounds: FARM_CORA_BOUNDS,
    center: midpoint(FARM_CORA_BOUNDS),
  },
  {
    id: 'farm-atticus',
    kind: 'farm',
    bounds: FARM_ATTICUS_BOUNDS,
    center: midpoint(FARM_ATTICUS_BOUNDS),
  },
  {
    id: 'farm-hannah',
    kind: 'farm',
    bounds: FARM_HANNAH_BOUNDS,
    center: midpoint(FARM_HANNAH_BOUNDS),
  },
  {
    id: 'farm-otto',
    kind: 'farm',
    bounds: FARM_OTTO_BOUNDS,
    center: midpoint(FARM_OTTO_BOUNDS),
  },
];

// Road corridors connecting farms to village
interface RoadDef {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const ROADS: readonly RoadDef[] = [
  { minX: 18, minY: 12, maxX: 21, maxY: 13 }, // North road
  { minX: 26, minY: 18, maxX: 27, maxY: 21 }, // East road
  { minX: 18, minY: 26, maxX: 21, maxY: 27 }, // South road
  { minX: 12, minY: 18, maxX: 13, maxY: 21 }, // West road
];

// Town square: inner 4×4 of village
export const TOWN_SQUARE = { minX: 18, minY: 18, maxX: 21, maxY: 21 };

function inBounds(
  x: number,
  y: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/**
 * Returns the RegionId for a tile coordinate, or null if the tile is void (not inside any region or road).
 * Roads are part of the walkable world but don't belong to any named region — returns null for road-only tiles.
 */
export function regionAt(x: number, y: number): RegionId | null {
  for (const region of REGIONS) {
    if (inBounds(x, y, region.bounds)) {
      return region.id;
    }
  }
  return null;
}

/**
 * Returns true if the tile is walkable — either inside a region or on a road.
 */
export function isWalkable(x: number, y: number): boolean {
  if (regionAt(x, y) !== null) return true;
  for (const road of ROADS) {
    if (inBounds(x, y, road)) return true;
  }
  return false;
}

/**
 * Get a region definition by id. Throws if not found.
 */
export function getRegion(id: RegionId): RegionDef {
  const region = REGIONS.find((r) => r.id === id);
  if (!region) {
    throw new Error(`getRegion: unknown region id '${id}'`);
  }
  return region;
}

// Export roads for use in walkable-grid.ts
export { ROADS };
export type { RoadDef };
