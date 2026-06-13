import { createRng } from '@engine/core';

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
  | 'camp'                            // rest away from home without the unrested penalty
  | 'weather-station'                 // decorative — antenna mast + beacon blink, no behavior
  | 'volcano'                         // scenic — volcanic islet off Pip's farm, no behavior
  | 'casino'                          // scenic — casino islet off the fishing isle, no behavior
  | 'big-tree'                        // scenic — island whose centerpiece is one large seasonal tree
  | 'ring';                           // scenic — boxing-ring landmark islet (ropes/posts/crowd stand), no behavior

/** `farm-0` .. `farm-(EXTRA_FARM_COUNT-1)` on the radial outer rings. */
export type ExtraFarmRegionId = `farm-${number}`;

/** `ranch-0` .. `ranch-20` — one neighbouring ranch island per farm (hosts its livestock pens). */
export type RanchRegionId = `ranch-${number}`;

export type RegionId = FixedRegionId | ExtraFarmRegionId | RanchRegionId;

export type RegionKind = 'village' | 'farm' | 'landmark' | 'ranch';

/** RENDER-ONLY theme key — selects an interior décor table. NEVER read by sim logic. */
export type RegionTheme =
  | 'ranch' | 'casino' | 'shrine' | 'heritage' | 'forest' | 'quarry' | 'big-tree' | 'ring'
  | 'camp' | 'pond' | 'volcano' | 'boxing';

export interface RegionDef {
  id: RegionId;
  kind: RegionKind;
  ownerId?: number | undefined; // farmer entity id for farms; undefined for village
  bounds: { minX: number; minY: number; maxX: number; maxY: number }; // inclusive
  center: { x: number; y: number };
  /** RENDER-ONLY décor theme. Optional — only present when assigned. Sim code must never read it. */
  theme?: RegionTheme;
}

// 240×240 radial archipelago: isolated islands connected only by 2-wide bridges.
// Central cluster (village hub + craft/resource/seasonal/landmark islands) surrounded by
// two concentric rings of 21 farms. The renderer derives ocean/shores/bridges purely from
// these bounds + ROADS.
export const WORLD_WIDTH = 240;
export const WORLD_HEIGHT = 240;

const MAP_CX = 120;
const MAP_CY = 120;

// The layout below is authored at the original 160×160 scale around (80,80) and
// uniformly scaled out to the live world. Scaling position-offset-from-center
// (NOT island size) opens every inter-body gap by SCALE while keeping islands the
// same size. To grow the world again, bump WORLD_* / MAP_C* / SCALE together.
const DESIGN_CX = 80;
const DESIGN_CY = 80;
const SCALE = 1.5; // 240 / 160

/** Scale a hand-authored (160-scale) bounds rect out to the live world: the rect
 *  center moves by SCALE from the design origin; width/height are preserved. */
export function scaleB(b: { minX: number; minY: number; maxX: number; maxY: number }): {
  minX: number; minY: number; maxX: number; maxY: number;
} {
  const w = b.maxX - b.minX + 1;
  const h = b.maxY - b.minY + 1;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const ncx = MAP_CX + (cx - DESIGN_CX) * SCALE;
  const ncy = MAP_CY + (cy - DESIGN_CY) * SCALE;
  const minX = Math.round(ncx - w / 2);
  const minY = Math.round(ncy - h / 2);
  return { minX, minY, maxX: minX + w - 1, maxY: minY + h - 1 };
}

/** Scale a hand-authored (160-scale) render-anchor tile out to the live world.
 *  Use for any single tile coordinate authored against the original layout
 *  (décor anchors, NPC stations, structure tiles) so it tracks the scaled world. */
export function scaleT(t: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(MAP_CX + (t.x - DESIGN_CX) * SCALE),
    y: Math.round(MAP_CY + (t.y - DESIGN_CY) * SCALE),
  };
}

// Fixed (not the run seed): world geometry is immutable across runs.
export const WORLD_GEN_SEED = 0x5eed_face;

// Hand-authored bounds packed around (80,80); ≥1 ocean gap between any pair,
// ≥2 for landmarks. Verified: min any-pair gap 1, min landmark gap 2.
const VILLAGE_BOUNDS        = scaleB({ minX: 75, minY: 75, maxX: 86, maxY: 86 }); // center hub (12×12)
const CARPENTRY_BOUNDS      = scaleB({ minX: 59, minY: 76, maxX: 68, maxY: 85 }); // W of village (10×10)
const BLACKSMITH_BOUNDS     = scaleB({ minX: 93, minY: 76, maxX: 102, maxY: 85 }); // E of village (10×10)
const MILL_BOUNDS           = scaleB({ minX: 76, minY: 93, maxX: 85, maxY: 100 }); // S of village (10×8)

const FOREST_NORTH_BOUNDS   = scaleB({ minX: 61, minY: 61, maxX: 68, maxY: 68 }); // NW diagonal (8×8)
const QUARRY_NORTH_BOUNDS   = scaleB({ minX: 93, minY: 61, maxX: 100, maxY: 68 }); // NE diagonal
const FOREST_SOUTH_BOUNDS   = scaleB({ minX: 61, minY: 93, maxX: 68, maxY: 100 }); // SW diagonal
const QUARRY_SOUTH_BOUNDS   = scaleB({ minX: 93, minY: 93, maxX: 100, maxY: 100 }); // SE diagonal

// Neutral islands enlarged 8×8→12×12 (grown about center) for the "bigger decorated
// neutral islands" todo; gaps verified ≥2 + bridges clean after growth.
const MUSHROOM_GROVE_BOUNDS = scaleB({ minX: 57, minY: 45, maxX: 68, maxY: 56 }); // N — autumn (12×12)
const ICE_POND_BOUNDS       = scaleB({ minX: 93, minY: 45, maxX: 104, maxY: 56 }); // N — winter (12×12)

const WELL_NORTH_BOUNDS     = scaleB({ minX: 103, minY: 62, maxX: 104, maxY: 63 }); // 2×2, by quarry-north
const WELL_SOUTH_BOUNDS     = scaleB({ minX: 103, minY: 94, maxX: 104, maxY: 95 }); // 2×2, by quarry-south

// Authored +2 in x (71→73) vs the pure 160-scale layout: position-only scaling
// spreads centers without growing islands, which erased shrine's thin x-overlap
// with the village and killed the village↔shrine bridge. The nudge restores a
// ≥2-column scaled overlap with the village while keeping a 3-column gap to the
// waterfall (the only other neighbour). Sole hand-tuned exception to the transform.
const SHRINE_BOUNDS         = scaleB({ minX: 73, minY: 58, maxX: 79, maxY: 64 }); // N-center (7×7), interactive
const WATERFALL_BOUNDS      = scaleB({ minX: 80, minY: 58, maxX: 87, maxY: 65 }); // N-center-E (8×8), ANIMATED

const HERITAGE_STONES_BOUNDS  = scaleB({ minX: 43, minY: 61, maxX: 54, maxY: 72 }); // W (12×12) decorative
const HERITAGE_RUIN_BOUNDS    = scaleB({ minX: 107, minY: 61, maxX: 118, maxY: 72 }); // E (12×12) decorative
const HERITAGE_STATUE_BOUNDS  = scaleB({ minX: 43, minY: 91, maxX: 54, maxY: 102 }); // SW (12×12) decorative

const FISHING_ISLE_BOUNDS   = scaleB({ minX: 75, minY: 105, maxX: 82, maxY: 112 }); // S-center (8×8 sand)
const FISHING_ISLE_2_BOUNDS = scaleB({ minX: 59, minY: 105, maxX: 66, maxY: 112 }); // S-W (8×8 sand)
const HARBOR_BOUNDS         = scaleB({ minX: 93, minY: 105, maxX: 100, maxY: 112 }); // S-E dock (8×8)
const CAMP_BOUNDS           = scaleB({ minX: 108, minY: 104, maxX: 117, maxY: 113 }); // SE campsite (10×10, tight pair w/ weather-station)

// Weather station island: 7×7, south of camp, same x-band.
// ≥6-tile gap to camp (north), ≥3-tile gap to farm-1 worst-case (NE).
// Bridged north-to-south (vertical bridge) to camp.
const WEATHER_STATION_BOUNDS = scaleB({ minX: 108, minY: 119, maxX: 116, maxY: 127 }); // S (9×9, grown S+sides; keeps gap to camp)

// Scenic landmark islets (8×8) in open ocean, each a dead-end leaf bridged to a single
// neighbour so no agent traffic routes through them. Placement + bridges verified clean
// (no region overlap, ≥2-tile landmark gap). See decisions.md / log.md.
const VOLCANO_BOUNDS = scaleB({ minX: 74, minY: 7, maxX: 85, maxY: 18 });    // N — bridged S to farm-pip (12×12)
const CASINO_BOUNDS  = scaleB({ minX: 72, minY: 114, maxX: 83, maxY: 125 }); // S — bridged N to fishing-isle (12×12)

// Big-tree island: 10×10 leaf in the open water along the N edge, bridged W to the
// volcano islet (a clear top-strip pocket outside the farm spoke web — authored in
// LIVE/scaled coords since it's a brand-new island, not a 160-scale-authored body).
// Centerpiece is a bespoke seasonal big tree (BIG_STRUCTURES in geometry.ts).
const BIG_TREE_BOUNDS = { minX: 127, minY: 7, maxX: 136, maxY: 16 }; // N-edge, E of volcano (10×10)

// Ring-box island: 12×12 boxing-ring landmark leaf in the clear water pocket SE of the
// village hub, bridged N to the village (the closest open-water pocket with ≥2-tile gaps
// to every region + a clean straight 2-wide bridge — found by the same grid-scan idiom as
// big-tree, authored in LIVE/scaled coords since it's a brand-new island). Centerpiece is a
// deliberate baked layout of ring posts + ropes (BIG_STRUCTURES in geometry.ts), dressed
// with crowd-stand décor (theme 'boxing'). Dead-end leaf — no agent traffic routes through.
const RING_BOUNDS = { minX: 121, minY: 101, maxX: 132, maxY: 112 }; // SE of village (12×12)

// 21 farms on two concentric rings (R=78 inner n=9, R=108 outer n=12 — radii are
// the original 52/72 scaled out by SCALE). Named farms are 12×12; procedural are
// 10×10. Per-farm jitter (±EXTRA_FARM_JITTER, fixed-seed) makes the frontier organic.
export const EXTRA_FARM_COUNT: number = 16; // 5 named + 16 procedural = 21 farms
const FARM_NAMED_SIZE = 12;
const FARM_PROC_SIZE = 10;

const INNER_RING = { n: 9, r: 52 * SCALE, phi: -Math.PI / 2 };
const OUTER_RING = { n: 12, r: 72 * SCALE, phi: (-90 + 15) * (Math.PI / 180) };

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

export const FISHING_ISLE_IDS: readonly RegionId[] = ['fishing-isle', 'fishing-isle-2'];

export const HARBOR_REGION_ID: RegionId = 'harbor';
export const SHRINE_REGION_ID: RegionId = 'shrine';
export const HERITAGE_REGION_IDS: readonly RegionId[] = [
  'heritage-stones',
  'heritage-ruin',
  'heritage-statue',
];
export const WATERFALL_REGION_ID: RegionId = 'waterfall';

/** A farmer here at nightfall sleeps RESTED (no away-from-home penalty). */
export const CAMP_REGION_ID: RegionId = 'camp';

/** Weather-station region id. */
export const WEATHER_STATION_REGION_ID: RegionId = 'weather-station';

/** Scenic islet region ids (render anchors for the volcano / casino sprites). */
export const VOLCANO_REGION_ID: RegionId = 'volcano';
export const CASINO_REGION_ID: RegionId = 'casino';

/** Boxing-ring landmark islet region id (render anchor for the baked ring structure). */
export const RING_REGION_ID: RegionId = 'ring';

// NOTE: render-overlay anchor tiles (campfire, waterfall, volcano crater, casino
// neon, weather antenna) and the harbor dock/board tiles are defined further down
// — they are island-relative (scaleAroundNearestIsland), which must be declared
// after REGIONS exists.

export function isFishingIsle(region: RegionId | null): boolean {
  return region === 'fishing-isle' || region === 'fishing-isle-2';
}

function midpoint(bounds: { minX: number; minY: number; maxX: number; maxY: number }): { x: number; y: number } {
  return {
    x: Math.floor((bounds.minX + bounds.maxX) / 2),
    y: Math.floor((bounds.minY + bounds.maxY) / 2),
  };
}

const BASE_REGIONS: readonly RegionDef[] = [
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
  { id: 'weather-station', kind: 'landmark', bounds: WEATHER_STATION_BOUNDS, center: midpoint(WEATHER_STATION_BOUNDS) },
  { id: 'volcano', kind: 'landmark', bounds: VOLCANO_BOUNDS, center: midpoint(VOLCANO_BOUNDS) },
  { id: 'casino',  kind: 'landmark', bounds: CASINO_BOUNDS,  center: midpoint(CASINO_BOUNDS) },
  { id: 'big-tree', kind: 'landmark', bounds: BIG_TREE_BOUNDS, center: midpoint(BIG_TREE_BOUNDS) },
  { id: 'ring', kind: 'landmark', bounds: RING_BOUNDS, center: midpoint(RING_BOUNDS), theme: 'boxing' },
  ...EXTRA_FARM_REGIONS,
];

// --- Road geometry primitives (used by both ranch placement and bridge routing) ---
// Declared here (above the ranch section) because ranch placement needs them BEFORE
// the module-level REGIONS / ROADS exist. The cluster/spoke generators below reuse the
// same helpers, passing the full region list explicitly.
interface RoadDef {
  minX: number; minY: number; maxX: number; maxY: number;
}

/** Do two inclusive rects overlap (share any tile)? */
function rectsOverlap(a: RoadDef, b: RoadDef): boolean {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}

/** A candidate bridge rect is CLEAN against `regions` iff it overlaps no region body
 *  and, when expanded by 1 tile, edge-touches exactly its two endpoint islands. */
function bridgeIsCleanAgainst(
  rect: RoadDef,
  aId: RegionId,
  bId: RegionId,
  regions: readonly RegionDef[],
): boolean {
  for (const reg of regions) {
    if (rectsOverlap(rect, reg.bounds)) return false;
  }
  const exp = { minX: rect.minX - 1, minY: rect.minY - 1, maxX: rect.maxX + 1, maxY: rect.maxY + 1 };
  for (const reg of regions) {
    if (reg.id === aId || reg.id === bId) continue;
    if (rectsOverlap(exp, reg.bounds)) return false;
  }
  return true;
}

/** Find a clean straight 2-wide bridge between two explicit bounds (clear of `regions`), or null. */
function straightBridgeBounds(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
  aId: RegionId,
  bId: RegionId,
  regions: readonly RegionDef[],
): RoadDef | null {
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
    if (bridgeIsCleanAgainst(r, aId, bId, regions)) return r;
  }
  return null;
}

/** ≥2-tile ocean gap between two inclusive rects (negative ⇒ overlap/adjacent). */
function oceanGapBetween(a: RoadDef, b: RoadDef): number {
  const gx = Math.max(b.minX - a.maxX - 1, a.minX - b.maxX - 1);
  const gy = Math.max(b.minY - a.maxY - 1, a.minY - b.maxY - 1);
  return Math.max(gx, gy);
}

const boundsOfIn = (id: RegionId, regions: readonly RegionDef[]) => {
  const r = regions.find((reg) => reg.id === id);
  if (!r) throw new Error(`boundsOf: unknown region '${id}'`);
  return r.bounds;
};
const centerOfIn = (id: RegionId, regions: readonly RegionDef[]) => {
  const r = regions.find((reg) => reg.id === id);
  if (!r) throw new Error(`centerOf: unknown region '${id}'`);
  return r.center;
};

/** Find a clean straight 2-wide bridge between two islands in `regions` (clear of all), or null. */
function straightBridgeIn(aId: RegionId, bId: RegionId, regions: readonly RegionDef[]): RoadDef | null {
  return straightBridgeBounds(boundsOfIn(aId, regions), boundsOfIn(bId, regions), aId, bId, regions);
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
  ['camp', 'weather-station'],
  ['farm-pip', 'volcano'],       // scenic islet, dead-end leaf off Pip's farm
  ['fishing-isle', 'casino'],    // scenic islet, dead-end leaf off the fishing isle
  ['volcano', 'big-tree'], // scenic big-tree islet, dead-end leaf on the N edge E of the volcano
  ['village', 'ring'],     // boxing-ring landmark islet, dead-end leaf SE of the village hub
];

function generateClusterBridges(regions: readonly RegionDef[]): RoadDef[] {
  const out: RoadDef[] = [];
  for (const [aId, bId] of CLUSTER_BRIDGES) {
    const r = straightBridgeIn(aId, bId, regions);
    if (!r) throw new Error(`generateClusterBridges: no clean bridge ${aId}↔${bId}`);
    out.push(r);
  }
  return out;
}

/** Connect each ring farm to the nearest island yielding a clean straight spoke. */
function generateFarmSpokes(regions: readonly RegionDef[]): RoadDef[] {
  const clusterIds = regions.filter((r) => r.kind === 'village').map((r) => r.id);
  const innerFarmIds: RegionId[] = [
    'farm-pip', 'farm-atticus', 'farm-hannah', 'farm-otto', 'farm-cora',
    'farm-0', 'farm-1', 'farm-2', 'farm-3',
  ];
  const innerProcSlots = 4;
  const out: RoadDef[] = [];

  const connect = (fid: RegionId, pool: RegionId[]) => {
    const fc = centerOfIn(fid, regions);
    const sorted = [...pool].sort((A, B) => {
      const a = centerOfIn(A, regions);
      const b = centerOfIn(B, regions);
      const da = (a.x - fc.x) ** 2 + (a.y - fc.y) ** 2;
      const db = (b.x - fc.x) ** 2 + (b.y - fc.y) ** 2;
      return da - db;
    });
    for (const t of sorted) {
      const r = straightBridgeIn(fid, t, regions);
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

// --- Per-farm ranch islands ----------------------------------------------------
// Each of the 21 farms gets a neighbouring 8×8 ranch island that hosts its livestock
// pens (placement only — the livestock feature already exists). PURE geometry, no rng:
// each ranch is placed in the first CLEAN cardinal direction (preferring outward, then
// the two tangential cardinals, then inward) at a fixed gap from its farm, with a clean
// straight 2-wide farm↔ranch bridge. Ranches are placed SEQUENTIALLY so each sees the
// ranches already placed and never collides with them.
const FARM_REGIONS: readonly RegionDef[] = BASE_REGIONS.filter((r) => r.kind === 'farm');

const RANCH_SIZE = 8;
const RANCH_HALF = 4; // RANCH_SIZE / 2

type Cardinal = { ux: number; uy: number };
const CARD_E: Cardinal = { ux: 1, uy: 0 };
const CARD_W: Cardinal = { ux: -1, uy: 0 };
const CARD_S: Cardinal = { ux: 0, uy: 1 };
const CARD_N: Cardinal = { ux: 0, uy: -1 };

/** Cardinal directions for a farm, ordered: outward, the two tangential, inward. */
function rankedCardinals(farmCenter: { x: number; y: number }): Cardinal[] {
  const dx = farmCenter.x - MAP_CX;
  const dy = farmCenter.y - MAP_CY;
  // Primary outward cardinal aligns with the larger-magnitude component (ties → x).
  let outward: Cardinal;
  let perpA: Cardinal;
  let perpB: Cardinal;
  if (Math.abs(dx) >= Math.abs(dy)) {
    outward = dx >= 0 ? CARD_E : CARD_W;
    perpA = dy >= 0 ? CARD_S : CARD_N;
    perpB = dy >= 0 ? CARD_N : CARD_S;
  } else {
    outward = dy >= 0 ? CARD_S : CARD_N;
    perpA = dx >= 0 ? CARD_E : CARD_W;
    perpB = dx >= 0 ? CARD_W : CARD_E;
  }
  const inward: Cardinal = { ux: -outward.ux, uy: -outward.uy };
  return [outward, perpA, perpB, inward];
}

/**
 * Place all 21 ranches + their farm↔ranch bridges. Ranches are dead-end leaves, so
 * they must not clip the cluster bridges / farm spokes already routed through open
 * water — `baseRoads` carries those so a candidate ranch body / bridge that overlaps a
 * road (expanded by 1) is rejected. The placement also records, per farm, whether it
 * went outward / sideways / inward (for diagnostics). Throws if any farm can't be served.
 *
 * Center-to-center distance D is tried at 12 first, then 11, then 13 — the candidate
 * order within each D is the ranked cardinals (outward first).
 */
function placeRanches(baseRoads: readonly RoadDef[]): {
  ranches: RegionDef[];
  bridges: RoadDef[];
  cardinalByFarm: { farmId: RegionId; rank: number }[];
} {
  const ranches: RegionDef[] = [];
  const bridges: RoadDef[] = [];
  const cardinalByFarm: { farmId: RegionId; rank: number }[] = [];
  // Growing region list the placement checks against (base + ranches placed so far).
  const placed: RegionDef[] = [...BASE_REGIONS];
  // Ranch bridges placed so far must not clip each other either.
  const placedBridges: RoadDef[] = [...baseRoads];
  const RANCH_DISTANCES = [12, 11, 13] as const;

  /** A rect (expanded by 1) clear of every road in `placedBridges`. */
  const clearOfRoads = (rect: RoadDef): boolean => {
    const exp = { minX: rect.minX - 1, minY: rect.minY - 1, maxX: rect.maxX + 1, maxY: rect.maxY + 1 };
    for (const road of placedBridges) {
      if (rectsOverlap(exp, road)) return false;
    }
    return true;
  };

  FARM_REGIONS.forEach((farm, k) => {
    const ranchId = `ranch-${k}` as RegionId;
    let chosen: { bounds: RoadDef; bridge: RoadDef; rank: number } | null = null;
    const cardinals = rankedCardinals(farm.center);

    search: for (const dist of RANCH_DISTANCES) {
      for (let rank = 0; rank < cardinals.length; rank++) {
        const card = cardinals[rank]!;
        const rcx = farm.center.x + card.ux * dist;
        const rcy = farm.center.y + card.uy * dist;
        const minX = Math.round(rcx - RANCH_HALF);
        const minY = Math.round(rcy - RANCH_HALF);
        const bounds: RoadDef = { minX, minY, maxX: minX + RANCH_SIZE - 1, maxY: minY + RANCH_SIZE - 1 };

        // (a) fully in-world.
        if (bounds.minX < 0 || bounds.minY < 0 || bounds.maxX >= WORLD_WIDTH || bounds.maxY >= WORLD_HEIGHT) {
          continue;
        }
        // (b) ≥2-tile gap from every already-decided region (base + ranches so far).
        let clearOfAll = true;
        for (const reg of placed) {
          if (oceanGapBetween(bounds, reg.bounds) < 2) { clearOfAll = false; break; }
        }
        if (!clearOfAll) continue;
        // (b2) ranch body must not sit on/beside an existing road (cluster/spoke/ranch bridge).
        if (!clearOfRoads(bounds)) continue;
        // (c) a clean straight 2-wide bridge between farm and ranch, clear of all decided regions...
        const ranchDef: RegionDef = { id: ranchId, kind: 'ranch', bounds, center: midpoint(bounds) };
        const bridge = straightBridgeBounds(farm.bounds, bounds, farm.id, ranchId, [...placed, ranchDef]);
        if (!bridge) continue;
        // ...and clear of every existing road too.
        if (!clearOfRoads(bridge)) continue;

        chosen = { bounds, bridge, rank };
        break search;
      }
    }

    if (!chosen) {
      throw new Error(
        `placeRanches: no clean cardinal placement for ranch-${k} (farm ${farm.id} @ ${farm.center.x},${farm.center.y})`,
      );
    }
    const ranchDef: RegionDef = { id: ranchId, kind: 'ranch', bounds: chosen.bounds, center: midpoint(chosen.bounds) };
    ranches.push(ranchDef);
    placed.push(ranchDef);
    bridges.push(chosen.bridge);
    placedBridges.push(chosen.bridge);
    cardinalByFarm.push({ farmId: farm.id, rank: chosen.rank });
  });

  return { ranches, bridges, cardinalByFarm };
}

// Base roads (cluster bridges + farm spokes) computed BEFORE ranches exist — ranches
// are dead-end leaves that must avoid these. Then ranches are placed against them.
const BASE_ROADS: readonly RoadDef[] = [
  ...generateClusterBridges(BASE_REGIONS),
  ...generateFarmSpokes(BASE_REGIONS),
];
const RANCH_PLACEMENT = placeRanches(BASE_ROADS);
const RANCH_REGIONS: readonly RegionDef[] = RANCH_PLACEMENT.ranches;
const RANCH_BRIDGES: readonly RoadDef[] = RANCH_PLACEMENT.bridges;

/** farmId → ranchId, built from FARM_REGIONS[k] ↔ ranch-${k}. */
const RANCH_FOR_FARM = new Map<RegionId, RegionId>(
  FARM_REGIONS.map((farm, k) => [farm.id, `ranch-${k}` as RegionId]),
);

/** The ranch island hosting a farm's livestock pens, or undefined if `farmId` is not a farm. */
export function ranchForFarm(farmId: RegionId): RegionId | undefined {
  return RANCH_FOR_FARM.get(farmId);
}

// RENDER-ONLY theme assignment. Applied as a post-pass over BASE_REGIONS so the big
// inline array stays untouched. Sim logic must NEVER read `theme` (see todo #0.5).
const THEME_BY_ID: Partial<Record<RegionId, RegionTheme>> = {
  'forest-north': 'forest', 'forest-south': 'forest',
  'quarry-north': 'quarry', 'quarry-south': 'quarry',
  'shrine': 'shrine',
  'heritage-stones': 'heritage', 'heritage-ruin': 'heritage', 'heritage-statue': 'heritage',
  // NOTE: casino is intentionally NOT theme-scattered — its content is a deliberate
  // layout of baked gaming props (slots/roulette/blackjack/dice/shell-game in
  // geometry.ts BIG_STRUCTURES). Random scatter would clutter / overlap those.
  // Enlarged neutral islands (bigger-decorated-neutral-islands todo) get décor themes.
  'mushroom-grove': 'forest', 'waterfall': 'forest',
  'ice-pond': 'pond',
  'camp': 'camp',
  'weather-station': 'quarry',
  'volcano': 'volcano',
  'big-tree': 'big-tree',
};

export const REGIONS: readonly RegionDef[] = [...BASE_REGIONS, ...RANCH_REGIONS].map((r) => {
  const theme = THEME_BY_ID[r.id]
    ?? (r.kind === 'farm' ? 'ring' : r.kind === 'ranch' ? 'ranch' : undefined);
  return theme ? { ...r, theme } : r;
});

/** Recover a region's hand-authored (160-scale) center from its live scaled center
 *  (inverse of the origin scaling applied to bounds). */
function authoredCenterOf(scaled: { x: number; y: number }): { x: number; y: number } {
  return {
    x: DESIGN_CX + (scaled.x - MAP_CX) / SCALE,
    y: DESIGN_CY + (scaled.y - MAP_CY) / SCALE,
  };
}

/**
 * Re-anchor a hand-authored (160-scale) tile to the live world by locking it to
 * its ISLAND rather than the global map: find the nearest island, then translate
 * the tile by that island's center displacement. Because islands keep their size
 * under position-only scaling, an on-island tile keeps its exact offset from the
 * island center and never drifts off into the ocean (unlike a raw origin scale,
 * which spreads on-island content wider than its same-size island).
 *
 * Use for every authored coordinate that sits on/beside an island: décor, NPC
 * stations, building footprints, dock/delivery tiles.
 */
export function scaleAroundNearestIsland(t: { x: number; y: number }): { x: number; y: number } {
  let bestDispX = 0;
  let bestDispY = 0;
  let bestD = Infinity;
  for (const r of REGIONS) {
    const a = authoredCenterOf(r.center);
    const d = (a.x - t.x) ** 2 + (a.y - t.y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestDispX = r.center.x - a.x;
      bestDispY = r.center.y - a.y;
    }
  }
  return { x: Math.round(t.x + bestDispX), y: Math.round(t.y + bestDispY) };
}

// Render-overlay + structure anchor tiles, authored at 160-scale and locked to
// their island so they ride with it (declared here because scaleAroundNearestIsland
// needs REGIONS). Render-loop only unless noted.

/** Campfire-overlay anchor tile (cx+2 from island center). */
export const CAMPFIRE_TILE = scaleAroundNearestIsland({ x: 114, y: 108 });

/** Waterfall cascade-overlay anchor tile (center column / top). */
export const WATERFALL_TILE = scaleAroundNearestIsland({ x: 83, y: 59 });

/** Volcano crater tile — smoke-plume emit anchor. */
export const VOLCANO_CRATER_TILE = scaleAroundNearestIsland({ x: 80, y: 11 });

/** Casino tower crown tile — neon-glint emit anchor. */
export const CASINO_NEON_TILE = scaleAroundNearestIsland({ x: 76, y: 116 });

/** Antenna tip anchor tile (top-right of island). */
export const WEATHER_STATION_TILE = scaleAroundNearestIsland({ x: 114, y: 119 });

/** Harbor north-edge center — farmer stands here to deliver a contract. */
export const HARBOR_DOCK_TILE = scaleAroundNearestIsland({ x: 96, y: 105 });

export const HARBOR_BOARD_TILE = scaleAroundNearestIsland({ x: 97, y: 108 });

// Roads: 2-wide bridges spanning only water; tree rooted at village. Cluster bridges +
// farm spokes were computed into BASE_ROADS (before ranches existed); ranch leaf bridges
// were computed during placeRanches. RoadDef, the bridge helpers, CLUSTER_BRIDGES, and
// the generators are all declared ABOVE the ranch section (they ran before REGIONS).
const ROADS: readonly RoadDef[] = [
  ...BASE_ROADS,
  ...RANCH_BRIDGES,
];

// Town square: inner 4×4 of village (auction podium + notice board)
export const TOWN_SQUARE = scaleB({ minX: 78, minY: 79, maxX: 81, maxY: 82 });
export const AUCTION_PODIUM_TILE = scaleAroundNearestIsland({ x: 80, y: 80 });
export const NOTICE_BOARD_TILE = scaleAroundNearestIsland({ x: 79, y: 80 });

function inBounds(
  x: number,
  y: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/** Returns null for void/road-only tiles. */
export function regionAt(x: number, y: number): RegionId | null {
  for (const region of REGIONS) {
    if (inBounds(x, y, region.bounds)) return region.id;
  }
  return null;
}

export function isWalkable(x: number, y: number): boolean {
  if (regionAt(x, y) !== null) return true;
  for (const road of ROADS) {
    if (inBounds(x, y, road)) return true;
  }
  return false;
}

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
