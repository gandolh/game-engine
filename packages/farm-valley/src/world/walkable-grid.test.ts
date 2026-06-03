import { describe, it, expect } from 'vitest';
import { buildWalkableGrid } from './walkable-grid';
import { WORLD_WIDTH, WORLD_HEIGHT } from './regions';

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

  it('void tile at (12,0) is blocked', () => {
    // (0,0) is carpentry; (12,0) is between carpentry and Cora — void
    const grid = buildWalkableGrid();
    expect(grid.cells[0 * WORLD_WIDTH + 12]).toBe(1);
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
    expect(grid.cells[3 * WORLD_WIDTH + 29]).toBe(0);  // forest-north interior
    expect(grid.cells[4 * WORLD_WIDTH + 37]).toBe(0);  // quarry-north interior
    expect(grid.cells[29 * WORLD_WIDTH + 3]).toBe(0);  // forest-south interior
    expect(grid.cells[37 * WORLD_WIDTH + 4]).toBe(0);  // quarry-south interior
  });

  it('total walkable tile count matches layout', () => {
    // Verified by independent BFS count: 1257 tiles
    // Breakdown (approximate): 4×144 farms + 144 village + 100 blacksmith + 100 carpentry
    // + 64 forest-north + 50 quarry-north + 64 forest-south + 50 quarry-south
    // + road network connecting all regions
    const EXPECTED_WALKABLE = 1257;
    const grid = buildWalkableGrid();
    let walkableCount = 0;
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] === 0) walkableCount++;
    }
    expect(walkableCount).toBe(EXPECTED_WALKABLE);
  });
});
