import { describe, it, expect } from 'vitest';
import {
  regionAt, isWalkable, REGIONS, EXTRA_FARM_COUNT, nearestResourceZone, getRegion,
  WORLD_WIDTH, WORLD_HEIGHT,
  generateWorld, WORLD_GEN_SEED, regionMaskAt, forEachLandTile, WORLD_FALLBACK_COUNT,
  CAMPFIRE_TILE, WATERFALL_TILE, VOLCANO_CRATER_TILE, CASINO_NEON_TILE,
  WEATHER_STATION_TILE, HARBOR_DOCK_TILE, HARBOR_BOARD_TILE,
  AUCTION_PODIUM_TILE, NOTICE_BOARD_TILE, TOWN_SQUARE, ROADS,
  placeRegions, BASE_REGIONS,
} from './regions';
import { forcedCoreTiles } from './region-setup/anchors';

const centerOf = (id: string) => getRegion(id as never).center;

describe('regionAt', () => {
  it('resolves every region center and every forced-core tile to that region', () => {
    // Organic masks carve out bounds corners (they may be ocean), so we assert
    // the CENTER and every forcedCoreTiles tile — the tiles the mask guarantees
    // to keep as land — resolve to the region.
    for (const region of REGIONS) {
      const c = region.center;
      expect(regionAt(c.x, c.y), `${region.id} center`).toBe(region.id);
      for (const core of forcedCoreTiles(region)) {
        expect(regionAt(core.x, core.y), `${region.id} core (${core.x},${core.y})`).toBe(region.id);
      }
    }
  });

  it('places the village dead-center and the named farms on the inner ring', () => {
    expect(regionAt(centerOf('village').x, centerOf('village').y)).toBe('village');

    for (const id of ['farm-cora', 'farm-atticus', 'farm-hannah', 'farm-otto', 'farm-pip'] as const) {
      const c = centerOf(id);
      expect(regionAt(c.x, c.y)).toBe(id);
    }
  });

  it('returns null for open-ocean tiles between islands', () => {
    expect(regionAt(0, 0)).toBeNull();       
    expect(regionAt(WORLD_WIDTH - 1, WORLD_HEIGHT - 1)).toBeNull(); 
    expect(regionAt(120, 105)).toBeNull();   
    expect(regionAt(60, 60)).toBeNull();     
  });

  it('returns the blacksmith / shrine / landmark islets at their centers (walkable)', () => {
    for (const id of ['blacksmith', 'shrine', 'waterfall', 'camp', 'heritage-stones', 'heritage-ruin', 'heritage-statue'] as const) {
      const c = centerOf(id);
      expect(regionAt(c.x, c.y)).toBe(id);
      expect(isWalkable(c.x, c.y)).toBe(true);
    }
  });
});

describe('isWalkable', () => {
  it('is walkable for tiles inside regions', () => {
    for (const id of ['village', 'farm-cora', 'farm-atticus', 'farm-pip', 'farm-hannah', 'farm-otto'] as const) {
      const c = centerOf(id);
      expect(isWalkable(c.x, c.y), id).toBe(true);
    }
  });

  it('is walkable for bridge (road) tiles', () => {
    // Sample a road tile that sits outside every region's bounds (a true bridge
    // deck) and assert it is walkable but region-less. Coords aren't hardcoded —
    // region scatter moves bridges per seed — so we find one from ROADS.
    let checked = 0;
    for (const road of ROADS) {
      for (let y = road.minY; y <= road.maxY && checked < 5; y++) {
        for (let x = road.minX; x <= road.maxX && checked < 5; x++) {
          if (regionAt(x, y) === null) {
            expect(isWalkable(x, y)).toBe(true);
            checked++;
          }
        }
      }
      if (checked >= 5) break;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('is NOT walkable for open-ocean tiles', () => {
    expect(isWalkable(0, 0)).toBe(false);   
    expect(isWalkable(120, 105)).toBe(false); 
    expect(isWalkable(60, 60)).toBe(false); 
  });

  it('is walkable for blacksmith island tiles', () => {
    const c = centerOf('blacksmith');
    expect(isWalkable(c.x, c.y)).toBe(true);
  });

  it('isWalkable matches regionAt !== null for region tiles', () => {

    for (const region of REGIONS) {
      const { minX, minY, maxX, maxY } = region.bounds;
      const midX = Math.floor((minX + maxX) / 2);
      const midY = Math.floor((minY + maxY) / 2);
      expect(isWalkable(midX, midY)).toBe(regionAt(midX, midY) !== null);
    }
  });
});

describe('procedural farm band', () => {
  it('spawns exactly EXTRA_FARM_COUNT farm-N regions in addition to the 5 fixed farms', () => {
    const extra = REGIONS.filter((r) => /^farm-\d+$/.test(r.id));
    expect(extra).toHaveLength(EXTRA_FARM_COUNT);
    const fixedFarms = REGIONS.filter((r) => r.kind === 'farm' && !/^farm-\d+$/.test(r.id));
    expect(fixedFarms).toHaveLength(5); 
  });

  it('every procedural farm center resolves to its own region id and is walkable', () => {
    for (let i = 0; i < EXTRA_FARM_COUNT; i++) {
      const id = `farm-${i}` as const;
      const { center } = getRegion(id);
      expect(regionAt(center.x, center.y)).toBe(id);
      expect(isWalkable(center.x, center.y)).toBe(true);
    }
  });

  it('every band farm body stays within world bounds', () => {
    for (let i = 0; i < EXTRA_FARM_COUNT; i++) {
      const { bounds } = getRegion(`farm-${i}` as const);
      expect(bounds.minX, `farm-${i} minX`).toBeGreaterThanOrEqual(0);
      expect(bounds.minY, `farm-${i} minY`).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX, `farm-${i} maxX`).toBeLessThan(WORLD_WIDTH);
      expect(bounds.maxY, `farm-${i} maxY`).toBeLessThan(WORLD_HEIGHT);
    }
  });

  it('every band farm routes to a resource zone for both tree and stone', () => {
    for (let i = 0; i < EXTRA_FARM_COUNT; i++) {
      const { center } = getRegion(`farm-${i}` as const);
      expect(['forest-north', 'forest-south']).toContain(nearestResourceZone(center, 'tree'));
      expect(['quarry-north', 'quarry-south']).toContain(nearestResourceZone(center, 'stone'));
    }
  });

  it('placeRegions(seed) is deterministic (twice deep-equals)', () => {
    // placeRegions applies seeded jitter; the same seed+salt must reproduce the
    // exact same placement. (Ring-radius position is no longer guaranteed — the
    // band is jittered up to PLACE_JITTER tiles off its base ring slot.)
    const a = placeRegions(WORLD_GEN_SEED, BASE_REGIONS, 0);
    const b = placeRegions(WORLD_GEN_SEED, BASE_REGIONS, 0);
    expect(b).toEqual(a);
  });

  it('every procedural farm center is distinct and walkable', () => {
    const centers = new Set<string>();
    for (let i = 0; i < EXTRA_FARM_COUNT; i++) {
      const { center } = getRegion(`farm-${i}` as const);
      const key = `${center.x},${center.y}`;
      expect(centers.has(key), `farm-${i} center (${key}) is distinct`).toBe(false);
      centers.add(key);
      expect(isWalkable(center.x, center.y), `farm-${i} center walkable`).toBe(true);
      expect(regionAt(center.x, center.y), `farm-${i} center resolves to itself`).toBe(`farm-${i}`);
    }
  });
});

describe('generateWorld', () => {
  it('default seed deep-equals the re-exported default world', () => {
    const w = generateWorld(WORLD_GEN_SEED);
    expect(w.regions).toEqual(REGIONS);
    expect(w.roads).toEqual(ROADS);
    expect(w.campfireTile).toEqual(CAMPFIRE_TILE);
    expect(w.waterfallTile).toEqual(WATERFALL_TILE);
    expect(w.volcanoCraterTile).toEqual(VOLCANO_CRATER_TILE);
    expect(w.casinoNeonTile).toEqual(CASINO_NEON_TILE);
    expect(w.weatherStationTile).toEqual(WEATHER_STATION_TILE);
    expect(w.harborDockTile).toEqual(HARBOR_DOCK_TILE);
    expect(w.harborBoardTile).toEqual(HARBOR_BOARD_TILE);
    expect(w.auctionPodiumTile).toEqual(AUCTION_PODIUM_TILE);
    expect(w.noticeBoardTile).toEqual(NOTICE_BOARD_TILE);
    expect(w.townSquare).toEqual(TOWN_SQUARE);
  });

  it('is deterministic for a fixed seed', () => {
    const a = generateWorld(12345);
    const b = generateWorld(12345);
    expect(a).toEqual(b);
  });

  it('produces valid worlds for distinct seeds (every region center is walkable)', () => {
    for (const seed of [1, 7, 0xabcdef]) {
      const w = generateWorld(seed);
      expect(w.regions.length).toBeGreaterThan(0);
      for (const region of w.regions) {
        // regionAt on default REGIONS won't match arbitrary-seed regions, so test
        // mask self-consistency at each center instead.
        expect(regionMaskAt(region, region.center.x, region.center.y)).toBe(true);
      }
    }
  });
});

describe('region masks', () => {
  it('every region has a mask sized to its bounds with at least its core land', () => {
    for (const region of REGIONS) {
      const { minX, minY, maxX, maxY } = region.bounds;
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      expect(region.mask, `${region.id} mask`).toBeDefined();
      expect(region.mask!.length, `${region.id} length`).toBe(w * h);
      let landCount = 0;
      for (const byte of region.mask!) if (byte === 1) landCount++;
      expect(landCount, `${region.id} has land`).toBeGreaterThan(0);
    }
  });

  it('regionMaskAt is false for tiles outside the bounds rect', () => {
    for (const region of REGIONS) {
      const { minX, minY, maxX, maxY } = region.bounds;
      const outside = [
        { x: minX - 1, y: minY }, { x: maxX + 1, y: maxY },
        { x: minX, y: minY - 1 }, { x: maxX, y: maxY + 1 },
      ];
      for (const s of outside) {
        expect(regionMaskAt(region, s.x, s.y), `${region.id} (${s.x},${s.y}) OOB`).toBe(false);
      }
    }
  });

  it('forEachLandTile only visits mask-land tiles (subset of bounds area)', () => {
    for (const region of REGIONS) {
      const { minX, minY, maxX, maxY } = region.bounds;
      const area = (maxX - minX + 1) * (maxY - minY + 1);
      let count = 0;
      forEachLandTile(region, (x, y) => {
        count++;
        expect(regionMaskAt(region, x, y), `${region.id} (${x},${y}) is land`).toBe(true);
      });
      expect(count, `${region.id} land count > 0`).toBeGreaterThan(0);
      expect(count, `${region.id} land count <= area`).toBeLessThanOrEqual(area);
    }
  });

  // ── New Wave-2 guards ────────────────────────────────────────────────────

  it('(a) ≥80% of regions with area ≥36 have a non-all-1 (organic) mask', () => {
    let big = 0;
    let organic = 0;
    for (const region of REGIONS) {
      const { minX, minY, maxX, maxY } = region.bounds;
      const area = (maxX - minX + 1) * (maxY - minY + 1);
      if (area < 36) continue;
      big++;
      const allOnes = region.mask!.every((v) => v === 1);
      if (!allOnes) organic++;
    }
    const pct = (organic / big) * 100;
    // eslint-disable-next-line no-console
    console.log(`Organic (area>=36): ${organic}/${big} (${pct.toFixed(1)}%), WORLD_FALLBACK_COUNT=${WORLD_FALLBACK_COUNT}`);
    expect(pct).toBeGreaterThanOrEqual(80);
  });

  it('(b) WORLD_FALLBACK_COUNT is bounded (<= 4)', () => {
    expect(WORLD_FALLBACK_COUNT).toBeLessThanOrEqual(4);
  });

  it('(c) every forced-core tile of every region is mask land', () => {
    for (const region of REGIONS) {
      for (const core of forcedCoreTiles(region)) {
        expect(
          regionMaskAt(region, core.x, core.y),
          `${region.id} core (${core.x},${core.y}) must be land`,
        ).toBe(true);
      }
    }
  });

  it('(d) every exported tile const sits on land (regionAt !== null)', () => {
    const consts: Array<[string, { x: number; y: number }]> = [
      ['CAMPFIRE_TILE', CAMPFIRE_TILE],
      ['WATERFALL_TILE', WATERFALL_TILE],
      ['VOLCANO_CRATER_TILE', VOLCANO_CRATER_TILE],
      ['CASINO_NEON_TILE', CASINO_NEON_TILE],
      ['WEATHER_STATION_TILE', WEATHER_STATION_TILE],
      ['HARBOR_DOCK_TILE', HARBOR_DOCK_TILE],
      ['HARBOR_BOARD_TILE', HARBOR_BOARD_TILE],
      ['AUCTION_PODIUM_TILE', AUCTION_PODIUM_TILE],
      ['NOTICE_BOARD_TILE', NOTICE_BOARD_TILE],
    ];
    for (const [name, t] of consts) {
      expect(regionAt(t.x, t.y), `${name} (${t.x},${t.y}) on land`).not.toBeNull();
    }
  });

  it('(e) generateWorld(WORLD_GEN_SEED) twice produces identical masks', () => {
    const a = generateWorld(WORLD_GEN_SEED);
    const b = generateWorld(WORLD_GEN_SEED);
    expect(a.regions.length).toBe(b.regions.length);
    for (let i = 0; i < a.regions.length; i++) {
      const ra = a.regions[i]!;
      const rb = b.regions[i]!;
      expect(ra.id).toBe(rb.id);
      expect(ra.mask!.length).toBe(rb.mask!.length);
      for (let j = 0; j < ra.mask!.length; j++) {
        expect(ra.mask![j], `${ra.id} mask[${j}]`).toBe(rb.mask![j]);
      }
    }
  });
});

describe('nearestResourceZone', () => {
  it('routes northern (Cora/Atticus) farms to the north zones', () => {

    const cora = getRegion('farm-cora').center;
    expect(nearestResourceZone(cora, 'tree')).toBe('forest-north');
    expect(nearestResourceZone(cora, 'stone')).toBe('quarry-north');
    const atticus = getRegion('farm-atticus').center;
    expect(nearestResourceZone(atticus, 'tree')).toBe('forest-north');
  });

  it('routes southern farms to the south zones', () => {

    const otto = getRegion('farm-otto').center;
    expect(nearestResourceZone(otto, 'tree')).toBe('forest-south');
    expect(nearestResourceZone(otto, 'stone')).toBe('quarry-south');

    const south = getRegion('farm-9').center;
    expect(nearestResourceZone(south, 'tree')).toBe('forest-south');
    expect(nearestResourceZone(south, 'stone')).toBe('quarry-south');
  });
});
