export type RegionId =
  | 'village' | 'farm-cora' | 'farm-atticus' | 'farm-hannah' | 'farm-otto'
  | 'farm-pip'                         // Player-controlled farmer's farm (far east)
  | 'blacksmith' | 'carpentry'
  | 'forest-north' | 'quarry-north'   // North pair — NE quadrant
  | 'forest-south' | 'quarry-south'   // South pair — SW quadrant
  | 'mill'                            // Grain mill — south road between village & Hannah
  | 'well-north' | 'well-south'       // Irrigation wells near quarries
  | 'mushroom-grove'                  // Seasonal zone (autumn-only field work) — SE gap
  | 'ice-pond';                       // Seasonal zone (winter-only field work) — NW gap

export type RegionKind = 'village' | 'farm';

export interface RegionDef {
  id: RegionId;
  kind: RegionKind;
  ownerId?: number | undefined; // farmer entity id for farms; undefined for village
  bounds: { minX: number; minY: number; maxX: number; maxY: number }; // inclusive
  center: { x: number; y: number };
}

// World widened east 40 → 52 (brief: add a 5th, player-controlled farm). The
// original square (cols 0-39) is untouched on the west/center/south; everything
// from the East farm rightward is shifted +12 cols, opening a far-east column
// (cols 40-51) for Pip's farm. Height is unchanged.
export const WORLD_WIDTH = 52;
export const WORLD_HEIGHT = 40;

/** Cols added on the east; east-cluster regions/roads shift by this amount. */
const EAST_SHIFT = 12;

// ── Core region bounds (inclusive) ──────────────────────────────────────────
const VILLAGE_BOUNDS       = { minX: 14, minY: 14, maxX: 25, maxY: 25 };
const FARM_CORA_BOUNDS     = { minX: 14, minY:  0, maxX: 25, maxY: 11 }; // North
const FARM_ATTICUS_BOUNDS  = { minX: 40, minY: 14, maxX: 51, maxY: 25 }; // East (shifted +12)
const FARM_HANNAH_BOUNDS   = { minX: 14, minY: 28, maxX: 25, maxY: 39 }; // South
const FARM_OTTO_BOUNDS     = { minX:  0, minY: 14, maxX: 11, maxY: 25 }; // West
// Pip (player): occupies the column the East farm used to sit in (28-39), now a
// free 12×12 block between the village's east road and Atticus's new position.
const FARM_PIP_BOUNDS      = { minX: 28, minY: 14, maxX: 39, maxY: 25 }; // East-center

// ── Special buildings ────────────────────────────────────────────────────────
// Blacksmith: isolated SE corner, reachable via L-bridge from east road (+12).
const BLACKSMITH_BOUNDS    = { minX: 42, minY: 30, maxX: 51, maxY: 39 };
// Carpentry: NW corner, reachable via path from north road.
const CARPENTRY_BOUNDS     = { minX:  0, minY:  0, maxX:  9, maxY:  9 };

// ── Resource zones ─────────────────────────────────────────────────────────
const FOREST_NORTH_BOUNDS  = { minX: 38, minY:  0, maxX: 45, maxY:  7 }; // 8×8 (+12)
const QUARRY_NORTH_BOUNDS  = { minX: 47, minY:  0, maxX: 51, maxY:  9 }; // 5×10 (+12)
const FOREST_SOUTH_BOUNDS  = { minX:  0, minY: 26, maxX:  7, maxY: 33 }; // 8×8
const QUARRY_SOUTH_BOUNDS  = { minX:  0, minY: 35, maxX:  9, maxY: 39 }; // 10×5

// ── New zones ─────────────────────────────────────────────────────────────────
//
// Mill: 6×5 zone south of village, on the south road gap (between village bottom
// row 26 and Hannah top row 28). Reachable via the south road.
//
// Wells: 2×2 pads adjacent to the quarries, giving agents an irrigation-refill
// destination that is structurally closer than heading home.
//   well-north — east of quarry-north road, row 11-12
//   well-south — below quarry-south road, col 11-12
//
// Mushroom grove (seasonal): 6×3 zone in the SE gap between the blacksmith L-bridge
// and Hannah. Autumn only for field-work intent. Year-round walkable (agents pass
// through freely; the seasonal lock is enforced by agent behaviour, not pathfinding).
//
// Ice pond (seasonal): 4×4 zone in the NW gap above carpentry and left of Cora road.
// Winter only for field-work intent.
//
// Updated world map (40×40):
//
//    0         1         2         3
//    0123456789012345678901234567890123456789
//  0 WWWWWWWWWW iiii CCCCCCCCCCCCFFFFFFFFxQQQQQ
//  3 WWWWWWWWWW iiii
//  7 WWWWWWWWWW....CCCCCCCCCCCCFFFFFFFFxQQQQQ
//  8                            pp         QQ
// 10           pp  CCCCCCCCCCCC pp   ww    QQ
// 11                                ww
// 12           pppppppppppp              pppp
// 13                        pppppppppppppp
// 14 OOOO...   VVVVVVVVVVVV    AAAAAAAAAAAA
// 25 OOOO...   VVVVVVVVVVVV    AAAAAAAAAAAA
// 26 ffff pp   pp (south road)  pp
// 27           MM MMMM                 mmmmmm
// 31           MM MMMM
// 33 ffff                             mmmmmm
// 34      ww
// 35 qqqq pp HH........HH
// 36      ww
// 39 qqqq    HH........HH
//
// M = mill (6×5, col 14-19, row 27-31)
// i = ice-pond (4×4, col 10-13, row 0-3) — winter seasonal
// m = mushroom-grove (6×3, col 28-33, row 27-29) — autumn seasonal
// ww (north) = well-north (2×2, col 37-38, row 11-12)
// ww (south) = well-south (2×2, col 11-12, row 34-35) — but quarry-south is 0-9,35-39
//              adjusted: col 10-11, row 34-35 (just east of quarry-south bottom)

const MILL_BOUNDS          = { minX: 14, minY: 27, maxX: 19, maxY: 31 }; // 6×5
const WELL_NORTH_BOUNDS    = { minX: 49, minY: 11, maxX: 50, maxY: 12 }; // 2×2 (+12)
const WELL_SOUTH_BOUNDS    = { minX: 10, minY: 34, maxX: 11, maxY: 35 }; // 2×2
const MUSHROOM_GROVE_BOUNDS = { minX: 40, minY: 27, maxX: 45, maxY: 29 }; // 6×3 (+12)
const ICE_POND_BOUNDS      = { minX: 10, minY:  0, maxX: 13, maxY:  3 }; // 4×4

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
];

// ── Road corridors ────────────────────────────────────────────────────────────
interface RoadDef {
  minX: number; minY: number; maxX: number; maxY: number;
}

const ROADS: readonly RoadDef[] = [
  // Farm ↔ village roads (2 tiles wide)
  { minX: 18, minY: 12, maxX: 21, maxY: 13 }, // North road  (Cora ↔ Village)
  { minX: 26, minY: 18, maxX: 27, maxY: 21 }, // East road   (Pip ↔ Village)
  { minX: 18, minY: 26, maxX: 21, maxY: 27 }, // South road  (Hannah ↔ Village)
  { minX: 12, minY: 18, maxX: 13, maxY: 21 }, // West road   (Otto ↔ Village)

  // Pip ↔ Atticus connector: Pip's east edge (col 39) abuts Atticus's west edge
  // (col 40). A 2-tile-tall bridge at rows 18-21 keeps the two east farms linked
  // so Atticus (and everyone) can still reach the village via Pip's east road.
  { minX: 38, minY: 18, maxX: 41, maxY: 21 }, // Pip ↔ Atticus bridge

  // Blacksmith L-bridge: south from Atticus's SE, hook east into forge (+12)
  { minX: 38, minY: 22, maxX: 39, maxY: 29 }, // vertical leg
  { minX: 38, minY: 28, maxX: 42, maxY: 29 }, // horizontal leg

  // Carpentry: west from north road, south into workshop
  { minX: 10, minY: 12, maxX: 17, maxY: 13 }, // horizontal connector
  { minX: 10, minY:  9, maxX: 11, maxY: 13 }, // vertical connector

  // Forest North connector: south edge (row 8) → merge into north road (+12)
  { minX: 38, minY:  8, maxX: 39, maxY: 13 }, // vertical: Forest N bottom → Atticus top border
  { minX: 38, minY: 13, maxX: 40, maxY: 14 }, // horizontal: join Atticus top-left

  // Quarry North connector: south edge (row 10) → Atticus top edge (row 14) (+12)
  { minX: 47, minY: 10, maxX: 48, maxY: 13 }, // vertical: Quarry N bottom → row 13
  { minX: 40, minY: 13, maxX: 46, maxY: 14 }, // horizontal: west to Atticus top-left

  // Forest South connector: east edge (col 8) → Otto south border (row 25-26)
  { minX:  8, minY: 25, maxX:  9, maxY: 26 }, // 1-step bridge joining Otto bottom to forest

  // Quarry South connector: east edge (col 10) → Hannah west border
  { minX: 10, minY: 35, maxX: 13, maxY: 36 }, // horizontal: Quarry S right → col 14 (Hannah left)

  // Mill connector: spur from mill south edge (row 32) down to Hannah north road
  { minX: 18, minY: 27, maxX: 19, maxY: 32 }, // vertical spur — south road → mill bottom

  // Well-north connector: south stub from quarry-north road to the well pad (+12)
  { minX: 49, minY: 10, maxX: 50, maxY: 11 }, // vertical: quarry road → well pad

  // Well-south connector: east stub from quarry-south road to the well pad
  { minX: 10, minY: 35, maxX: 11, maxY: 35 }, // (shares tile with quarry-south connector)

  // Mushroom grove connector: west stub from blacksmith L-bridge vertical leg (+12)
  { minX: 40, minY: 28, maxX: 41, maxY: 29 }, // 2-tile bridge into grove west edge

  // Ice pond connector: south stub from carpentry east edge into pond south
  { minX: 10, minY:  4, maxX: 11, maxY:  9 }, // vertical: pond bottom → carpentry north
];

// Town square: inner 4×4 of village (auction podium + notice board markers)
export const TOWN_SQUARE = { minX: 18, minY: 18, maxX: 21, maxY: 21 };

// Auction podium tile: dead center of the town square — where agents gather for CFP
export const AUCTION_PODIUM_TILE = { x: 19, y: 19 } as const;

// Notice board tile: west edge of town square
export const NOTICE_BOARD_TILE = { x: 17, y: 19 } as const;

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
