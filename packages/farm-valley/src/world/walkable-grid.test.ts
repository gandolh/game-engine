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
    expect(grid.cells[19 * WORLD_WIDTH + 19]).toBe(0); // village center ~(19,19)
  });

  it('void tile at (0,12) is blocked', () => {
    // West edge gap between Otto's farm (y≥14) and carpentry (y≤9) — still void.
    // (12,0) is no longer void: the ice-pond region now covers x10-13, y0-3.
    const grid = buildWalkableGrid();
    expect(grid.cells[12 * WORLD_WIDTH + 0]).toBe(1);
  });

  it('road tiles are walkable', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[12 * WORLD_WIDTH + 19]).toBe(0); // North road
    expect(grid.cells[19 * WORLD_WIDTH + 26]).toBe(0); // East road
    expect(grid.cells[26 * WORLD_WIDTH + 20]).toBe(0); // South road
    expect(grid.cells[20 * WORLD_WIDTH + 12]).toBe(0); // West road
  });

  it('resource zone tiles are walkable', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[3 * WORLD_WIDTH + 41]).toBe(0);  // forest-north interior (38-45, shifted +12)
    expect(grid.cells[4 * WORLD_WIDTH + 49]).toBe(0);  // quarry-north interior (47-51, shifted +12)
    expect(grid.cells[29 * WORLD_WIDTH + 3]).toBe(0);  // forest-south interior
    expect(grid.cells[37 * WORLD_WIDTH + 4]).toBe(0);  // quarry-south interior
  });

  it('total walkable tile count matches layout', () => {
    // Verified by independent BFS count: 1447 tiles (world widened 40→52 and a
    // 5th 12×12 farm — Pip's — added; east cluster shifted +12).
    // Breakdown (approximate): 5×144 farms + 144 village + 100 blacksmith
    // + 100 carpentry + 64 forest-north + 50 quarry-north + 64 forest-south
    // + 50 quarry-south + 30 mill + 4 well-north + 4 well-south + 18 mushroom-grove
    // + 16 ice-pond + the road network connecting all regions.
    const EXPECTED_WALKABLE = 1447;
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

    const start = idx(19, 19); // village center
    const seen = new Set<number>([start]);
    const queue: Array<[number, number]> = [[19, 19]];
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
