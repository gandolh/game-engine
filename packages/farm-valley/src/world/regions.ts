export type RegionId =
  | 'village' | 'farm-cora' | 'farm-atticus' | 'farm-hannah' | 'farm-otto'
  | 'blacksmith' | 'carpentry'
  | 'forest-north' | 'quarry-north'   // North pair — NE quadrant
  | 'forest-south' | 'quarry-south';  // South pair — SW quadrant

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

// ── Core region bounds (inclusive) ──────────────────────────────────────────
const VILLAGE_BOUNDS       = { minX: 14, minY: 14, maxX: 25, maxY: 25 };
const FARM_CORA_BOUNDS     = { minX: 14, minY:  0, maxX: 25, maxY: 11 }; // North
const FARM_ATTICUS_BOUNDS  = { minX: 28, minY: 14, maxX: 39, maxY: 25 }; // East
const FARM_HANNAH_BOUNDS   = { minX: 14, minY: 28, maxX: 25, maxY: 39 }; // South
const FARM_OTTO_BOUNDS     = { minX:  0, minY: 14, maxX: 11, maxY: 25 }; // West

// ── Special buildings ────────────────────────────────────────────────────────
// Blacksmith: isolated SE corner, reachable via L-bridge from east road.
const BLACKSMITH_BOUNDS    = { minX: 30, minY: 30, maxX: 39, maxY: 39 };
// Carpentry: NW corner, reachable via path from north road.
const CARPENTRY_BOUNDS     = { minX:  0, minY:  0, maxX:  9, maxY:  9 };

// ── Resource zones ────────────────────────────────────────────────────────────
//
// World map (40×40) with all regions:
//
//    0         1         2         3
//    0123456789012345678901234567890123456789
//  0 WWWWWWWWWW....CCCCCCCCCCCCFFFFFFFFxQQQQQ
//  7 WWWWWWWWWW....CCCCCCCCCCCCFFFFFFFF QQQQQ
//  8                            pp         QQ
// 10           pp  CCCCCCCCCCCC pp         QQ
// 12           pppppppppppp              pppp
// 13                        pppppppppppppp
// 14 OOOO...   VVVVVVVVVVVV    AAAAAAAAAAAA
// 25 OOOO...   VVVVVVVVVVVV    AAAAAAAAAAAA
// 26 ffff pp                pp
// 33 ffff
// 34
// 35 qqqq pp HH........HH
// 39 qqqq    HH........HH
//
// F = forest-north  (8×8, NE, trees only)    connected south → N road
// Q = quarry-north  (5×10, far NE, stones)   connected south → Atticus top
// f = forest-south  (8×8, SW, trees only)    connected east  → Otto bottom
// q = quarry-south  (10×5, far SW, stones)   connected east  → Hannah left
//
// Each zone is BFS-reachable from every farm (verified).
// North pair (F+Q) serves Cora (N) and Atticus (E).
// South pair (f+q) serves Otto (W) and Hannah (S).

const FOREST_NORTH_BOUNDS  = { minX: 26, minY:  0, maxX: 33, maxY:  7 }; // 8×8
const QUARRY_NORTH_BOUNDS  = { minX: 35, minY:  0, maxX: 39, maxY:  9 }; // 5×10
const FOREST_SOUTH_BOUNDS  = { minX:  0, minY: 26, maxX:  7, maxY: 33 }; // 8×8
const QUARRY_SOUTH_BOUNDS  = { minX:  0, minY: 35, maxX:  9, maxY: 39 }; // 10×5

function midpoint(bounds: { minX: number; minY: number; maxX: number; maxY: number }): { x: number; y: number } {
  return {
    x: Math.floor((bounds.minX + bounds.maxX) / 2),
    y: Math.floor((bounds.minY + bounds.maxY) / 2),
  };
}

export const REGIONS: readonly RegionDef[] = [
  { id: 'village',      kind: 'village', bounds: VILLAGE_BOUNDS,      center: midpoint(VILLAGE_BOUNDS) },
  { id: 'farm-cora',    kind: 'farm',    bounds: FARM_CORA_BOUNDS,    center: midpoint(FARM_CORA_BOUNDS) },
  { id: 'farm-atticus', kind: 'farm',    bounds: FARM_ATTICUS_BOUNDS, center: midpoint(FARM_ATTICUS_BOUNDS) },
  { id: 'farm-hannah',  kind: 'farm',    bounds: FARM_HANNAH_BOUNDS,  center: midpoint(FARM_HANNAH_BOUNDS) },
  { id: 'farm-otto',    kind: 'farm',    bounds: FARM_OTTO_BOUNDS,    center: midpoint(FARM_OTTO_BOUNDS) },
  { id: 'blacksmith',   kind: 'village', bounds: BLACKSMITH_BOUNDS,   center: midpoint(BLACKSMITH_BOUNDS) },
  { id: 'carpentry',    kind: 'village', bounds: CARPENTRY_BOUNDS,    center: midpoint(CARPENTRY_BOUNDS) },
  { id: 'forest-north', kind: 'village', bounds: FOREST_NORTH_BOUNDS, center: midpoint(FOREST_NORTH_BOUNDS) },
  { id: 'quarry-north', kind: 'village', bounds: QUARRY_NORTH_BOUNDS, center: midpoint(QUARRY_NORTH_BOUNDS) },
  { id: 'forest-south', kind: 'village', bounds: FOREST_SOUTH_BOUNDS, center: midpoint(FOREST_SOUTH_BOUNDS) },
  { id: 'quarry-south', kind: 'village', bounds: QUARRY_SOUTH_BOUNDS, center: midpoint(QUARRY_SOUTH_BOUNDS) },
];

// ── Road corridors ────────────────────────────────────────────────────────────
interface RoadDef {
  minX: number; minY: number; maxX: number; maxY: number;
}

const ROADS: readonly RoadDef[] = [
  // Farm ↔ village roads (2 tiles wide)
  { minX: 18, minY: 12, maxX: 21, maxY: 13 }, // North road  (Cora ↔ Village)
  { minX: 26, minY: 18, maxX: 27, maxY: 21 }, // East road   (Atticus ↔ Village)
  { minX: 18, minY: 26, maxX: 21, maxY: 27 }, // South road  (Hannah ↔ Village)
  { minX: 12, minY: 18, maxX: 13, maxY: 21 }, // West road   (Otto ↔ Village)

  // Blacksmith L-bridge: south from east road, hook east into forge
  { minX: 26, minY: 22, maxX: 27, maxY: 29 }, // vertical leg
  { minX: 26, minY: 28, maxX: 29, maxY: 29 }, // horizontal leg

  // Carpentry: west from north road, south into workshop
  { minX: 10, minY: 12, maxX: 17, maxY: 13 }, // horizontal connector
  { minX: 10, minY: 10, maxX: 11, maxY: 13 }, // vertical connector

  // Forest North connector: south edge (row 8) → merge into north road
  { minX: 26, minY:  8, maxX: 27, maxY: 11 }, // vertical: Forest N bottom → Cora top border
  { minX: 22, minY: 11, maxX: 25, maxY: 12 }, // horizontal: join north road at col 22-25

  // Quarry North connector: south edge (row 10) → Atticus top edge (row 14)
  { minX: 35, minY: 10, maxX: 36, maxY: 13 }, // vertical: Quarry N bottom → row 13
  { minX: 28, minY: 13, maxX: 34, maxY: 14 }, // horizontal: west to Atticus top-left

  // Forest South connector: east edge (col 8) → Otto south border (row 25-26)
  { minX:  8, minY: 25, maxX:  9, maxY: 26 }, // 1-step bridge joining Otto bottom to forest

  // Quarry South connector: east edge (col 10) → Hannah west border
  { minX: 10, minY: 35, maxX: 13, maxY: 36 }, // horizontal: Quarry S right → col 14 (Hannah left)
];

// Town square: inner 4×4 of village (gets decorative market floor)
export const TOWN_SQUARE = { minX: 18, minY: 18, maxX: 21, maxY: 21 };

function inBounds(
  x: number,
  y: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/**
 * Returns the RegionId for a tile coordinate, or null for void/road-only tiles.
 */
export function regionAt(x: number, y: number): RegionId | null {
  for (const region of REGIONS) {
    if (inBounds(x, y, region.bounds)) return region.id;
  }
  return null;
}

/**
 * Returns true if the tile is walkable — inside a region or on a road.
 */
export function isWalkable(x: number, y: number): boolean {
  if (regionAt(x, y) !== null) return true;
  for (const road of ROADS) {
    if (inBounds(x, y, road)) return true;
  }
  return false;
}

/** Get a region definition by id. Throws if not found. */
export function getRegion(id: RegionId): RegionDef {
  const region = REGIONS.find((r) => r.id === id);
  if (!region) throw new Error(`getRegion: unknown region id '${id}'`);
  return region;
}

export { ROADS };
export type { RoadDef };
