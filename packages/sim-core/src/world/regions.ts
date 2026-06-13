import { createRng } from '@engine/core';

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
const farmJitterRng = createRng(WORLD_GEN_SEED).fork('farm-ring-jitter');
const FARM_JITTER: readonly { dx: number; dy: number }[] = Array.from(
  { length: EXTRA_FARM_COUNT },
  () => ({
    dx: farmJitterRng.int(-EXTRA_FARM_JITTER, EXTRA_FARM_JITTER + 1),
    dy: farmJitterRng.int(-EXTRA_FARM_JITTER, EXTRA_FARM_JITTER + 1),
  }),
);

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

const FARM_REGIONS: readonly RegionDef[] = BASE_REGIONS.filter((r) => r.kind === 'farm');

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

function placeRanches(baseRoads: readonly RoadDef[]): {
  ranches: RegionDef[];
  bridges: RoadDef[];
  cardinalByFarm: { farmId: RegionId; rank: number }[];
} {
  const ranches: RegionDef[] = [];
  const bridges: RoadDef[] = [];
  const cardinalByFarm: { farmId: RegionId; rank: number }[] = [];

  const placed: RegionDef[] = [...BASE_REGIONS];

  const placedBridges: RoadDef[] = [...baseRoads];
  const RANCH_DISTANCES = [12, 11, 13] as const;

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

const BASE_ROADS: readonly RoadDef[] = [
  ...generateClusterBridges(BASE_REGIONS),
  ...generateFarmSpokes(BASE_REGIONS),
];
const RANCH_PLACEMENT = placeRanches(BASE_ROADS);
const RANCH_REGIONS: readonly RegionDef[] = RANCH_PLACEMENT.ranches;
const RANCH_BRIDGES: readonly RoadDef[] = RANCH_PLACEMENT.bridges;

const RANCH_FOR_FARM = new Map<RegionId, RegionId>(
  FARM_REGIONS.map((farm, k) => [farm.id, `ranch-${k}` as RegionId]),
);

export function ranchForFarm(farmId: RegionId): RegionId | undefined {
  return RANCH_FOR_FARM.get(farmId);
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

export const REGIONS: readonly RegionDef[] = [...BASE_REGIONS, ...RANCH_REGIONS].map((r) => {
  const theme = THEME_BY_ID[r.id]
    ?? (r.kind === 'farm' ? 'ring' : r.kind === 'ranch' ? 'ranch' : undefined);
  return theme ? { ...r, theme } : r;
});

function authoredCenterOf(scaled: { x: number; y: number }): { x: number; y: number } {
  return {
    x: DESIGN_CX + (scaled.x - MAP_CX) / SCALE,
    y: DESIGN_CY + (scaled.y - MAP_CY) / SCALE,
  };
}

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

export const CAMPFIRE_TILE = scaleAroundNearestIsland({ x: 114, y: 108 });

export const WATERFALL_TILE = scaleAroundNearestIsland({ x: 83, y: 59 });

export const VOLCANO_CRATER_TILE = scaleAroundNearestIsland({ x: 80, y: 11 });

export const CASINO_NEON_TILE = scaleAroundNearestIsland({ x: 76, y: 116 });

export const WEATHER_STATION_TILE = scaleAroundNearestIsland({ x: 114, y: 119 });

export const HARBOR_DOCK_TILE = scaleAroundNearestIsland({ x: 96, y: 105 });

export const HARBOR_BOARD_TILE = scaleAroundNearestIsland({ x: 97, y: 108 });

const ROADS: readonly RoadDef[] = [
  ...BASE_ROADS,
  ...RANCH_BRIDGES,
];

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
