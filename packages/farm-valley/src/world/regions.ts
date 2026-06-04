export type RegionId =
  | 'village' | 'farm-cora' | 'farm-atticus' | 'farm-hannah' | 'farm-otto'
  | 'farm-pip'                         // Player-controlled farmer's farm (far east)
  | 'blacksmith' | 'carpentry'
  | 'forest-north' | 'quarry-north'   // North pair — NE quadrant
  | 'forest-south' | 'quarry-south'   // South pair — SW quadrant
  | 'mill'                            // Grain mill — south road between village & Hannah
  | 'well-north' | 'well-south'       // Irrigation wells near quarries
  | 'mushroom-grove'                  // Seasonal zone (autumn-only field work) — SE gap
  | 'ice-pond'                        // Seasonal zone (winter-only field work) — NW gap
  | 'fishing-isle';                   // Sand island you fish from (any ocean edge) — S of mill

export type RegionKind = 'village' | 'farm';

export interface RegionDef {
  id: RegionId;
  kind: RegionKind;
  ownerId?: number | undefined; // farmer entity id for farms; undefined for village
  bounds: { minX: number; minY: number; maxX: number; maxY: number }; // inclusive
  center: { x: number; y: number };
}

// Archipelago layout (88×80). Every zone is an isolated island surrounded by
// ocean on all sides; islands NEVER touch (≥1 tile of water between any two
// region bodies) and are connected ONLY by 2-tile-wide bridges (the ROADS
// below, which only ever span water). The village sits dead-center as the hub
// most bridges radiate from; Pip's farm is the top island; the four AI farms
// occupy the four corners to maximise travel.
//
// The renderer is already island-aware: backdropFrame paints every non-walkable
// tile as ocean, computeShores adds foam on land-bordering-ocean, and
// computeBridges decks any road-only tile touching ocean. So this layout drives
// the whole archipelago purely from these bounds + ROADS.
//
//   C(NW)     forest-N     P(top)      quarry-N    A(NE)
//   mushroom  carpentry    VILLAGE     blacksmith  ice-pond   (mid band rows 34-45)
//   O(SW)     forest-S     mill        quarry-S    H(SE)
//                          fishing-isle (sand, S of mill rows 68-75; bubbles ring it)
export const WORLD_WIDTH = 88;
export const WORLD_HEIGHT = 80;

// ── Farm islands (12×12) ─────────────────────────────────────────────────────
const FARM_PIP_BOUNDS      = { minX: 38, minY:  2, maxX: 49, maxY: 13 }; // Top-center (player)
const FARM_CORA_BOUNDS     = { minX:  2, minY:  2, maxX: 13, maxY: 13 }; // NW corner
const FARM_ATTICUS_BOUNDS  = { minX: 74, minY:  2, maxX: 85, maxY: 13 }; // NE corner
const FARM_OTTO_BOUNDS     = { minX:  2, minY: 54, maxX: 13, maxY: 65 }; // SW corner
const FARM_HANNAH_BOUNDS   = { minX: 74, minY: 54, maxX: 85, maxY: 65 }; // SE corner

// ── Village hub (12×12) + craft islands flanking it (10×10) ──────────────────
const VILLAGE_BOUNDS       = { minX: 38, minY: 34, maxX: 49, maxY: 45 }; // center hub
const CARPENTRY_BOUNDS     = { minX: 20, minY: 34, maxX: 29, maxY: 43 }; // W of village
const BLACKSMITH_BOUNDS    = { minX: 58, minY: 34, maxX: 67, maxY: 43 }; // E of village

// ── Resource zones (8×8) ─────────────────────────────────────────────────────
const FOREST_NORTH_BOUNDS  = { minX: 22, minY:  4, maxX: 29, maxY: 11 };
const QUARRY_NORTH_BOUNDS  = { minX: 58, minY:  4, maxX: 65, maxY: 11 };
const FOREST_SOUTH_BOUNDS  = { minX: 22, minY: 56, maxX: 29, maxY: 63 };
const QUARRY_SOUTH_BOUNDS  = { minX: 58, minY: 56, maxX: 65, maxY: 63 };

// ── Mill (south of village) + wells (near the quarries) ──────────────────────
const MILL_BOUNDS          = { minX: 39, minY: 56, maxX: 48, maxY: 63 };
const WELL_NORTH_BOUNDS    = { minX: 69, minY:  6, maxX: 70, maxY:  7 }; // 2×2
const WELL_SOUTH_BOUNDS    = { minX: 69, minY: 58, maxX: 70, maxY: 59 }; // 2×2

// ── Seasonal zones ───────────────────────────────────────────────────────────
const MUSHROOM_GROVE_BOUNDS = { minX:  6, minY: 34, maxX: 13, maxY: 41 }; // far W — autumn
const ICE_POND_BOUNDS      = { minX: 74, minY: 34, maxX: 81, maxY: 41 }; // far E — winter

// ── Fishing isle (8×8 sand island in open ocean, S of the mill) ───────────────
// A dedicated sand island you travel to and fish from: stand on any edge tile,
// face the surrounding ocean, and cast. Bubble spots drift in the ring of ocean
// around it (see BubbleSystem) and grant rarer fish.
const FISHING_ISLE_BOUNDS  = { minX: 40, minY: 68, maxX: 47, maxY: 75 };

function midpoint(bounds: { minX: number; minY: number; maxX: number; maxY: number }): { x: number; y: number } {
  return {
    x: Math.floor((bounds.minX + bounds.maxX) / 2),
    y: Math.floor((bounds.minY + bounds.maxY) / 2),
  };
}

export const REGIONS: readonly RegionDef[] = [
  { id: 'village',        kind: 'village', bounds: VILLAGE_BOUNDS,         center: midpoint(VILLAGE_BOUNDS) },
  { id: 'farm-cora',      kind: 'farm',    bounds: FARM_CORA_BOUNDS,       center: midpoint(FARM_CORA_BOUNDS) },
  { id: 'farm-atticus',   kind: 'farm',    bounds: FARM_ATTICUS_BOUNDS,    center: midpoint(FARM_ATTICUS_BOUNDS) },
  { id: 'farm-hannah',    kind: 'farm',    bounds: FARM_HANNAH_BOUNDS,     center: midpoint(FARM_HANNAH_BOUNDS) },
  { id: 'farm-otto',      kind: 'farm',    bounds: FARM_OTTO_BOUNDS,       center: midpoint(FARM_OTTO_BOUNDS) },
  { id: 'farm-pip',       kind: 'farm',    bounds: FARM_PIP_BOUNDS,        center: midpoint(FARM_PIP_BOUNDS) },
  { id: 'blacksmith',     kind: 'village', bounds: BLACKSMITH_BOUNDS,      center: midpoint(BLACKSMITH_BOUNDS) },
  { id: 'carpentry',      kind: 'village', bounds: CARPENTRY_BOUNDS,       center: midpoint(CARPENTRY_BOUNDS) },
  { id: 'forest-north',   kind: 'village', bounds: FOREST_NORTH_BOUNDS,    center: midpoint(FOREST_NORTH_BOUNDS) },
  { id: 'quarry-north',   kind: 'village', bounds: QUARRY_NORTH_BOUNDS,    center: midpoint(QUARRY_NORTH_BOUNDS) },
  { id: 'forest-south',   kind: 'village', bounds: FOREST_SOUTH_BOUNDS,    center: midpoint(FOREST_SOUTH_BOUNDS) },
  { id: 'quarry-south',   kind: 'village', bounds: QUARRY_SOUTH_BOUNDS,    center: midpoint(QUARRY_SOUTH_BOUNDS) },
  { id: 'mill',           kind: 'village', bounds: MILL_BOUNDS,            center: midpoint(MILL_BOUNDS) },
  { id: 'well-north',     kind: 'village', bounds: WELL_NORTH_BOUNDS,      center: midpoint(WELL_NORTH_BOUNDS) },
  { id: 'well-south',     kind: 'village', bounds: WELL_SOUTH_BOUNDS,      center: midpoint(WELL_SOUTH_BOUNDS) },
  { id: 'mushroom-grove', kind: 'village', bounds: MUSHROOM_GROVE_BOUNDS,  center: midpoint(MUSHROOM_GROVE_BOUNDS) },
  { id: 'ice-pond',       kind: 'village', bounds: ICE_POND_BOUNDS,        center: midpoint(ICE_POND_BOUNDS) },
  { id: 'fishing-isle',   kind: 'village', bounds: FISHING_ISLE_BOUNDS,    center: midpoint(FISHING_ISLE_BOUNDS) },
];

// ── Road corridors ────────────────────────────────────────────────────────────
interface RoadDef {
  minX: number; minY: number; maxX: number; maxY: number;
}

// Every entry is a 2-tile-wide bridge that spans ONLY water (it touches no land
// except the two island edges it joins). Together they form a tree rooted at the
// village: village → {carpentry, blacksmith, Pip, mill}; carpentry → the west
// chain (mushroom-grove, forest-north, forest-south); blacksmith → the east
// chain (ice-pond, quarry-north, quarry-south); each corner farm + each well
// hangs off its nearest resource island. Verified: no island-to-island
// adjacency and full BFS connectivity from the village center (walkable-grid
// test asserts both).
const ROADS: readonly RoadDef[] = [
  // ── Village hub spokes ──
  { minX: 30, minY: 38, maxX: 37, maxY: 39 }, // village ↔ carpentry
  { minX: 50, minY: 38, maxX: 57, maxY: 39 }, // village ↔ blacksmith
  { minX: 42, minY: 14, maxX: 43, maxY: 33 }, // village ↔ Pip (top)
  { minX: 42, minY: 46, maxX: 43, maxY: 55 }, // village ↔ mill

  // ── West chain (off carpentry) ──
  { minX: 14, minY: 37, maxX: 19, maxY: 38 }, // carpentry ↔ mushroom-grove
  { minX: 24, minY: 12, maxX: 25, maxY: 33 }, // carpentry ↔ forest-north
  { minX: 24, minY: 44, maxX: 25, maxY: 55 }, // carpentry ↔ forest-south

  // ── East chain (off blacksmith) ──
  { minX: 68, minY: 37, maxX: 73, maxY: 38 }, // blacksmith ↔ ice-pond
  { minX: 60, minY: 12, maxX: 61, maxY: 33 }, // blacksmith ↔ quarry-north
  { minX: 60, minY: 44, maxX: 61, maxY: 55 }, // blacksmith ↔ quarry-south

  // ── Corner farms hang off the nearest resource island ──
  { minX: 14, minY:  6, maxX: 21, maxY:  7 }, // Cora ↔ forest-north
  { minX: 66, minY:  6, maxX: 73, maxY:  7 }, // Atticus ↔ quarry-north
  { minX: 14, minY: 59, maxX: 21, maxY: 60 }, // Otto ↔ forest-south
  { minX: 66, minY: 59, maxX: 73, maxY: 60 }, // Hannah ↔ quarry-south

  // ── Wells (stub off the adjacent quarry) ──
  { minX: 66, minY:  6, maxX: 68, maxY:  7 }, // well-north ↔ quarry-north
  { minX: 66, minY: 58, maxX: 68, maxY: 59 }, // well-south ↔ quarry-south

  // ── Fishing isle (hangs off the mill, due south) ──
  { minX: 42, minY: 64, maxX: 43, maxY: 67 }, // mill ↔ fishing-isle
];

// Town square: inner 4×4 of village (auction podium + notice board markers)
export const TOWN_SQUARE = { minX: 42, minY: 38, maxX: 45, maxY: 41 };

// Auction podium tile: dead center of the town square — where agents gather for CFP
export const AUCTION_PODIUM_TILE = { x: 43, y: 39 } as const;

// Notice board tile: west edge of town square
export const NOTICE_BOARD_TILE = { x: 42, y: 39 } as const;

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
