import { describe, it, expect } from 'vitest';
import { createRng } from '@engine/core';
import { buildWalkableGrid } from './walkable-grid';
import { WORLD_WIDTH, WORLD_HEIGHT, REGIONS, ROADS, EXTRA_FARM_COUNT, WORLD_GEN_SEED, getRegion } from './regions';

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
    // Archipelago: every non-region, non-road tile is ocean (blocked). The
    // top-left corner is open water with no island near it.
    const grid = buildWalkableGrid();
    expect(grid.cells[0 * WORLD_WIDTH + 0]).toBe(1);
  });

  it('bridge (road) tiles are walkable', () => {
    const grid = buildWalkableGrid();
    // Every ROAD tile must be walkable. Spot-check the village hub spokes by
    // sampling the first tile of a couple of known cluster bridges, then assert
    // the whole road set is open.
    expect(grid.cells[76 * WORLD_WIDTH + 70]).toBe(0); // village ↔ carpentry ({69-74,76-77})
    expect(grid.cells[90 * WORLD_WIDTH + 77]).toBe(0); // village ↔ mill ({76-77,87-92})
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
    // The hand-pinned magic number (2065 pre-procedural-farms) no longer scales
    // now that the southern farm band is generated from EXTRA_FARM_COUNT. Instead
    // we recompute the expected walkable set from the same primitives the builder
    // uses (every region body + every road), independently of buildWalkableGrid,
    // and assert the two agree. This catches a builder bug while self-tracking
    // any change to the farm count or bridge layout.
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
    // Archipelago invariant: islands NEVER touch — they connect only via bridges
    // (ROADS). Two axis-aligned region rects are non-adjacent iff expanding one by
    // a 1-tile margin does not intersect the other (this also rejects diagonal
    // touches, which the shore/bridge renderer treats as adjacency too).
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
    // Brief 49 track 4: the procedural band is jittered ±1/axis from a 4-tile
    // gutter (pitch 14, size 10). The hard invariant is ≥2 ocean tiles between
    // any two band farm bodies (worst case 4 - 2*1 = 2). Stronger than the ≥1
    // no-adjacency test above; proves the jitter can never crowd two farms.
    const band = REGIONS.filter((r) => /^farm-\d+$/.test(r.id));
    // Chebyshev-style gap between two non-overlapping axis-aligned rects: the max
    // over axes of the inter-edge ocean-tile count. (If they overlap on an axis
    // the gap on that axis is negative; the binding separation is the other axis.)
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
    // The radial band layout is a pure function of the FIXED WORLD_GEN_SEED. The
    // per-farm jitter (fork 'farm-ring-jitter', draw order dx then dy, ±1) is
    // stable across draws; and after removing it every procedural farm center
    // lands on one of the two ring radii (R=52 inner for farm-0..3, R=72 outer
    // for farm-4..15) about the map center. A future Math.random()/Date.now(),
    // or a seed/fork/draw-order change, makes this diverge — fails loudly.
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

    // Recover each farm's un-jittered center by subtracting the recomputed jitter
    // and confirm its radius from the map center (80,80) matches its ring. The
    // farm body is 10×10 so its center is bounds.minX+4/minY+4; the un-jittered
    // center = midpoint(base bounds), recovered as live center − jitter offset.
    const CX = 80;
    const CY = 80;
    band.forEach((r, i) => {
      const ux = r.center.x - jitterA[i]!.dx;
      const uy = r.center.y - jitterA[i]!.dy;
      const radius = Math.hypot(ux - CX, uy - CY);
      const expected = i < 4 ? 52 : 72;
      // Allow ±2 for integer rounding of the ring formula (the body center floors
      // to minX+4 for a 10-wide farm, losing up to ~0.7 per axis). The 20-tile
      // gap between the two radii means ±2 still cleanly separates inner/outer.
      expect(Math.abs(radius - expected), `farm-${i} un-jittered radius ${radius.toFixed(2)}`)
        .toBeLessThanOrEqual(2);
    });
  });

  it('every region center is walkable and reachable from the village', () => {
    // Guards against a new region/road change that leaves a region as an
    // unreachable island — which would make agents endlessly re-path (and can
    // exhaust the pathfinder). BFS from the village center over walkable tiles.
    const grid = buildWalkableGrid();
    const W = WORLD_WIDTH;
    const idx = (x: number, y: number) => y * W + x;
    const walkable = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < WORLD_WIDTH && y < WORLD_HEIGHT && grid.cells[idx(x, y)] === 0;

    const start = idx(VILLAGE.x, VILLAGE.y); // village center (radial layout)
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

    // brief 50 — the shrine is a real region, walkable at its center, and
    // BFS-reachable from the village over its single quarry-north bridge.
    const shrine = REGIONS.find((r) => r.id === 'shrine');
    expect(shrine, 'shrine region exists').toBeTruthy();
    expect(walkable(shrine!.center.x, shrine!.center.y), 'shrine center walkable').toBe(true);
    expect(seen.has(idx(shrine!.center.x, shrine!.center.y)), 'shrine reachable from village').toBe(true);

    // brief 51 — the three decorative heritage islets are real regions, walkable
    // at their centers, and BFS-reachable from the village over their single
    // bridges (one to mushroom-grove, one to Atticus, one to Otto).
    for (const id of ['heritage-stones', 'heritage-ruin', 'heritage-statue'] as const) {
      const h = REGIONS.find((r) => r.id === id);
      expect(h, `${id} region exists`).toBeTruthy();
      expect(walkable(h!.center.x, h!.center.y), `${id} center walkable`).toBe(true);
      expect(seen.has(idx(h!.center.x, h!.center.y)), `${id} reachable from village`).toBe(true);
    }

    // brief 52 — the decorative ANIMATED waterfall islet is a real region,
    // walkable at its center, and BFS-reachable from the village over its single
    // quarry-north bridge.
    const waterfall = REGIONS.find((r) => r.id === 'waterfall');
    expect(waterfall, 'waterfall region exists').toBeTruthy();
    expect(walkable(waterfall!.center.x, waterfall!.center.y), 'waterfall center walkable').toBe(true);
    expect(seen.has(idx(waterfall!.center.x, waterfall!.center.y)), 'waterfall reachable from village').toBe(true);

    // brief 54 — the camping island is a real region, walkable at its center, and
    // BFS-reachable from the village over its single harbor bridge.
    const camp = REGIONS.find((r) => r.id === 'camp');
    expect(camp, 'camp region exists').toBeTruthy();
    expect(walkable(camp!.center.x, camp!.center.y), 'camp center walkable').toBe(true);
    expect(seen.has(idx(camp!.center.x, camp!.center.y)), 'camp reachable from village').toBe(true);
  });

  it('the camping island keeps a ≥2-tile ocean margin from every other region (brief 54)', () => {
    // The camp is a hand-placed landmark; assert the no-adjacency invariant holds
    // with the ≥2-tile margin against every other island body.
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

  it('the waterfall island keeps a ≥2-tile ocean margin from every other region (brief 52)', () => {
    // The waterfall is a hand-placed landmark; assert the no-adjacency invariant
    // holds with the ≥2-tile margin against every other island body.
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

  it('each heritage islet keeps a ≥2-tile ocean margin from every other region (brief 51)', () => {
    // The three heritage sites are hand-placed landmarks; assert the no-adjacency
    // invariant holds with the ≥2-tile margin against every other island body.
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

  it('the shrine island keeps a ≥2-tile ocean margin from every other region (brief 50)', () => {
    // The shrine is a hand-placed landmark; assert the no-adjacency invariant
    // holds with the ≥2-tile margin against every other island body.
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
