import { describe, it, expect } from 'vitest';
import { buildWalkableGrid } from './walkable-grid';
import { WORLD_WIDTH, WORLD_HEIGHT, REGIONS } from './regions';

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

  it('total walkable tile count matches layout', () => {
    // Verified by independent BFS count: 1849 tiles. Archipelago (88×80): five
    // 12×12 farms (5×144=720) + 144 village + 2×100 craft islands + 4×64
    // resource zones + 80 mill + 2×4 wells + 2×64 seasonal zones + the bridge
    // network connecting all islands. Recompute if islands/bridges change.
    const EXPECTED_WALKABLE = 1849;
    const grid = buildWalkableGrid();
    let walkableCount = 0;
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] === 0) walkableCount++;
    }
    expect(walkableCount).toBe(EXPECTED_WALKABLE);
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
