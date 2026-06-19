import { describe, it, expect } from 'vitest';
import {
  regionAt, isWalkable, REGIONS, EXTRA_FARM_COUNT, nearestResourceZone, getRegion,
  WORLD_WIDTH, WORLD_HEIGHT,
  generateWorld, WORLD_GEN_SEED, setActiveWorld, regionMaskAt, forEachLandTile,
  CAMPFIRE_TILE, WATERFALL_TILE, VOLCANO_CRATER_TILE, CASINO_NEON_TILE,
  WEATHER_STATION_TILE, HARBOR_DOCK_TILE, HARBOR_BOARD_TILE,
  AUCTION_PODIUM_TILE, NOTICE_BOARD_TILE, TOWN_SQUARE, ROADS,
} from './regions';
import { forcedCoreTiles } from './region-setup/anchors';

// Reset the active world to the default seed before each test (other suites may
// have swapped it via setActiveWorld / bootstrapSim).
function useDefaultWorld() {
  setActiveWorld(generateWorld(WORLD_GEN_SEED));
}

describe('regionAt (brief 93 — generated rect islands)', () => {
  useDefaultWorld();

  it('resolves every region center to that region', () => {
    for (const region of REGIONS) {
      const c = region.center;
      expect(regionAt(c.x, c.y), `${region.id} center`).toBe(region.id);
    }
  });

  it('every forced-core tile resolves to its region (carve never removes core)', () => {
    for (const region of REGIONS) {
      for (const core of forcedCoreTiles(region)) {
        expect(regionAt(core.x, core.y), `${region.id} core (${core.x},${core.y})`).toBe(region.id);
      }
    }
  });

  it('map corners are open ocean', () => {
    expect(regionAt(0, 0)).toBeNull();
    expect(regionAt(WORLD_WIDTH - 1, WORLD_HEIGHT - 1)).toBeNull();
  });

  it('bridge (road) tiles outside every region are walkable but region-less', () => {
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

  it('isWalkable matches regionAt !== null at region centers', () => {
    for (const region of REGIONS) {
      const c = region.center;
      expect(isWalkable(c.x, c.y)).toBe(regionAt(c.x, c.y) !== null);
    }
  });
});

describe('region roster', () => {
  useDefaultWorld();

  it('spawns EXTRA_FARM_COUNT farm-N regions plus 5 named farms', () => {
    const extra = REGIONS.filter((r) => /^farm-\d+$/.test(r.id));
    expect(extra).toHaveLength(EXTRA_FARM_COUNT);
    const fixedFarms = REGIONS.filter((r) => r.kind === 'farm' && !/^farm-\d+$/.test(r.id));
    expect(fixedFarms).toHaveLength(5);
  });

  it('every farm body is in-bounds, distinct-centered, and walkable at center', () => {
    const centers = new Set<string>();
    for (const f of REGIONS.filter((r) => r.kind === 'farm')) {
      expect(f.bounds.minX).toBeGreaterThanOrEqual(0);
      expect(f.bounds.minY).toBeGreaterThanOrEqual(0);
      expect(f.bounds.maxX).toBeLessThan(WORLD_WIDTH);
      expect(f.bounds.maxY).toBeLessThan(WORLD_HEIGHT);
      const key = `${f.center.x},${f.center.y}`;
      expect(centers.has(key), `${f.id} distinct center`).toBe(false);
      centers.add(key);
      expect(isWalkable(f.center.x, f.center.y), `${f.id} walkable`).toBe(true);
    }
  });

  it('every farm routes to a tree and a stone resource zone', () => {
    for (const f of REGIONS.filter((r) => r.kind === 'farm')) {
      expect(['forest-north', 'forest-south']).toContain(nearestResourceZone(f.center, 'tree'));
      expect(['quarry-north', 'quarry-south']).toContain(nearestResourceZone(f.center, 'stone'));
    }
  });
});

describe('generateWorld', () => {
  it('default seed deep-equals the installed default world', () => {
    useDefaultWorld();
    const w = generateWorld(WORLD_GEN_SEED);
    expect(w.regions).toEqual(REGIONS);
    expect(w.roads).toEqual(ROADS);
    expect(w.campfireTile).toEqual(CAMPFIRE_TILE);
    expect(w.harborDockTile).toEqual(HARBOR_DOCK_TILE);
    expect(w.townSquare).toEqual(TOWN_SQUARE);
  });

  it('is deterministic for a fixed seed', () => {
    const a = generateWorld(12345);
    const b = generateWorld(12345);
    expect(a).toEqual(b);
  });

  it('produces a valid, connected world for distinct seeds', () => {
    for (const seed of [1, 7, 0xabcdef, 0x1234]) {
      const w = generateWorld(seed);
      expect(w.regions.length).toBeGreaterThan(60);
      for (const region of w.regions) {
        expect(regionMaskAt(region, region.center.x, region.center.y)).toBe(true);
      }
    }
    useDefaultWorld();
  });
});

describe('region masks', () => {
  useDefaultWorld();

  it('every region has a mask sized to its bounds with land', () => {
    for (const region of REGIONS) {
      const { minX, minY, maxX, maxY } = region.bounds;
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      expect(region.mask, `${region.id} mask`).toBeDefined();
      expect(region.mask!.length).toBe(w * h);
      let landCount = 0;
      for (const byte of region.mask!) if (byte === 1) landCount++;
      expect(landCount, `${region.id} has land`).toBeGreaterThan(0);
    }
  });

  it('regionMaskAt is false outside the bounds rect', () => {
    for (const region of REGIONS) {
      const { minX, minY, maxX, maxY } = region.bounds;
      for (const s of [
        { x: minX - 1, y: minY }, { x: maxX + 1, y: maxY },
        { x: minX, y: minY - 1 }, { x: maxX, y: maxY + 1 },
      ]) {
        expect(regionMaskAt(region, s.x, s.y)).toBe(false);
      }
    }
  });

  it('forEachLandTile only visits mask-land tiles within bounds', () => {
    for (const region of REGIONS) {
      const { minX, minY, maxX, maxY } = region.bounds;
      const area = (maxX - minX + 1) * (maxY - minY + 1);
      let count = 0;
      forEachLandTile(region, (x, y) => {
        count++;
        expect(regionMaskAt(region, x, y)).toBe(true);
      });
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(area);
    }
  });

  it('light carve: most islands are notched (not perfect rects), few all-land', () => {
    // Brief 93: rect islands with carved corners. Expect the majority to have at
    // least one carved (0) tile, but they stay mostly-land (rect silhouette).
    let carved = 0;
    for (const region of REGIONS) {
      if (region.mask!.some((v) => v === 0)) carved++;
    }
    expect(carved).toBeGreaterThan(REGIONS.length * 0.4);
  });

  it('every forced-core tile is mask land', () => {
    for (const region of REGIONS) {
      for (const core of forcedCoreTiles(region)) {
        expect(regionMaskAt(region, core.x, core.y), `${region.id} core (${core.x},${core.y})`).toBe(true);
      }
    }
  });

  it('every exported tile const sits on land', () => {
    for (const [name, t] of [
      ['CAMPFIRE_TILE', CAMPFIRE_TILE], ['WATERFALL_TILE', WATERFALL_TILE],
      ['VOLCANO_CRATER_TILE', VOLCANO_CRATER_TILE], ['CASINO_NEON_TILE', CASINO_NEON_TILE],
      ['WEATHER_STATION_TILE', WEATHER_STATION_TILE], ['HARBOR_DOCK_TILE', HARBOR_DOCK_TILE],
      ['HARBOR_BOARD_TILE', HARBOR_BOARD_TILE], ['AUCTION_PODIUM_TILE', AUCTION_PODIUM_TILE],
      ['NOTICE_BOARD_TILE', NOTICE_BOARD_TILE],
    ] as Array<[string, { x: number; y: number }]>) {
      expect(regionAt(t.x, t.y), `${name} (${t.x},${t.y}) on land`).not.toBeNull();
    }
  });

  it('generateWorld(WORLD_GEN_SEED) twice produces identical masks', () => {
    const a = generateWorld(WORLD_GEN_SEED);
    const b = generateWorld(WORLD_GEN_SEED);
    expect(a.regions.length).toBe(b.regions.length);
    for (let i = 0; i < a.regions.length; i++) {
      expect(a.regions[i]!.id).toBe(b.regions[i]!.id);
      expect([...a.regions[i]!.mask!]).toEqual([...b.regions[i]!.mask!]);
    }
    useDefaultWorld();
  });
});
