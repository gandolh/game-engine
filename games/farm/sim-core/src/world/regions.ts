import { createRng, type Rng } from '@engine/core';
import { WORLD_WIDTH, WORLD_HEIGHT } from './world-dims';
import { forcedCoreTiles } from './region-setup/anchors';
import { placeIslands, type RegionSpec } from './island-placement';
import { buildBridgeGraph } from './bridge-graph';
import { buildInventory, type InventoryRow } from './region-inventory';

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

export { WORLD_WIDTH, WORLD_HEIGHT };

export const WORLD_GEN_SEED = 0x5eed_face;

/** Re-exported from the region inventory (number of procedural extra farms). */
export { EXTRA_FARM_COUNT } from './region-inventory';

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

interface RoadDef {
  minX: number; minY: number; maxX: number; maxY: number;
}

function scaleAroundNearestIslandIn(
  t: { x: number; y: number },
  _regions: readonly RegionDef[],
): { x: number; y: number } {
  let bestDispX = 0;
  let bestDispY = 0;
  let bestD = Infinity;
  for (const d of ISLAND_DISPLACEMENT.values()) {
    const dd = (d.authored.x - t.x) ** 2 + (d.authored.y - t.y) ** 2;
    if (dd < bestD) {
      bestD = dd;
      bestDispX = d.dispX;
      bestDispY = d.dispY;
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
  /** Per-region authored→generated displacement (drives scaleAroundNearestIsland). */
  displacement: ReadonlyMap<RegionId, { authored: { x: number; y: number }; dispX: number; dispY: number }>;
}

/**
 * Loop-density for the overlap bridge graph (brief 93). 0 = spanning tree only;
 * higher adds more cyclic shortcut bridges. ~0.18 gives a connected world with a
 * handful of loops without crossing clutter.
 */
const BRIDGE_LOOP_DELTA = 0.18;

/** Number of seed-salts generateWorld tries before giving up on a connectable layout. */
const PLACE_SALT_BUDGET = 40;

export function generateWorld(seed: number): GeneratedWorld {
  const inventory = buildInventory();
  const specs = inventory.map((r) => r.spec);

  let lastErr: unknown = null;
  for (let salt = 0; salt < PLACE_SALT_BUDGET; salt++) {
    const saltSeed = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
    try {
      return buildWorldFromPlacement(saltSeed, inventory, specs);
    } catch (e) {
      lastErr = e;
      // This salt produced an unconnectable / unbuildable layout — try the next.
    }
  }
  throw new Error(
    `generateWorld: no connectable layout in ${PLACE_SALT_BUDGET} salts (seed ${seed}). ` +
      `Last: ${(lastErr as Error)?.message ?? lastErr}`,
  );
}

/**
 * Throws if any region center is not reachable (4-connected over land+road
 * tiles) from the village center. Operates on the freshly-built `regions`
 * (with masks) + `roads` — NOT the global REGIONS — so it can gate a candidate
 * placement before it is returned. Deterministic (BFS order is fixed).
 */
function assertAllRegionsReachable(
  regions: readonly RegionDef[],
  roads: readonly RoadDef[],
): void {
  const walk = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT); // 1 = walkable
  for (const reg of regions) {
    forEachLandTile(reg, (x, y) => { walk[y * WORLD_WIDTH + x] = 1; });
  }
  for (const road of roads) {
    for (let y = road.minY; y <= road.maxY; y++) {
      for (let x = road.minX; x <= road.maxX; x++) {
        if (x >= 0 && y >= 0 && x < WORLD_WIDTH && y < WORLD_HEIGHT) walk[y * WORLD_WIDTH + x] = 1;
      }
    }
  }

  const village = regions.find((r) => r.id === 'village');
  if (!village) throw new Error('assertAllRegionsReachable: no village');
  const start = village.center;
  const seen = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  const queue: number[] = [];
  let head = 0;
  const sk = start.y * WORLD_WIDTH + start.x;
  if (walk[sk] !== 1) throw new Error('assertAllRegionsReachable: village center not walkable');
  seen[sk] = 1;
  queue.push(sk);
  while (head < queue.length) {
    const k = queue[head++]!;
    const x = k % WORLD_WIDTH;
    const y = (k - x) / WORLD_WIDTH;
    const nbrs = [k - 1, k + 1, k - WORLD_WIDTH, k + WORLD_WIDTH];
    if (x === 0) nbrs[0] = -1;
    if (x === WORLD_WIDTH - 1) nbrs[1] = -1;
    for (const nk of nbrs) {
      if (nk < 0 || nk >= walk.length) continue;
      if (walk[nk] === 1 && seen[nk] === 0) { seen[nk] = 1; queue.push(nk); }
    }
  }

  for (const reg of regions) {
    const c = reg.center;
    if (seen[c.y * WORLD_WIDTH + c.x] !== 1) {
      throw new Error(`assertAllRegionsReachable: region '${reg.id}' center (${c.x},${c.y}) unreachable from village`);
    }
  }
}

/**
 * The ACTIVE world's per-region authored→generated displacement (brief 93). On-
 * island content authored in design space is translated by its owning island's
 * displacement so it rides with the island. Points at the active world's map
 * (set by setActiveWorld) — never diverges from REGIONS.
 */
type DisplacementMap = ReadonlyMap<RegionId, { authored: { x: number; y: number }; dispX: number; dispY: number }>;
let ISLAND_DISPLACEMENT: DisplacementMap = new Map();

/**
 * Light edge-carve: notch a seeded handful of the island's four corner regions
 * so the rect doesn't read as a perfect square. Carves at most a small triangle
 * from each corner, and NEVER clears a forced-core / bridge-attach tile.
 * Deterministic via the passed Rng.
 */
function carveCorners(
  mask: Uint8Array,
  minX: number,
  minY: number,
  w: number,
  h: number,
  coreSet: ReadonlySet<string>,
  rng: Rng,
): void {
  // Max carve depth scales with the smaller dimension but stays small (rect feel).
  const maxDepth = Math.max(1, Math.min(3, Math.floor(Math.min(w, h) / 6)));
  const corners: Array<[number, number]> = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
  ];
  for (const [cxLocal, cyLocal] of corners) {
    const depth = rng.int(0, maxDepth + 1); // 0 = leave this corner square
    if (depth === 0) continue;
    const sx = cxLocal === 0 ? 1 : -1;
    const sy = cyLocal === 0 ? 1 : -1;
    // Carve the triangular wedge: tiles within (depth - manhattan) of the corner.
    for (let dy = 0; dy < depth; dy++) {
      for (let dx = 0; dx < depth - dy; dx++) {
        const lx = cxLocal + sx * dx;
        const ly = cyLocal + sy * dy;
        if (lx < 0 || lx >= w || ly < 0 || ly >= h) continue;
        const wx = minX + lx;
        const wy = minY + ly;
        if (coreSet.has(`${wx},${wy}`)) continue; // never carve a pinned tile
        mask[ly * w + lx] = 0;
      }
    }
  }
}

function buildWorldFromPlacement(
  seed: number,
  inventory: readonly InventoryRow[],
  specs: readonly RegionSpec[],
): GeneratedWorld {
  // 1. BSP placement: rect bounds + center per region (brief 93). Reject a
  //    placement that couldn't reach the coverage band (a degenerate BSP
  //    partition with tiny leaves) so generateWorld's salt loop retries with a
  //    different partition. The post-carve guard test allows >0.45, so gate the
  //    raw rect coverage a touch above that.
  const placement = placeIslands(seed, specs);
  if (placement.coverage < 0.5) {
    throw new Error(`buildWorldFromPlacement: coverage ${(placement.coverage * 100).toFixed(1)}% below band`);
  }
  const islandById = new Map<RegionId, (typeof placement.islands)[number]>(
    placement.islands.map((i) => [i.id, i]),
  );

  // 2. Authored→generated displacement map: each region's authored design-space
  //    center maps to its generated center, so on-island content rides along.
  //    Stored on the returned world (NOT a module global) so it never diverges
  //    from the active REGIONS when setActiveWorld swaps worlds.
  const displacement = new Map<RegionId, { authored: { x: number; y: number }; dispX: number; dispY: number }>();
  for (const row of inventory) {
    const isl = islandById.get(row.id);
    if (!isl) throw new Error(`buildWorldFromPlacement: region '${row.id}' was not placed`);
    displacement.set(row.id, {
      authored: row.authoredCenter,
      dispX: isl.center.x - row.authoredCenter.x,
      dispY: isl.center.y - row.authoredCenter.y,
    });
  }

  // 3. Themed, unmasked region defs from the placement.
  const themeById = new Map<RegionId, RegionTheme | undefined>(
    inventory.map((r) => [r.id, r.theme]),
  );
  const allThemedUnmasked: RegionDef[] = placement.islands.map((isl) => {
    const theme = themeById.get(isl.id);
    const base: RegionDef = { id: isl.id, kind: isl.kind, bounds: isl.bounds, center: isl.center };
    return theme ? { ...base, theme } : base;
  });

  // 4. ranch-for-farm map (ranch-k pairs with the k-th farm by id order).
  const farmIds = allThemedUnmasked.filter((r) => r.kind === 'farm').map((r) => r.id);
  const ranchForFarmMap = new Map<RegionId, RegionId>(
    farmIds.map((id, k) => [id, `ranch-${k}` as RegionId]),
  );

  // 5. Bridge graph: straight axis-aligned overlap bridges + loops (brief 93).
  const bridge = buildBridgeGraph(
    placement.islands,
    createRng(seed).fork('bridges'),
    BRIDGE_LOOP_DELTA,
  );
  if (bridge === null) {
    throw new Error('buildWorldFromPlacement: islands not connectable with straight overlap bridges');
  }
  const roads: readonly RoadDef[] = bridge.roads.map((r) => ({ ...r }));

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

    // Light edge-carve (brief 93): islands are rects with a few notched/rounded
    // corner tiles so they don't read as perfect squares — NOT organic blobs.
    // Start all-land, then carve a seeded number of corner tiles, never touching
    // a forced-core or bridge-attach tile (those must stay land).
    const mask = new Uint8Array(w * h).fill(1);
    const coreSet = new Set(core.map((t) => `${t.x},${t.y}`));
    const carveRng = maskRng.fork('carve:' + themed.id);
    carveCorners(mask, minX, minY, w, h, coreSet, carveRng);

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

  // 9. Reachability guard. A placement can ROUTE every bridge yet still strand a
  //    region whose only bridge dead-ends on a mask-carved ocean tile (the
  //    corridor router exposes this). BFS over land+road tiles from the village
  //    center and throw if any region center is unreachable — generateWorld's
  //    salt loop then rejects this placement and tries the next. This is the
  //    single guarantee that "routes" ⇒ "connected".
  assertAllRegionsReachable(regions, roads);

  // 10. Derived tile consts. With seed-generated positions there is no fixed
  // world coordinate per anchor, so each is taken at a small offset from its
  // owning region's GENERATED center, then snapped onto that region's land (so
  // a carved corner never strands an anchor). Owning region by id; throws if
  // missing (a real bug). Offsets are deterministic and small.
  const regionById = (id: RegionId): RegionDef => {
    const r = regions.find((reg) => reg.id === id);
    if (!r) throw new Error(`generateWorld: missing region '${id}' for tile-const snap`);
    return r;
  };
  const snapNear = (id: RegionId, dx: number, dy: number): { x: number; y: number } => {
    const r = regionById(id);
    return nearestLandTile(r, { x: r.center.x + dx, y: r.center.y + dy });
  };

  const village = regionById('village');
  // TOWN_SQUARE: a small rect around the village center. Its only consumer
  // (static-layer backdropFrame) is gated by isWalkable() + regionAt==='village'
  // before the rect is tested, so ocean tiles inside it are never tinted.
  const townSquare = {
    minX: village.center.x - 2, minY: village.center.y - 1,
    maxX: village.center.x + 1, maxY: village.center.y + 2,
  };

  return {
    regions,
    roads,
    ranchForFarm: ranchForFarmMap,
    campfireTile: snapNear('camp', 1, 0),
    waterfallTile: snapNear('waterfall', 0, 0),
    volcanoCraterTile: snapNear('volcano', 0, -1),
    casinoNeonTile: snapNear('casino', 0, 0),
    weatherStationTile: snapNear('weather-station', 0, 0),
    harborDockTile: snapNear('harbor', 0, -1),
    harborBoardTile: snapNear('harbor', 1, 1),
    auctionPodiumTile: snapNear('village', 0, 0),
    noticeBoardTile: snapNear('village', -1, 0),
    townSquare,
    fallbackCount,
    displacement,
  };
}

/**
 * The ACTIVE world (brief 93). sim-core runs one world per process; bootstrap
 * calls setActiveWorld(generateWorld(seed)) to install a runtime-varying world.
 * Until then, the default-seed world is lazily generated on first access so a
 * runtime seed can replace it without ever building the default. The exported
 * REGIONS/ROADS/anchor-tile bindings are `let` so ES live-bindings propagate the
 * swap to every importer that reads them at call time.
 */
let ACTIVE_WORLD: GeneratedWorld | null = null;

export let REGIONS: readonly RegionDef[] = [];
export let ROADS: readonly RoadDef[] = [];
/** Number of regions in the active world that fell back to all-land rect mask. */
export let WORLD_FALLBACK_COUNT = 0;
export let CAMPFIRE_TILE = { x: 0, y: 0 };
export let WATERFALL_TILE = { x: 0, y: 0 };
export let VOLCANO_CRATER_TILE = { x: 0, y: 0 };
export let CASINO_NEON_TILE = { x: 0, y: 0 };
export let WEATHER_STATION_TILE = { x: 0, y: 0 };
export let HARBOR_DOCK_TILE = { x: 0, y: 0 };
export let HARBOR_BOARD_TILE = { x: 0, y: 0 };
export let AUCTION_PODIUM_TILE = { x: 0, y: 0 };
export let NOTICE_BOARD_TILE = { x: 0, y: 0 };
export let TOWN_SQUARE = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/** Installs the world for this process and refreshes all derived bindings. */
export function setActiveWorld(world: GeneratedWorld): void {
  ACTIVE_WORLD = world;
  REGIONS = world.regions;
  ROADS = world.roads;
  WORLD_FALLBACK_COUNT = world.fallbackCount;
  CAMPFIRE_TILE = world.campfireTile;
  WATERFALL_TILE = world.waterfallTile;
  VOLCANO_CRATER_TILE = world.volcanoCraterTile;
  CASINO_NEON_TILE = world.casinoNeonTile;
  WEATHER_STATION_TILE = world.weatherStationTile;
  HARBOR_DOCK_TILE = world.harborDockTile;
  HARBOR_BOARD_TILE = world.harborBoardTile;
  AUCTION_PODIUM_TILE = world.auctionPodiumTile;
  NOTICE_BOARD_TILE = world.noticeBoardTile;
  TOWN_SQUARE = world.townSquare;
  ISLAND_DISPLACEMENT = world.displacement;
  // Invalidate downstream module caches derived from region geometry. These are
  // registered by ports.ts/coral.ts AFTER their own module init, so the default
  // world built during regions.ts module-load (when those modules may be mid-
  // init in an import cycle) invalidates nothing — avoiding a TDZ on their cache
  // vars. Real per-run swaps from bootstrap run them.
  for (const cb of WORLD_SWAP_LISTENERS) cb();
}

const WORLD_SWAP_LISTENERS: Array<() => void> = [];
/** Register a callback invoked whenever setActiveWorld installs a new world. */
export function onWorldSwap(cb: () => void): void {
  WORLD_SWAP_LISTENERS.push(cb);
}

function activeWorld(): GeneratedWorld {
  if (ACTIVE_WORLD === null) setActiveWorld(generateWorld(WORLD_GEN_SEED));
  return ACTIVE_WORLD!;
}

export function ranchForFarm(farmId: RegionId): RegionId | undefined {
  return activeWorld().ranchForFarm.get(farmId);
}

export function scaleAroundNearestIsland(t: { x: number; y: number }): { x: number; y: number } {
  return scaleAroundNearestIslandIn(t, activeWorld().regions);
}

// Initialize the default-seed world at module load so importers that read the
// bindings without ever calling setActiveWorld (tests, tools) see a valid world.
activeWorld();

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

export type { RoadDef };
