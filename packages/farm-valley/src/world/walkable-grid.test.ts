import { describe, it, expect } from 'vitest';
import { buildWalkableGrid } from './walkable-grid';
import { WORLD_WIDTH, WORLD_HEIGHT, REGIONS, ROADS } from './regions';

describe('buildWalkableGrid', () => {
  it('grid size matches WORLD_WIDTH * WORLD_HEIGHT', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells.length).toBe(WORLD_WIDTH * WORLD_HEIGHT);
    expect(grid.width).toBe(WORLD_WIDTH);
    expect(grid.height).toBe(WORLD_HEIGHT);
  });

  it('village center is walkable', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[39 * WORLD_WIDTH + 43]).toBe(0); // village center (43,39)
  });

  it('ocean tile at (0,0) is blocked', () => {
    // Archipelago: every non-region, non-road tile is ocean (blocked). The
    // top-left corner is open water with no island near it.
    const grid = buildWalkableGrid();
    expect(grid.cells[0 * WORLD_WIDTH + 0]).toBe(1);
  });

  it('bridge (road) tiles are walkable', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[38 * WORLD_WIDTH + 34]).toBe(0); // village ↔ carpentry
    expect(grid.cells[20 * WORLD_WIDTH + 42]).toBe(0); // village ↔ Pip
    expect(grid.cells[38 * WORLD_WIDTH + 54]).toBe(0); // village ↔ blacksmith
    expect(grid.cells[50 * WORLD_WIDTH + 42]).toBe(0); // village ↔ mill
  });

  it('resource zone tiles are walkable', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[7 * WORLD_WIDTH + 25]).toBe(0);  // forest-north interior (22-29,4-11)
    expect(grid.cells[7 * WORLD_WIDTH + 61]).toBe(0);  // quarry-north interior (58-65,4-11)
    expect(grid.cells[59 * WORLD_WIDTH + 25]).toBe(0); // forest-south interior
    expect(grid.cells[59 * WORLD_WIDTH + 61]).toBe(0); // quarry-south interior
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

  it('every region center is walkable and reachable from the village', () => {
    // Guards against a new region/road change that leaves a region as an
    // unreachable island — which would make agents endlessly re-path (and can
    // exhaust the pathfinder). BFS from the village center over walkable tiles.
    const grid = buildWalkableGrid();
    const W = WORLD_WIDTH;
    const idx = (x: number, y: number) => y * W + x;
    const walkable = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < WORLD_WIDTH && y < WORLD_HEIGHT && grid.cells[idx(x, y)] === 0;

    const start = idx(43, 39); // village center (88×80 archipelago)
    const seen = new Set<number>([start]);
    const queue: Array<[number, number]> = [[43, 39]];
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
  });
});
