import { createRng } from '@engine/core';

/** Hand-authored islands with fixed coordinates. */
export type FixedRegionId =
  | 'village' | 'farm-cora' | 'farm-atticus' | 'farm-hannah' | 'farm-otto'
  | 'farm-pip'                         // Player-controlled farmer's farm
  | 'blacksmith' | 'carpentry'
  | 'forest-north' | 'quarry-north'
  | 'forest-south' | 'quarry-south'
  | 'mill'                            // Grain mill
  | 'well-north' | 'well-south'       // Irrigation wells near quarries
  | 'mushroom-grove'                  // Seasonal zone (autumn-only field work)
  | 'ice-pond'                        // Seasonal zone (winter-only field work)
  | 'fishing-isle'                    // Sand island you fish from
  | 'fishing-isle-2'                  // Second sand fishing island
  | 'harbor'                          // shipping dock + contract board
  | 'shrine'                          // interactive — pray for a bounded AP boost
  | 'heritage-stones'                 // decorative — no behavior
  | 'heritage-ruin'                   // decorative — no behavior
  | 'heritage-statue'                 // decorative — no behavior
  | 'waterfall'                       // decorative — ANIMATED cascade, no behavior
  | 'camp';                           // rest away from home without the unrested penalty

/** Procedurally-generated extra farm islands (the radial outer farms). `farm-0`
 *  .. `farm-(EXTRA_FARM_COUNT-1)`, laid out by {@link makeRadialFarmRegion}. */
export type ExtraFarmRegionId = `farm-${number}`;

export type RegionId = FixedRegionId | ExtraFarmRegionId;

export type RegionKind = 'village' | 'farm';

export interface RegionDef {
  id: RegionId;
  kind: RegionKind;
  ownerId?: number | undefined; // farmer entity id for farms; undefined for village
  bounds: { minX: number; minY: number; maxX: number; maxY: number }; // inclusive
  center: { x: number; y: number };
}

// 160×160 radial archipelago: isolated islands connected only by 2-wide bridges.
// Central cluster (village hub + craft/resource/seasonal/landmark islands) surrounded by
// two concentric rings of 21 farms. The renderer derives ocean/shores/bridges purely from
// these bounds + ROADS.
export const WORLD_WIDTH = 160;
export const WORLD_HEIGHT = 160;

const MAP_CX = 80;
const MAP_CY = 80;

// FIXED seed (not the run seed): world geometry is constant across runs.
// Determinism: a tick depends only on tick count + run rng; world geometry is immutable.
export const WORLD_GEN_SEED = 0x5eed_face;

// Hand-authored bounds packed around (80,80); ≥1 ocean gap between any pair,
// ≥2 for landmarks. Verified: min any-pair gap 1, min landmark gap 2.
const VILLAGE_BOUNDS        = { minX: 75, minY: 75, maxX: 86, maxY: 86 }; // center hub (12×12)
const CARPENTRY_BOUNDS      = { minX: 59, minY: 76, maxX: 68, maxY: 85 }; // W of village (10×10)
const BLACKSMITH_BOUNDS     = { minX: 93, minY: 76, maxX: 102, maxY: 85 }; // E of village (10×10)
const MILL_BOUNDS           = { minX: 76, minY: 93, maxX: 85, maxY: 100 }; // S of village (10×8)

const FOREST_NORTH_BOUNDS   = { minX: 61, minY: 61, maxX: 68, maxY: 68 }; // NW diagonal (8×8)
const QUARRY_NORTH_BOUNDS   = { minX: 93, minY: 61, maxX: 100, maxY: 68 }; // NE diagonal
const FOREST_SOUTH_BOUNDS   = { minX: 61, minY: 93, maxX: 68, maxY: 100 }; // SW diagonal
const QUARRY_SOUTH_BOUNDS   = { minX: 93, minY: 93, maxX: 100, maxY: 100 }; // SE diagonal

const MUSHROOM_GROVE_BOUNDS = { minX: 59, minY: 47, maxX: 66, maxY: 54 }; // N — autumn
const ICE_POND_BOUNDS       = { minX: 95, minY: 47, maxX: 102, maxY: 54 }; // N — winter

const WELL_NORTH_BOUNDS     = { minX: 103, minY: 62, maxX: 104, maxY: 63 }; // 2×2, by quarry-north
const WELL_SOUTH_BOUNDS     = { minX: 103, minY: 94, maxX: 104, maxY: 95 }; // 2×2, by quarry-south

const SHRINE_BOUNDS         = { minX: 71, minY: 58, maxX: 77, maxY: 64 }; // N-center (7×7), interactive
const WATERFALL_BOUNDS      = { minX: 80, minY: 58, maxX: 87, maxY: 65 }; // N-center-E (8×8), ANIMATED

const HERITAGE_STONES_BOUNDS  = { minX: 45, minY: 63, maxX: 52, maxY: 70 }; // W (8×8) decorative
const HERITAGE_RUIN_BOUNDS    = { minX: 109, minY: 63, maxX: 116, maxY: 70 }; // E (8×8) decorative
const HERITAGE_STATUE_BOUNDS  = { minX: 45, minY: 93, maxX: 52, maxY: 100 }; // SW (8×8) decorative

const FISHING_ISLE_BOUNDS   = { minX: 75, minY: 105, maxX: 82, maxY: 112 }; // S-center (8×8 sand)
const FISHING_ISLE_2_BOUNDS = { minX: 59, minY: 105, maxX: 66, maxY: 112 }; // S-W (8×8 sand)
const HARBOR_BOUNDS         = { minX: 93, minY: 105, maxX: 100, maxY: 112 }; // S-E dock (8×8)
const CAMP_BOUNDS           = { minX: 109, minY: 105, maxX: 116, maxY: 112 }; // SE campsite (8×8)

// 21 farms on two concentric rings (R=52 inner n=9, R=72 outer n=12).
// Named farms are 12×12; procedural are 10×10. Min farm-farm gap 7, min cluster-farm gap 3.
// Per-farm jitter (±EXTRA_FARM_JITTER, fixed-seed) makes the frontier organic.
export const EXTRA_FARM_COUNT: number = 16; // 5 named + 16 procedural = 21 farms
const FARM_NAMED_SIZE = 12;
const FARM_PROC_SIZE = 10;

const INNER_RING = { n: 9, r: 52, phi: -Math.PI / 2 };
const OUTER_RING = { n: 12, r: 72, phi: (-90 + 15) * (Math.PI / 180) };

// Jitter bounded at 1: worst-case gap 7 - 2 = 5, well above the ≥2 invariant.
const EXTRA_FARM_JITTER = 1;
const farmJitterRng = createRng(WORLD_GEN_SEED).fork('farm-ring-jitter');
const FARM_JITTER: readonly { dx: number; dy: number }[] = Array.from(
  { length: EXTRA_FARM_COUNT },
  () => ({
    dx: farmJitterRng.int(-EXTRA_FARM_JITTER, EXTRA_FARM_JITTER + 1),
    dy: farmJitterRng.int(-EXTRA_FARM_JITTER, EXTRA_FARM_JITTER + 1),
  }),
);

/** Compute the (un-jittered) bounds of the farm at slot `k` of a ring. */
function ringSlotBounds(
  ring: { n: number; r: number; phi: number },
  k: number,
  size: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const angle = ring.phi + (Math.PI * 2 * k) / ring.n;
  const fcx = Math.round(MAP_CX + ring.r * Math.cos(angle));
  const fcy = Math.round(MAP_CY + ring.r * Math.sin(angle));
  const minX = Math.round(fcx - size / 2);
  const minY = Math.round(fcy - size / 2);
  return { minX, minY, maxX: minX + size - 1, maxY: minY + size - 1 };
}

// Inner-ring even slots 0/2/4/6/8 → named farms.
const NAMED_FARM_SLOT: Record<string, number> = {
  'farm-pip': 0,
  'farm-atticus': 2,
  'farm-hannah': 4,
  'farm-otto': 6,
  'farm-cora': 8,
};
function namedFarmBounds(id: keyof typeof NAMED_FARM_SLOT) {
  return ringSlotBounds(INNER_RING, NAMED_FARM_SLOT[id]!, FARM_NAMED_SIZE);
}

const FARM_PIP_BOUNDS     = namedFarmBounds('farm-pip');
const FARM_ATTICUS_BOUNDS = namedFarmBounds('farm-atticus');
const FARM_HANNAH_BOUNDS  = namedFarmBounds('farm-hannah');
const FARM_OTTO_BOUNDS    = namedFarmBounds('farm-otto');
const FARM_CORA_BOUNDS    = namedFarmBounds('farm-cora');

/** Procedural farm `i`: i=0..3 → inner odd slots; i=4..15 → outer ring. Bounds are jittered by fixed-seed offset. */
function makeRadialFarmRegion(i: number): RegionDef {
  const INNER_PROC_SLOTS = [1, 3, 5, 7];
  let base: { minX: number; minY: number; maxX: number; maxY: number };
  if (i < INNER_PROC_SLOTS.length) {
    base = ringSlotBounds(INNER_RING, INNER_PROC_SLOTS[i]!, FARM_PROC_SIZE);
  } else {
    base = ringSlotBounds(OUTER_RING, i - INNER_PROC_SLOTS.length, FARM_PROC_SIZE);
  }
  const j = FARM_JITTER[i]!;
  const bounds = {
    minX: base.minX + j.dx,
    minY: base.minY + j.dy,
    maxX: base.maxX + j.dx,
    maxY: base.maxY + j.dy,
  };
  return { id: `farm-${i}` as RegionId, kind: 'farm', bounds, center: midpoint(bounds) };
}

const EXTRA_FARM_REGIONS: readonly RegionDef[] = Array.from(
  { length: EXTRA_FARM_COUNT },
  (_unused, i) => makeRadialFarmRegion(i),
);

/** Every fishing-isle region id, so the renderer / fishing logic treat them
 *  uniformly. */
export const FISHING_ISLE_IDS: readonly RegionId[] = ['fishing-isle', 'fishing-isle-2'];

/** The harbor island where shipping contracts are posted. */
export const HARBOR_REGION_ID: RegionId = 'harbor';

/** The interactive shrine island (pray for a bounded AP boost). */
export const SHRINE_REGION_ID: RegionId = 'shrine';

/** The three purely-decorative heritage-site islets (no behavior). */
export const HERITAGE_REGION_IDS: readonly RegionId[] = [
  'heritage-stones',
  'heritage-ruin',
  'heritage-statue',
];

/** The decorative ANIMATED waterfall island (no behavior). */
export const WATERFALL_REGION_ID: RegionId = 'waterfall';

/** The camping islet. A farmer here at nightfall sleeps RESTED (no away-from-home penalty). */
export const CAMP_REGION_ID: RegionId = 'camp';

/** Campfire-overlay anchor tile (cx+2 from island center). Render-loop only; sim/snapshot never reference it. */
export const CAMPFIRE_TILE = { x: 114, y: 108 } as const;

/** Waterfall cascade-overlay anchor tile (center column / top). Render-loop only; sim/snapshot never reference it. */
export const WATERFALL_TILE = { x: 83, y: 59 } as const;

/** The dock tile where a farmer stands to deliver a contract (harbor north
 *  edge center). */
export const HARBOR_DOCK_TILE = { x: 96, y: 105 } as const;

/** The contract board tile within the harbor. */
export const HARBOR_BOARD_TILE = { x: 97, y: 108 } as const;

/** True if a region id is one of the fishing isles. */
export function isFishingIsle(region: RegionId | null): boolean {
  return region === 'fishing-isle' || region === 'fishing-isle-2';
}

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
  { id: 'fishing-isle-2', kind: 'village', bounds: FISHING_ISLE_2_BOUNDS,  center: midpoint(FISHING_ISLE_2_BOUNDS) },
  { id: 'harbor',         kind: 'village', bounds: HARBOR_BOUNDS,          center: midpoint(HARBOR_BOUNDS) },
  { id: 'shrine',         kind: 'village', bounds: SHRINE_BOUNDS,          center: midpoint(SHRINE_BOUNDS) },
  { id: 'heritage-stones', kind: 'village', bounds: HERITAGE_STONES_BOUNDS, center: midpoint(HERITAGE_STONES_BOUNDS) },
  { id: 'heritage-ruin',   kind: 'village', bounds: HERITAGE_RUIN_BOUNDS,   center: midpoint(HERITAGE_RUIN_BOUNDS) },
  { id: 'heritage-statue', kind: 'village', bounds: HERITAGE_STATUE_BOUNDS, center: midpoint(HERITAGE_STATUE_BOUNDS) },
  { id: 'waterfall', kind: 'village', bounds: WATERFALL_BOUNDS, center: midpoint(WATERFALL_BOUNDS) },
  { id: 'camp', kind: 'village', bounds: CAMP_BOUNDS, center: midpoint(CAMP_BOUNDS) },
  ...EXTRA_FARM_REGIONS,
];

// Roads: 2-wide bridges spanning only water; tree rooted at village. 41 total.
interface RoadDef {
  minX: number; minY: number; maxX: number; maxY: number;
}

const CLUSTER_BRIDGES: readonly [RegionId, RegionId][] = [
  ['village', 'carpentry'],
  ['village', 'blacksmith'],
  ['village', 'mill'],
  ['village', 'shrine'],
  ['shrine', 'waterfall'],
  ['carpentry', 'forest-north'],
  ['carpentry', 'forest-south'],
  ['blacksmith', 'quarry-north'],
  ['blacksmith', 'quarry-south'],
  ['forest-north', 'mushroom-grove'],
  ['quarry-north', 'ice-pond'],
  ['quarry-north', 'well-north'],
  ['quarry-south', 'well-south'],
  ['quarry-north', 'heritage-ruin'],
  ['forest-north', 'heritage-stones'],
  ['forest-south', 'heritage-statue'],
  ['mill', 'fishing-isle'],
  ['forest-south', 'fishing-isle-2'],
  ['quarry-south', 'harbor'],
  ['harbor', 'camp'],
];

const boundsOf = (id: RegionId) => {
  const r = REGIONS.find((reg) => reg.id === id);
  if (!r) throw new Error(`boundsOf: unknown region '${id}'`);
  return r.bounds;
};
const centerOf = (id: RegionId) => {
  const r = REGIONS.find((reg) => reg.id === id);
  if (!r) throw new Error(`centerOf: unknown region '${id}'`);
  return r.center;
};

/** Do two inclusive rects overlap (share any tile)? */
function rectsOverlap(a: RoadDef, b: RoadDef): boolean {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}

/** A candidate bridge rect is CLEAN iff it overlaps no region body and, when
 *  expanded by 1 tile, edge-touches exactly its two endpoint islands. */
function bridgeIsClean(rect: RoadDef, aId: RegionId, bId: RegionId): boolean {
  for (const reg of REGIONS) {
    if (rectsOverlap(rect, reg.bounds)) return false;
  }
  const exp = { minX: rect.minX - 1, minY: rect.minY - 1, maxX: rect.maxX + 1, maxY: rect.maxY + 1 };
  for (const reg of REGIONS) {
    if (reg.id === aId || reg.id === bId) continue;
    if (rectsOverlap(exp, reg.bounds)) return false;
  }
  return true;
}

/** Find a clean straight 2-wide bridge between two islands, or null. */
function straightBridge(aId: RegionId, bId: RegionId): RoadDef | null {
  const a = boundsOf(aId);
  const b = boundsOf(bId);
  const candidates: RoadDef[] = [];
  const ox0 = Math.max(a.minX, b.minX);
  const ox1 = Math.min(a.maxX, b.maxX);
  for (let x0 = ox0; x0 + 1 <= ox1; x0++) {
    if (a.maxY < b.minY) {
      const r = { minX: x0, minY: a.maxY + 1, maxX: x0 + 1, maxY: b.minY - 1 };
      if (r.minY <= r.maxY) candidates.push(r);
    }
    if (b.maxY < a.minY) {
      const r = { minX: x0, minY: b.maxY + 1, maxX: x0 + 1, maxY: a.minY - 1 };
      if (r.minY <= r.maxY) candidates.push(r);
    }
  }
  const oy0 = Math.max(a.minY, b.minY);
  const oy1 = Math.min(a.maxY, b.maxY);
  for (let y0 = oy0; y0 + 1 <= oy1; y0++) {
    if (a.maxX < b.minX) {
      const r = { minX: a.maxX + 1, minY: y0, maxX: b.minX - 1, maxY: y0 + 1 };
      if (r.minX <= r.maxX) candidates.push(r);
    }
    if (b.maxX < a.minX) {
      const r = { minX: b.maxX + 1, minY: y0, maxX: a.minX - 1, maxY: y0 + 1 };
      if (r.minX <= r.maxX) candidates.push(r);
    }
  }
  for (const r of candidates) {
    if (bridgeIsClean(r, aId, bId)) return r;
  }
  return null;
}

function generateClusterBridges(): RoadDef[] {
  const out: RoadDef[] = [];
  for (const [aId, bId] of CLUSTER_BRIDGES) {
    const r = straightBridge(aId, bId);
    if (!r) throw new Error(`generateClusterBridges: no clean bridge ${aId}↔${bId}`);
    out.push(r);
  }
  return out;
}

/** Connect each ring farm to the nearest island yielding a clean straight spoke. */
function generateFarmSpokes(): RoadDef[] {
  const clusterIds = REGIONS.filter((r) => r.kind === 'village').map((r) => r.id);
  const innerFarmIds: RegionId[] = [
    'farm-pip', 'farm-atticus', 'farm-hannah', 'farm-otto', 'farm-cora',
    'farm-0', 'farm-1', 'farm-2', 'farm-3',
  ];
  const innerProcSlots = 4;
  const out: RoadDef[] = [];

  const connect = (fid: RegionId, pool: RegionId[]) => {
    const fc = centerOf(fid);
    const sorted = [...pool].sort((A, B) => {
      const a = centerOf(A);
      const b = centerOf(B);
      const da = (a.x - fc.x) ** 2 + (a.y - fc.y) ** 2;
      const db = (b.x - fc.x) ** 2 + (b.y - fc.y) ** 2;
      return da - db;
    });
    for (const t of sorted) {
      const r = straightBridge(fid, t);
      if (r) { out.push(r); return; }
    }
    throw new Error(`generateFarmSpokes: no clean spoke for ${fid}`);
  };

  for (const fid of innerFarmIds) connect(fid, clusterIds);
  for (let i = innerProcSlots; i < EXTRA_FARM_COUNT; i++) {
    connect(`farm-${i}` as RegionId, [...innerFarmIds, ...clusterIds]);
  }
  return out;
}

const ROADS: readonly RoadDef[] = [
  ...generateClusterBridges(),
  ...generateFarmSpokes(),
];

// Town square: inner 4×4 of village (auction podium + notice board)
export const TOWN_SQUARE = { minX: 78, minY: 79, maxX: 81, maxY: 82 };
export const AUCTION_PODIUM_TILE = { x: 80, y: 80 } as const;
export const NOTICE_BOARD_TILE = { x: 79, y: 80 } as const;

function inBounds(
  x: number,
  y: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/** RegionId for a tile coordinate, or null for void/road-only tiles. */
export function regionAt(x: number, y: number): RegionId | null {
  for (const region of REGIONS) {
    if (inBounds(x, y, region.bounds)) return region.id;
  }
  return null;
}

/** True if the tile is inside a region or on a road. */
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

/** Nearest forest ("tree") or quarry ("stone") zone to a farm center. Ties resolve to the north zone. */
export function nearestResourceZone(
  farmCenter: { x: number; y: number },
  kind: "tree" | "stone",
): RegionId {
  const candidates: RegionId[] = kind === "tree"
    ? ["forest-north", "forest-south"]
    : ["quarry-north", "quarry-south"];
  let best: RegionId = candidates[0]!;
  let bestDist = Infinity;
  for (const id of candidates) {
    const c = getRegion(id).center;
    const dx = c.x - farmCenter.x;
    const dy = c.y - farmCenter.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

export { ROADS };
export type { RoadDef };
