import { createRng } from '@engine/core';
import { forcedCoreTiles } from './region-setup/anchors';
import { buildOrganicMaskAttempt, MAX_ATTEMPTS } from './organic-mask';

export type FixedRegionId =
  | 'village' | 'farm-cora' | 'farm-atticus' | 'farm-hannah' | 'farm-otto'
  | 'farm-pip'                         
  | 'blacksmith' | 'carpentry'
  | 'forest-north' | 'quarry-north'
  | 'forest-south' | 'quarry-south'
  | 'mill'                            
  | 'well-north' | 'well-south'       
  | 'mushroom-grove'                  
  | 'ice-pond'                        
  | 'fishing-isle'                    
  | 'fishing-isle-2'                  
  | 'harbor'                          
  | 'shrine'                          
  | 'heritage-stones'                 
  | 'heritage-ruin'                   
  | 'heritage-statue'                 
  | 'waterfall'                       
  | 'camp'                            
  | 'weather-station'                 
  | 'volcano'                         
  | 'casino'                          
  | 'big-tree'                        
  | 'ring';                           

export type ExtraFarmRegionId = `farm-${number}`;

export type RanchRegionId = `ranch-${number}`;

export type RegionId = FixedRegionId | ExtraFarmRegionId | RanchRegionId;

export type RegionKind = 'village' | 'farm' | 'landmark' | 'ranch';

export type RegionTheme =
  | 'ranch' | 'casino' | 'shrine' | 'heritage' | 'forest' | 'quarry' | 'big-tree' | 'ring'
  | 'camp' | 'pond' | 'volcano' | 'boxing';

export interface RegionDef {
  id: RegionId;
  kind: RegionKind;
  ownerId?: number | undefined; 
  bounds: { minX: number; minY: number; maxX: number; maxY: number }; 
  center: { x: number; y: number };

  theme?: RegionTheme;
  /** Row-major (maxX-minX+1)*(maxY-minY+1), 1=land. */
  mask?: Uint8Array;
}

export const WORLD_WIDTH = 240;
export const WORLD_HEIGHT = 240;

const MAP_CX = 120;
const MAP_CY = 120;

const DESIGN_CX = 80;
const DESIGN_CY = 80;
const SCALE = 1.5; 

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

export function scaleT(t: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(MAP_CX + (t.x - DESIGN_CX) * SCALE),
    y: Math.round(MAP_CY + (t.y - DESIGN_CY) * SCALE),
  };
}

export const WORLD_GEN_SEED = 0x5eed_face;

const VILLAGE_BOUNDS        = scaleB({ minX: 75, minY: 75, maxX: 86, maxY: 86 }); 
const CARPENTRY_BOUNDS      = scaleB({ minX: 59, minY: 76, maxX: 68, maxY: 85 }); 
const BLACKSMITH_BOUNDS     = scaleB({ minX: 93, minY: 76, maxX: 102, maxY: 85 }); 
const MILL_BOUNDS           = scaleB({ minX: 76, minY: 93, maxX: 85, maxY: 100 }); 

const FOREST_NORTH_BOUNDS   = scaleB({ minX: 61, minY: 61, maxX: 68, maxY: 68 }); 
const QUARRY_NORTH_BOUNDS   = scaleB({ minX: 93, minY: 61, maxX: 100, maxY: 68 }); 
const FOREST_SOUTH_BOUNDS   = scaleB({ minX: 61, minY: 93, maxX: 68, maxY: 100 }); 
const QUARRY_SOUTH_BOUNDS   = scaleB({ minX: 93, minY: 93, maxX: 100, maxY: 100 }); 

const MUSHROOM_GROVE_BOUNDS = scaleB({ minX: 57, minY: 45, maxX: 68, maxY: 56 }); 
const ICE_POND_BOUNDS       = scaleB({ minX: 93, minY: 45, maxX: 104, maxY: 56 }); 

const WELL_NORTH_BOUNDS     = scaleB({ minX: 103, minY: 62, maxX: 104, maxY: 63 }); 
const WELL_SOUTH_BOUNDS     = scaleB({ minX: 103, minY: 94, maxX: 104, maxY: 95 }); 

const SHRINE_BOUNDS         = scaleB({ minX: 73, minY: 58, maxX: 79, maxY: 64 }); 
const WATERFALL_BOUNDS      = scaleB({ minX: 80, minY: 58, maxX: 87, maxY: 65 }); 

const HERITAGE_STONES_BOUNDS  = scaleB({ minX: 43, minY: 61, maxX: 54, maxY: 72 }); 
const HERITAGE_RUIN_BOUNDS    = scaleB({ minX: 107, minY: 61, maxX: 118, maxY: 72 }); 
const HERITAGE_STATUE_BOUNDS  = scaleB({ minX: 43, minY: 91, maxX: 54, maxY: 102 }); 

const FISHING_ISLE_BOUNDS   = scaleB({ minX: 75, minY: 105, maxX: 82, maxY: 112 }); 
const FISHING_ISLE_2_BOUNDS = scaleB({ minX: 59, minY: 105, maxX: 66, maxY: 112 }); 
const HARBOR_BOUNDS         = scaleB({ minX: 93, minY: 105, maxX: 100, maxY: 112 }); 
const CAMP_BOUNDS           = scaleB({ minX: 108, minY: 104, maxX: 117, maxY: 113 }); 

const WEATHER_STATION_BOUNDS = scaleB({ minX: 108, minY: 119, maxX: 116, maxY: 127 }); 

const VOLCANO_BOUNDS = scaleB({ minX: 74, minY: 7, maxX: 85, maxY: 18 });    
const CASINO_BOUNDS  = scaleB({ minX: 72, minY: 114, maxX: 83, maxY: 125 }); 

const BIG_TREE_BOUNDS = { minX: 127, minY: 7, maxX: 136, maxY: 16 }; 

const RING_BOUNDS = { minX: 121, minY: 101, maxX: 132, maxY: 112 }; 

export const EXTRA_FARM_COUNT: number = 16; 
const FARM_NAMED_SIZE = 12;
const FARM_PROC_SIZE = 10;

const INNER_RING = { n: 9, r: 52 * SCALE, phi: -Math.PI / 2 };
const OUTER_RING = { n: 12, r: 72 * SCALE, phi: (-90 + 15) * (Math.PI / 180) };

const EXTRA_FARM_JITTER = 1;

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

function makeRadialFarmRegion(i: number, jitter: readonly { dx: number; dy: number }[]): RegionDef {
  const INNER_PROC_SLOTS = [1, 3, 5, 7];
  let base: { minX: number; minY: number; maxX: number; maxY: number };
  if (i < INNER_PROC_SLOTS.length) {
    base = ringSlotBounds(INNER_RING, INNER_PROC_SLOTS[i]!, FARM_PROC_SIZE);
  } else {
    base = ringSlotBounds(OUTER_RING, i - INNER_PROC_SLOTS.length, FARM_PROC_SIZE);
  }
  const j = jitter[i]!;
  const bounds = {
    minX: base.minX + j.dx,
    minY: base.minY + j.dy,
    maxX: base.maxX + j.dx,
    maxY: base.maxY + j.dy,
  };
  return { id: `farm-${i}` as RegionId, kind: 'farm', bounds, center: midpoint(bounds) };
}

export const FISHING_ISLE_IDS: readonly RegionId[] = ['fishing-isle', 'fishing-isle-2'];

export const HARBOR_REGION_ID: RegionId = 'harbor';
export const SHRINE_REGION_ID: RegionId = 'shrine';
export const HERITAGE_REGION_IDS: readonly RegionId[] = [
  'heritage-stones',
  'heritage-ruin',
  'heritage-statue',
];
export const WATERFALL_REGION_ID: RegionId = 'waterfall';

export const CAMP_REGION_ID: RegionId = 'camp';

export const WEATHER_STATION_REGION_ID: RegionId = 'weather-station';

export const VOLCANO_REGION_ID: RegionId = 'volcano';
export const CASINO_REGION_ID: RegionId = 'casino';

export const RING_REGION_ID: RegionId = 'ring';

export function isFishingIsle(region: RegionId | null): boolean {
  return region === 'fishing-isle' || region === 'fishing-isle-2';
}

function midpoint(bounds: { minX: number; minY: number; maxX: number; maxY: number }): { x: number; y: number } {
  return {
    x: Math.floor((bounds.minX + bounds.maxX) / 2),
    y: Math.floor((bounds.minY + bounds.maxY) / 2),
  };
}

function buildBaseRegions(extraFarmRegions: readonly RegionDef[]): readonly RegionDef[] {
  return [
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
  ...extraFarmRegions,
  ];
}

interface RoadDef {
  minX: number; minY: number; maxX: number; maxY: number;
}

function rectsOverlap(a: RoadDef, b: RoadDef): boolean {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}

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
  ['farm-pip', 'volcano'],       
  ['fishing-isle', 'casino'],    
  ['volcano', 'big-tree'], 
  ['village', 'ring'],     
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

const RANCH_SIZE = 8;
const RANCH_HALF = 4; 

type Cardinal = { ux: number; uy: number };
const CARD_E: Cardinal = { ux: 1, uy: 0 };
const CARD_W: Cardinal = { ux: -1, uy: 0 };
const CARD_S: Cardinal = { ux: 0, uy: 1 };
const CARD_N: Cardinal = { ux: 0, uy: -1 };

function rankedCardinals(farmCenter: { x: number; y: number }): Cardinal[] {
  const dx = farmCenter.x - MAP_CX;
  const dy = farmCenter.y - MAP_CY;

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

function placeRanches(
  baseRoads: readonly RoadDef[],
  baseRegions: readonly RegionDef[],
  farmRegions: readonly RegionDef[],
): {
  ranches: RegionDef[];
  bridges: RoadDef[];
  cardinalByFarm: { farmId: RegionId; rank: number }[];
} {
  const ranches: RegionDef[] = [];
  const bridges: RoadDef[] = [];
  const cardinalByFarm: { farmId: RegionId; rank: number }[] = [];

  const placed: RegionDef[] = [...baseRegions];

  const placedBridges: RoadDef[] = [...baseRoads];
  const RANCH_DISTANCES = [12, 11, 13] as const;

  const clearOfRoads = (rect: RoadDef): boolean => {
    const exp = { minX: rect.minX - 1, minY: rect.minY - 1, maxX: rect.maxX + 1, maxY: rect.maxY + 1 };
    for (const road of placedBridges) {
      if (rectsOverlap(exp, road)) return false;
    }
    return true;
  };

  farmRegions.forEach((farm, k) => {
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

        if (bounds.minX < 0 || bounds.minY < 0 || bounds.maxX >= WORLD_WIDTH || bounds.maxY >= WORLD_HEIGHT) {
          continue;
        }

        let clearOfAll = true;
        for (const reg of placed) {
          if (oceanGapBetween(bounds, reg.bounds) < 2) { clearOfAll = false; break; }
        }
        if (!clearOfAll) continue;

        if (!clearOfRoads(bounds)) continue;

        const ranchDef: RegionDef = { id: ranchId, kind: 'ranch', bounds, center: midpoint(bounds) };
        const bridge = straightBridgeBounds(farm.bounds, bounds, farm.id, ranchId, [...placed, ranchDef]);
        if (!bridge) continue;

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

const THEME_BY_ID: Partial<Record<RegionId, RegionTheme>> = {
  'forest-north': 'forest', 'forest-south': 'forest',
  'quarry-north': 'quarry', 'quarry-south': 'quarry',
  'shrine': 'shrine',
  'heritage-stones': 'heritage', 'heritage-ruin': 'heritage', 'heritage-statue': 'heritage',

  'mushroom-grove': 'forest', 'waterfall': 'forest',
  'ice-pond': 'pond',
  'camp': 'camp',
  'weather-station': 'quarry',
  'volcano': 'volcano',
  'big-tree': 'big-tree',
};

function authoredCenterOf(scaled: { x: number; y: number }): { x: number; y: number } {
  return {
    x: DESIGN_CX + (scaled.x - MAP_CX) / SCALE,
    y: DESIGN_CY + (scaled.y - MAP_CY) / SCALE,
  };
}

/** Returns `{ ...region, mask }` with an all-land mask sized to the region bounds. */
function withAllLandMask(region: RegionDef): RegionDef {
  const { minX, minY, maxX, maxY } = region.bounds;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const mask = new Uint8Array(w * h);
  mask.fill(1);
  return { ...region, mask };
}

function scaleAroundNearestIslandIn(
  t: { x: number; y: number },
  regions: readonly RegionDef[],
): { x: number; y: number } {
  let bestDispX = 0;
  let bestDispY = 0;
  let bestD = Infinity;
  for (const r of regions) {
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

export interface GeneratedWorld {
  regions: readonly RegionDef[];
  roads: readonly RoadDef[];
  ranchForFarm: Map<RegionId, RegionId>;
  campfireTile: { x: number; y: number };
  waterfallTile: { x: number; y: number };
  volcanoCraterTile: { x: number; y: number };
  casinoNeonTile: { x: number; y: number };
  weatherStationTile: { x: number; y: number };
  harborDockTile: { x: number; y: number };
  harborBoardTile: { x: number; y: number };
  auctionPodiumTile: { x: number; y: number };
  noticeBoardTile: { x: number; y: number };
  townSquare: { minX: number; minY: number; maxX: number; maxY: number };
  /** Number of regions that fell back to all-land rect mask (organic generation failed). */
  fallbackCount: number;
}

export function generateWorld(seed: number): GeneratedWorld {
  // 1. Seeded farm-ring jitter (dx drawn before dy, per element).
  const farmJitterRng = createRng(seed).fork('farm-ring-jitter');
  const farmJitter: readonly { dx: number; dy: number }[] = Array.from(
    { length: EXTRA_FARM_COUNT },
    () => ({
      dx: farmJitterRng.int(-EXTRA_FARM_JITTER, EXTRA_FARM_JITTER + 1),
      dy: farmJitterRng.int(-EXTRA_FARM_JITTER, EXTRA_FARM_JITTER + 1),
    }),
  );

  // 2. Extra (procedural) farm regions.
  const extraFarmRegions: readonly RegionDef[] = Array.from(
    { length: EXTRA_FARM_COUNT },
    (_unused, i) => makeRadialFarmRegion(i, farmJitter),
  );

  // 3. Base regions (pre-theme, pre-ranch).
  const baseRegions = buildBaseRegions(extraFarmRegions);

  // 4. Farm subset.
  const farmRegions = baseRegions.filter((r) => r.kind === 'farm');

  // 5. Base roads.
  const baseRoads: readonly RoadDef[] = [
    ...generateClusterBridges(baseRegions),
    ...generateFarmSpokes(baseRegions),
  ];

  // 6. Ranch placement.
  const ranchPlacement = placeRanches(baseRoads, baseRegions, farmRegions);
  const ranchRegions = ranchPlacement.ranches;
  const ranchBridges = ranchPlacement.bridges;

  // 7. ranch-for-farm map.
  const ranchForFarmMap = new Map<RegionId, RegionId>(
    farmRegions.map((farm, k) => [farm.id, `ranch-${k}` as RegionId]),
  );

  // 7b. All roads (needed for road-attachment core pinning in step 8).
  const roads: readonly RoadDef[] = [...baseRoads, ...ranchBridges];

  // 8. Organic masks — sequential so each region can check adjacency against
  //    already-finalized masks. Fork per region, attempt per try, for stable determinism.
  const maskRng = createRng(seed).fork('region-masks');

  // Chebyshev-1 halo of all finalized regions' land tiles. Used for the edge-tile
  // adjacency check: a candidate's bound-edge land tile must not touch a prior region's land.
  // Stored as a flat Uint8Array (WORLD_HEIGHT * WORLD_WIDTH) for O(1) lookup.
  const adjacencyBlockedArr = new Uint8Array(WORLD_HEIGHT * WORLD_WIDTH);
  const blockLandTile = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT) {
          adjacencyBlockedArr[ny * WORLD_WIDTH + nx] = 1;
        }
      }
    }
  };

  let fallbackCount = 0;
  const allThemedUnmasked = [...baseRegions, ...ranchRegions].map((r) => {
    const theme = THEME_BY_ID[r.id]
      ?? (r.kind === 'farm' ? 'ring' : r.kind === 'ranch' ? 'ranch' : undefined);
    return theme ? { ...r, theme } : r;
  });

  const regions: RegionDef[] = [];
  for (const themed of allThemedUnmasked) {
    const { minX, minY, maxX, maxY } = themed.bounds;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;

    // Forced core = geometry-derived tiles + road-attachment tiles (road tiles
    // adjacent to this region's bounds). Over-pinning is always safe.
    const core: { x: number; y: number }[] = forcedCoreTiles(themed);

    // Add road-attachment tiles: any tile in any road rect that is
    // adjacent (Chebyshev 1) to this region's bounds. Collect the clamped
    // in-bounds attach tiles so we can pin a land PATH from each to the region
    // center below.
    const attachTiles: { x: number; y: number }[] = [];
    for (const road of roads) {
      // Quick reject: expanded bounds of road must overlap region's expanded bounds.
      if (
        road.maxX < minX - 1 || road.minX > maxX + 1 ||
        road.maxY < minY - 1 || road.minY > maxY + 1
      ) continue;
      // Add all road tiles adjacent to the region bounds.
      for (let ry = road.minY; ry <= road.maxY; ry++) {
        for (let rx = road.minX; rx <= road.maxX; rx++) {
          // Is this road tile adjacent (Chebyshev 1) to the region's bounding box?
          const adjX = rx >= minX - 1 && rx <= maxX + 1;
          const adjY = ry >= minY - 1 && ry <= maxY + 1;
          if (adjX && adjY) {
            // Clamp to region bounds (only in-bounds tiles can be pinned in mask).
            const cx = Math.max(minX, Math.min(maxX, rx));
            const cy = Math.max(minY, Math.min(maxY, ry));
            core.push({ x: cx, y: cy });
            attachTiles.push({ x: cx, y: cy });
          }
        }
      }
    }

    // Pin an L-shaped land path from every road-attachment tile to the region
    // center. Without this, the organic mask can carve out the interior between
    // two road entries, leaving the region a non-pass-through and disconnecting
    // the world (Wave-2 reachability fix). The path is deterministic (x first,
    // then y) and clamped to bounds; over-pinning is always safe.
    const cx0 = themed.center.x;
    const cy0 = themed.center.y;
    for (const a of attachTiles) {
      const stepX = a.x < cx0 ? 1 : -1;
      for (let x = a.x; x !== cx0; x += stepX) core.push({ x, y: a.y });
      const stepY = a.y < cy0 ? 1 : -1;
      for (let y = a.y; y !== cy0; y += stepY) core.push({ x: cx0, y });
      core.push({ x: cx0, y: cy0 });
    }

    const forkBase = 'region:' + themed.id;
    const regionRng = maskRng.fork(forkBase);

    let chosenMask: Uint8Array | null = null;
    for (let n = 0; n < MAX_ATTEMPTS; n++) {
      const attemptRng = regionRng.fork('attempt-' + n);
      const candidate = buildOrganicMaskAttempt(themed, core, attemptRng);
      if (candidate === null) continue;

      // Cross-region adjacency check: no land tile of this region (that is OUTSIDE
      // this region's own bounds) may be within Chebyshev 1 of a land tile of any
      // already-finalized region. Tiles inside the bounds are allowed to touch the
      // halo of prior regions that are also within those bounds (e.g. road attachment
      // tiles clamped to bounds). We only reject if a land tile of this region is in the
      // halo AND the land tile is inside this region's bounds (own-bounds tiles are
      // always the right side of a boundary).
      //
      // NOTE: The check is deliberately lenient: only INSET-edge tiles that lie within
      // Chebyshev 1 of a PRIOR region's land are blocked. INSET already puts 1 ocean tile
      // at the outer ring, so overlaps are rare; this catches the pathological case where
      // core tiles push land to the bounds edge.
      let adjacencyOk = true;
      outer: for (let ty = minY; ty <= maxY; ty++) {
        for (let tx = minX; tx <= maxX; tx++) {
          if (candidate[(ty - minY) * w + (tx - minX)] === 1) {
            // Only check tiles that are ON the INSET edge ring (outermost tiles that
            // could be core-pinned to land and potentially collide with a neighbour).
            const onEdge = tx === minX || tx === maxX || ty === minY || ty === maxY;
            if (onEdge && adjacencyBlockedArr[ty * WORLD_WIDTH + tx] === 1) {
              adjacencyOk = false;
              break outer;
            }
          }
        }
      }
      if (!adjacencyOk) continue;

      chosenMask = candidate;
      break;
    }

    let mask: Uint8Array;
    if (chosenMask !== null) {
      mask = chosenMask;
    } else {
      // Fallback: all-land rect.
      mask = new Uint8Array(w * h).fill(1);
      fallbackCount++;
    }

    // Register this region's land tiles into the adjacency buffer.
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (mask[(ty - minY) * w + (tx - minX)] === 1) {
          blockLandTile(tx, ty);
        }
      }
    }

    regions.push({ ...themed, mask });
  }

  // 10. Derived tile consts — read the built (themed) regions.
  // Each design coordinate is scaled to world space, then SNAPPED onto the
  // owning region's organic-mask land so it never lands on a carved-out ocean
  // tile. Owning region by id; throws if the region is missing (a real bug).
  const regionById = (id: RegionId): RegionDef => {
    const r = regions.find((reg) => reg.id === id);
    if (!r) throw new Error(`generateWorld: missing region '${id}' for tile-const snap`);
    return r;
  };
  const snapTo = (id: RegionId, design: { x: number; y: number }): { x: number; y: number } =>
    nearestLandTile(regionById(id), scaleAroundNearestIslandIn(design, regions));

  // TOWN_SQUARE is left as a raw scaled bounds rect (NOT snapped): its only
  // consumer (render-systems/static-layer.ts backdropFrame) is gated by both
  // isWalkable() and regionAt(...)==='village' before the rect is tested, so
  // ocean tiles inside the rect are never tinted.
  return {
    regions,
    roads,
    ranchForFarm: ranchForFarmMap,
    campfireTile: snapTo('camp', { x: 114, y: 108 }),
    waterfallTile: snapTo('waterfall', { x: 83, y: 59 }),
    volcanoCraterTile: snapTo('volcano', { x: 80, y: 11 }),
    casinoNeonTile: snapTo('casino', { x: 76, y: 116 }),
    weatherStationTile: snapTo('weather-station', { x: 114, y: 119 }),
    harborDockTile: snapTo('harbor', { x: 96, y: 105 }),
    harborBoardTile: snapTo('harbor', { x: 97, y: 108 }),
    auctionPodiumTile: snapTo('village', { x: 80, y: 80 }),
    noticeBoardTile: snapTo('village', { x: 79, y: 80 }),
    townSquare: scaleB({ minX: 78, minY: 79, maxX: 81, maxY: 82 }),
    fallbackCount,
  };
}

const DEFAULT_WORLD = generateWorld(WORLD_GEN_SEED);

export const REGIONS: readonly RegionDef[] = DEFAULT_WORLD.regions;
const ROADS: readonly RoadDef[] = DEFAULT_WORLD.roads;
/** Number of regions in the default world that fell back to all-land rect mask. */
export const WORLD_FALLBACK_COUNT: number = DEFAULT_WORLD.fallbackCount;

export const CAMPFIRE_TILE = DEFAULT_WORLD.campfireTile;
export const WATERFALL_TILE = DEFAULT_WORLD.waterfallTile;
export const VOLCANO_CRATER_TILE = DEFAULT_WORLD.volcanoCraterTile;
export const CASINO_NEON_TILE = DEFAULT_WORLD.casinoNeonTile;
export const WEATHER_STATION_TILE = DEFAULT_WORLD.weatherStationTile;
export const HARBOR_DOCK_TILE = DEFAULT_WORLD.harborDockTile;
export const HARBOR_BOARD_TILE = DEFAULT_WORLD.harborBoardTile;
export const AUCTION_PODIUM_TILE = DEFAULT_WORLD.auctionPodiumTile;
export const NOTICE_BOARD_TILE = DEFAULT_WORLD.noticeBoardTile;
export const TOWN_SQUARE = DEFAULT_WORLD.townSquare;

export function ranchForFarm(farmId: RegionId): RegionId | undefined {
  return DEFAULT_WORLD.ranchForFarm.get(farmId);
}

export function scaleAroundNearestIsland(t: { x: number; y: number }): { x: number; y: number } {
  return scaleAroundNearestIslandIn(t, DEFAULT_WORLD.regions);
}

function inBounds(
  x: number,
  y: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

export function regionMaskAt(region: RegionDef, x: number, y: number): boolean {
  if (!inBounds(x, y, region.bounds)) return false;
  if (region.mask === undefined) return true;
  const { minX, minY, maxX } = region.bounds;
  const w = maxX - minX + 1;
  return region.mask[(y - minY) * w + (x - minX)] === 1;
}

export function forEachLandTile(region: RegionDef, fn: (x: number, y: number) => void): void {
  const { minX, minY, maxX, maxY } = region.bounds;
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (regionMaskAt(region, tx, ty)) fn(tx, ty);
    }
  }
}

/**
 * Returns the mask=1 (land) tile within `region` nearest to `target` by
 * Euclidean distance. Tie-break: lowest y, then lowest x (deterministic).
 * If `target` is already on this region's land, returns it directly.
 *
 * Throws if the region has zero land tiles — that is a real bug (every region
 * keeps at least its forced-core tiles as land), never a silent fallback.
 */
export function nearestLandTile(
  region: RegionDef,
  target: { x: number; y: number },
): { x: number; y: number } {
  if (regionMaskAt(region, target.x, target.y)) return { x: target.x, y: target.y };

  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  forEachLandTile(region, (tx, ty) => {
    const d = (tx - target.x) ** 2 + (ty - target.y) ** 2;
    // Strict <: ties keep the earlier (lower y, then lower x) tile because
    // forEachLandTile iterates y-outer then x-inner ascending.
    if (d < bestD) {
      bestD = d;
      best = { x: tx, y: ty };
    }
  });

  if (best === null) {
    throw new Error(`nearestLandTile: region '${region.id}' has zero land tiles`);
  }
  return best;
}

export function regionAt(x: number, y: number): RegionId | null {
  for (const region of REGIONS) {
    if (regionMaskAt(region, x, y)) return region.id;
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

/**
 * Snaps a world-space point onto the nearest land tile, for DECORATIVE props
 * that have no fixed owning region. If the point is already walkable land it is
 * returned unchanged; otherwise it picks the region whose bounds-center is
 * nearest (Euclidean) and returns that region's nearest land tile.
 *
 * Used by placeProps/placeFootprint so cosmetic decorations never sit on a
 * carved-out ocean tile. Functional entities (stations) must NOT use this —
 * they assert land instead (see setup.ts).
 */
export function snapPropToLand(p: { x: number; y: number }): { x: number; y: number } {
  if (isWalkable(p.x, p.y) && regionAt(p.x, p.y) !== null) return { x: p.x, y: p.y };
  let bestRegion: RegionDef | null = null;
  let bestD = Infinity;
  for (const region of REGIONS) {
    const d = (region.center.x - p.x) ** 2 + (region.center.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestRegion = region;
    }
  }
  if (bestRegion === null) return { x: p.x, y: p.y };
  return nearestLandTile(bestRegion, p);
}

export function getRegion(id: RegionId): RegionDef {
  const region = REGIONS.find((r) => r.id === id);
  if (!region) throw new Error(`getRegion: unknown region id '${id}'`);
  return region;
}

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
