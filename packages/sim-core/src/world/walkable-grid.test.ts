import { describe, it, expect } from 'vitest';
import { createRng } from '@engine/core';
import { buildWalkableGrid } from './walkable-grid';
import { WORLD_WIDTH, WORLD_HEIGHT, REGIONS, ROADS, EXTRA_FARM_COUNT, WORLD_GEN_SEED, getRegion } from './regions';
import { CLIFFS } from '../render-systems/geometry';

const VILLAGE = getRegion('village').center; // (80,80) in the radial layout

describe('buildWalkableGrid', () => {
  it('grid size matches WORLD_WIDTH * WORLD_HEIGHT', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells.length).toBe(WORLD_WIDTH * WORLD_HEIGHT);
    expect(grid.width).toBe(WORLD_WIDTH);
    expect(grid.height).toBe(WORLD_HEIGHT);
  });

  it('village center is walkable', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[VILLAGE.y * WORLD_WIDTH + VILLAGE.x]).toBe(0); // village center
  });

  it('ocean tile at (0,0) is blocked', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[0 * WORLD_WIDTH + 0]).toBe(1);
  });

  it('bridge (road) tiles are walkable', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[116 * WORLD_WIDTH + 108]).toBe(0); // village ↔ carpentry bridge (y∈{116,117})
    expect(grid.cells[132 * WORLD_WIDTH + 116]).toBe(0); // village ↔ mill (x∈{116,117})
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
    const mark = (b: { minX: number; minY: number; maxX: number; maxY: number }) => {
      for (let y = b.minY; y <= b.maxY; y++) {
        for (let x = b.minX; x <= b.maxX; x++) expected.add(y * WORLD_WIDTH + x);
      }
    };
    for (const r of REGIONS) mark(r.bounds);
    for (const road of ROADS) mark(road);

    const grid = buildWalkableGrid();
    let walkableCount = 0;
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] === 0) walkableCount++;
    }
    expect(walkableCount).toBe(expected.size);
  });

  it('no two island bodies are adjacent (≥1 ocean tile between every region pair)', () => {
    const touches = (
      a: { minX: number; minY: number; maxX: number; maxY: number },
      b: { minX: number; minY: number; maxX: number; maxY: number },
    ) => !(a.maxX + 1 < b.minX || b.maxX < a.minX - 1 || a.maxY + 1 < b.minY || b.maxY < a.minY - 1);

    for (let i = 0; i < REGIONS.length; i++) {
      for (let j = i + 1; j < REGIONS.length; j++) {
        const a = REGIONS[i]!;
        const b = REGIONS[j]!;
        expect(
          touches(a.bounds, b.bounds),
          `${a.id} and ${b.id} must be separated by ocean`,
        ).toBe(false);
      }
    }
  });

  it('jittered band farm bodies keep a ≥2-tile ocean margin (jitter budget holds)', () => {
    // Procedural band jitter ±1/axis from a 4-tile gutter; worst-case gap = 4−2×1 = 2.
    const band = REGIONS.filter((r) => /^farm-\d+$/.test(r.id));
    const oceanGap = (
      a: { minX: number; minY: number; maxX: number; maxY: number },
      b: { minX: number; minY: number; maxX: number; maxY: number },
    ) => {
      const gx = Math.max(b.minX - a.maxX - 1, a.minX - b.maxX - 1);
      const gy = Math.max(b.minY - a.maxY - 1, a.minY - b.maxY - 1);
      return Math.max(gx, gy);
    };
    for (let i = 0; i < band.length; i++) {
      for (let j = i + 1; j < band.length; j++) {
        const a = band[i]!;
        const b = band[j]!;
        expect(
          oceanGap(a.bounds, b.bounds),
          `${a.id} and ${b.id} must keep ≥2 ocean tiles`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('ring jitter is deterministic and the band sits on the two ring radii', () => {
    // Jitter is fork('farm-ring-jitter'); dx then dy, ±1. A seed/fork/draw-order change diverges here.
    const drawJitter = () => {
      const rng = createRng(WORLD_GEN_SEED).fork('farm-ring-jitter');
      return Array.from({ length: EXTRA_FARM_COUNT }, () => ({
        dx: rng.int(-1, 2),
        dy: rng.int(-1, 2),
      }));
    };
    const jitterA = drawJitter();
    const jitterB = drawJitter();
    expect(jitterB).toEqual(jitterA); // stable across independent draws

    const band = REGIONS.filter((r) => /^farm-\d+$/.test(r.id))
      .sort((a, b) => Number(a.id.slice(5)) - Number(b.id.slice(5)));
    expect(band).toHaveLength(EXTRA_FARM_COUNT);

    const CX = 120;
    const CY = 120;
    band.forEach((r, i) => {
      const ux = r.center.x - jitterA[i]!.dx;
      const uy = r.center.y - jitterA[i]!.dy;
      const radius = Math.hypot(ux - CX, uy - CY);
      const expected = i < 4 ? 78 : 108;
      // ±2 tolerance for integer rounding of the ring formula. The 30-tile gap cleanly separates inner/outer.
      expect(Math.abs(radius - expected), `farm-${i} un-jittered radius ${radius.toFixed(2)}`)
        .toBeLessThanOrEqual(2);
    });
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

  it('the camping island keeps a ≥2-tile ocean margin from every other region', () => {
    const camp = REGIONS.find((r) => r.id === 'camp')!;
    const oceanGap = (
      a: { minX: number; minY: number; maxX: number; maxY: number },
      b: { minX: number; minY: number; maxX: number; maxY: number },
    ) => {
      const gx = Math.max(b.minX - a.maxX - 1, a.minX - b.maxX - 1);
      const gy = Math.max(b.minY - a.maxY - 1, a.minY - b.maxY - 1);
      return Math.max(gx, gy);
    };
    for (const r of REGIONS) {
      if (r.id === 'camp') continue;
      expect(
        oceanGap(camp.bounds, r.bounds),
        `camp and ${r.id} must keep ≥2 ocean tiles`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('the waterfall island keeps a ≥2-tile ocean margin from every other region', () => {
    const waterfall = REGIONS.find((r) => r.id === 'waterfall')!;
    const oceanGap = (
      a: { minX: number; minY: number; maxX: number; maxY: number },
      b: { minX: number; minY: number; maxX: number; maxY: number },
    ) => {
      const gx = Math.max(b.minX - a.maxX - 1, a.minX - b.maxX - 1);
      const gy = Math.max(b.minY - a.maxY - 1, a.minY - b.maxY - 1);
      return Math.max(gx, gy);
    };
    for (const r of REGIONS) {
      if (r.id === 'waterfall') continue;
      expect(
        oceanGap(waterfall.bounds, r.bounds),
        `waterfall and ${r.id} must keep ≥2 ocean tiles`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('each heritage islet keeps a ≥2-tile ocean margin from every other region', () => {
    const oceanGap = (
      a: { minX: number; minY: number; maxX: number; maxY: number },
      b: { minX: number; minY: number; maxX: number; maxY: number },
    ) => {
      const gx = Math.max(b.minX - a.maxX - 1, a.minX - b.maxX - 1);
      const gy = Math.max(b.minY - a.maxY - 1, a.minY - b.maxY - 1);
      return Math.max(gx, gy);
    };
    for (const id of ['heritage-stones', 'heritage-ruin', 'heritage-statue'] as const) {
      const h = REGIONS.find((r) => r.id === id)!;
      for (const r of REGIONS) {
        if (r.id === id) continue;
        expect(
          oceanGap(h.bounds, r.bounds),
          `${id} and ${r.id} must keep ≥2 ocean tiles`,
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

  it('the shrine island keeps a ≥2-tile ocean margin from every other region', () => {
    const shrine = REGIONS.find((r) => r.id === 'shrine')!;
    const oceanGap = (
      a: { minX: number; minY: number; maxX: number; maxY: number },
      b: { minX: number; minY: number; maxX: number; maxY: number },
    ) => {
      const gx = Math.max(b.minX - a.maxX - 1, a.minX - b.maxX - 1);
      const gy = Math.max(b.minY - a.maxY - 1, a.minY - b.maxY - 1);
      return Math.max(gx, gy);
    };
    for (const r of REGIONS) {
      if (r.id === 'shrine') continue;
      expect(
        oceanGap(shrine.bounds, r.bounds),
        `shrine and ${r.id} must keep ≥2 ocean tiles`,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});
