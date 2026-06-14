import { describe, it, expect } from 'vitest';
import { createRng } from '@engine/core';
import { buildWalkableGrid } from './walkable-grid';
import {
  WORLD_WIDTH, WORLD_HEIGHT, REGIONS, ROADS, EXTRA_FARM_COUNT, WORLD_GEN_SEED,
  getRegion, forEachLandTile, type RegionDef,
} from './regions';
import { CLIFFS } from '../render-systems/geometry';

const VILLAGE = getRegion('village').center;

/** Collect a region's mask-land tiles (organic shape, not the bounds rect). */
function landTilesOf(region: RegionDef): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  forEachLandTile(region, (x, y) => out.push({ x, y }));
  return out;
}

/** Min Chebyshev distance between any land tile of A and any land tile of B. */
function minChebyshevBetween(a: RegionDef, b: RegionDef): number {
  const aLand = landTilesOf(a);
  const bLand = landTilesOf(b);
  let min = Infinity;
  for (const p of aLand) {
    for (const q of bLand) {
      const d = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
      if (d < min) min = d;
    }
  }
  return min;
}

describe('buildWalkableGrid', () => {
  it('grid size matches WORLD_WIDTH * WORLD_HEIGHT', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells.length).toBe(WORLD_WIDTH * WORLD_HEIGHT);
    expect(grid.width).toBe(WORLD_WIDTH);
    expect(grid.height).toBe(WORLD_HEIGHT);
  });

  it('village center is walkable', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[VILLAGE.y * WORLD_WIDTH + VILLAGE.x]).toBe(0); 
  });

  it('ocean tile at (0,0) is blocked', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[0 * WORLD_WIDTH + 0]).toBe(1);
  });

  it('bridge (road) tiles are walkable', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[116 * WORLD_WIDTH + 108]).toBe(0); 
    expect(grid.cells[132 * WORLD_WIDTH + 116]).toBe(0); 
    for (const road of ROADS) {
      for (let y = road.minY; y <= road.maxY; y++) {
        for (let x = road.minX; x <= road.maxX; x++) {
          expect(grid.cells[y * WORLD_WIDTH + x], `road tile (${x},${y})`).toBe(0);
        }
      }
    }
  });

  it('resource zone tiles are walkable', () => {
    const grid = buildWalkableGrid();
    for (const id of ['forest-north', 'quarry-north', 'forest-south', 'quarry-south'] as const) {
      const c = getRegion(id).center;
      expect(grid.cells[c.y * WORLD_WIDTH + c.x], `${id} center`).toBe(0);
    }
  });

  it('walkable count matches an independent recomputation from REGIONS + ROADS', () => {
    const expected = new Set<number>();
    const markRect = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
      for (let y = b.minY; y <= b.maxY; y++) {
        for (let x = b.minX; x <= b.maxX; x++) expected.add(y * WORLD_WIDTH + x);
      }
    };
    // Regions are organic masks now — sum mask-land tiles, not the bounds rect.
    for (const r of REGIONS) forEachLandTile(r, (x, y) => expected.add(y * WORLD_WIDTH + x));
    for (const road of ROADS) markRect(road);

    const grid = buildWalkableGrid();
    let walkableCount = 0;
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] === 0) walkableCount++;
    }
    expect(walkableCount).toBe(expected.size);
  });

  it('no two island bodies are adjacent (≥2 Chebyshev between every region pair, over MASK land)', () => {
    // Organic masks: compare actual land tiles, not bounds rects. Every land
    // tile of A must be Chebyshev ≥2 from every land tile of B (i.e. ≥1 ocean
    // tile between the bodies). The mask generator's cross-region adjacency
    // check enforces this; this guard proves it for the default world.
    //
    // Skip pairs that share a road bridge endpoint? No — roads are not regions,
    // so region land never includes road tiles. No special-casing needed.
    for (let i = 0; i < REGIONS.length; i++) {
      for (let j = i + 1; j < REGIONS.length; j++) {
        const a = REGIONS[i]!;
        const b = REGIONS[j]!;
        expect(
          minChebyshevBetween(a, b),
          `${a.id} and ${b.id} land must be Chebyshev ≥2 apart`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('jittered band farm bodies keep a ≥2 Chebyshev land margin (jitter budget holds)', () => {
    const band = REGIONS.filter((r) => /^farm-\d+$/.test(r.id));
    for (let i = 0; i < band.length; i++) {
      for (let j = i + 1; j < band.length; j++) {
        const a = band[i]!;
        const b = band[j]!;
        expect(
          minChebyshevBetween(a, b),
          `${a.id} and ${b.id} land must keep Chebyshev ≥2`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('ring jitter is deterministic (farm-ring-jitter draw reproduces)', () => {

    const drawJitter = () => {
      const rng = createRng(WORLD_GEN_SEED).fork('farm-ring-jitter');
      return Array.from({ length: EXTRA_FARM_COUNT }, () => ({
        dx: rng.int(-1, 2),
        dy: rng.int(-1, 2),
      }));
    };
    const jitterA = drawJitter();
    const jitterB = drawJitter();
    expect(jitterB).toEqual(jitterA);
  });

  it('placeRegions yields distinct, walkable farm-band centers (placement determinism)', () => {
    // The band is jittered off its base ring slots by placeRegions, so ring-radius
    // assertions no longer hold. Instead assert the placed band is well-formed:
    // every band center is distinct and walkable on the default grid.
    const grid = buildWalkableGrid();
    const idx = (x: number, y: number) => y * WORLD_WIDTH + x;
    const band = REGIONS.filter((r) => /^farm-\d+$/.test(r.id))
      .sort((a, b) => Number(a.id.slice(5)) - Number(b.id.slice(5)));
    expect(band).toHaveLength(EXTRA_FARM_COUNT);

    const seen = new Set<string>();
    for (const r of band) {
      const key = `${r.center.x},${r.center.y}`;
      expect(seen.has(key), `${r.id} center (${key}) distinct`).toBe(false);
      seen.add(key);
      expect(grid.cells[idx(r.center.x, r.center.y)], `${r.id} center walkable`).toBe(0);
    }
  });

  it('every region center is walkable and reachable from the village', () => {
    const grid = buildWalkableGrid();
    const W = WORLD_WIDTH;
    const idx = (x: number, y: number) => y * W + x;
    const walkable = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < WORLD_WIDTH && y < WORLD_HEIGHT && grid.cells[idx(x, y)] === 0;

    const start = idx(VILLAGE.x, VILLAGE.y);
    const seen = new Set<number>([start]);
    const queue: Array<[number, number]> = [[VILLAGE.x, VILLAGE.y]];
    while (queue.length > 0) {
      const [x, y] = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (!walkable(nx, ny) || seen.has(idx(nx, ny))) continue;
        seen.add(idx(nx, ny));
        queue.push([nx, ny]);
      }
    }

    for (const region of REGIONS) {
      const { x, y } = region.center;
      expect(walkable(x, y), `${region.id} center (${x},${y}) walkable`).toBe(true);
      expect(seen.has(idx(x, y)), `${region.id} center (${x},${y}) reachable from village`).toBe(true);
    }

    const shrine = REGIONS.find((r) => r.id === 'shrine');
    expect(shrine, 'shrine region exists').toBeTruthy();
    expect(walkable(shrine!.center.x, shrine!.center.y), 'shrine center walkable').toBe(true);
    expect(seen.has(idx(shrine!.center.x, shrine!.center.y)), 'shrine reachable from village').toBe(true);

    for (const id of ['heritage-stones', 'heritage-ruin', 'heritage-statue'] as const) {
      const h = REGIONS.find((r) => r.id === id);
      expect(h, `${id} region exists`).toBeTruthy();
      expect(walkable(h!.center.x, h!.center.y), `${id} center walkable`).toBe(true);
      expect(seen.has(idx(h!.center.x, h!.center.y)), `${id} reachable from village`).toBe(true);
    }

    const waterfall = REGIONS.find((r) => r.id === 'waterfall');
    expect(waterfall, 'waterfall region exists').toBeTruthy();
    expect(walkable(waterfall!.center.x, waterfall!.center.y), 'waterfall center walkable').toBe(true);
    expect(seen.has(idx(waterfall!.center.x, waterfall!.center.y)), 'waterfall reachable from village').toBe(true);

    const camp = REGIONS.find((r) => r.id === 'camp');
    expect(camp, 'camp region exists').toBeTruthy();
    expect(walkable(camp!.center.x, camp!.center.y), 'camp center walkable').toBe(true);
    expect(seen.has(idx(camp!.center.x, camp!.center.y)), 'camp reachable from village').toBe(true);
  });

  it('the camping island keeps a ≥2 Chebyshev land margin from every other region', () => {
    const camp = REGIONS.find((r) => r.id === 'camp')!;
    for (const r of REGIONS) {
      if (r.id === 'camp') continue;
      expect(
        minChebyshevBetween(camp, r),
        `camp and ${r.id} land must keep Chebyshev ≥2`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('the waterfall island keeps a ≥2 Chebyshev land margin from every other region', () => {
    const waterfall = REGIONS.find((r) => r.id === 'waterfall')!;
    for (const r of REGIONS) {
      if (r.id === 'waterfall') continue;
      expect(
        minChebyshevBetween(waterfall, r),
        `waterfall and ${r.id} land must keep Chebyshev ≥2`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('each heritage islet keeps a ≥2 Chebyshev land margin from every other region', () => {
    for (const id of ['heritage-stones', 'heritage-ruin', 'heritage-statue'] as const) {
      const h = REGIONS.find((r) => r.id === id)!;
      for (const r of REGIONS) {
        if (r.id === id) continue;
        expect(
          minChebyshevBetween(h, r),
          `${id} and ${r.id} land must keep Chebyshev ≥2`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('cliff tiles are all non-walkable (cliffs are purely visual and touch only ocean)', () => {
    const grid = buildWalkableGrid();
    for (const cliff of CLIFFS) {
      expect(
        grid.cells[cliff.ty * WORLD_WIDTH + cliff.tx],
        `cliff at (${cliff.tx},${cliff.ty}) frame=${cliff.frame} must be on a non-walkable ocean tile`,
      ).toBe(1);
    }
    expect(CLIFFS.length, 'CLIFFS must be non-empty').toBeGreaterThan(0);
  });

  it('the shrine island keeps a ≥2 Chebyshev land margin from every other region', () => {
    const shrine = REGIONS.find((r) => r.id === 'shrine')!;
    for (const r of REGIONS) {
      if (r.id === 'shrine') continue;
      expect(
        minChebyshevBetween(shrine, r),
        `shrine and ${r.id} land must keep Chebyshev ≥2`,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});
