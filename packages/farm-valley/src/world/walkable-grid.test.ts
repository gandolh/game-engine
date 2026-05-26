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
    // Village: x ∈ [14..25], y ∈ [14..25]; center ~(19,19)
    const villageCenterX = 19;
    const villageCenterY = 19;
    expect(grid.cells[villageCenterY * WORLD_WIDTH + villageCenterX]).toBe(0);
  });

  it('void corner (0,0) is blocked', () => {
    const grid = buildWalkableGrid();
    expect(grid.cells[0 * WORLD_WIDTH + 0]).toBe(1);
  });

  it('road tiles are walkable', () => {
    const grid = buildWalkableGrid();
    // North road: x ∈ [18..21], y ∈ [12..13]
    expect(grid.cells[12 * WORLD_WIDTH + 19]).toBe(0);
    // East road: x ∈ [26..27], y ∈ [18..21]
    expect(grid.cells[19 * WORLD_WIDTH + 26]).toBe(0);
    // South road: x ∈ [18..21], y ∈ [26..27]
    expect(grid.cells[26 * WORLD_WIDTH + 20]).toBe(0);
    // West road: x ∈ [12..13], y ∈ [18..21]
    expect(grid.cells[20 * WORLD_WIDTH + 12]).toBe(0);
  });

  it('total walkable tile count matches expected layout', () => {
    // 4 farms × (12×12=144) = 576
    // + village × (12×12=144) = 144
    // + 4 roads:
    //   North road: 4 cols × 2 rows = 8
    //   East road:  2 cols × 4 rows = 8
    //   South road: 4 cols × 2 rows = 8
    //   West road:  2 cols × 4 rows = 8
    //   Total roads = 32
    // Grand total = 576 + 144 + 32 = 752
    const EXPECTED_WALKABLE = 752;

    const grid = buildWalkableGrid();
    let walkableCount = 0;
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] === 0) walkableCount++;
    }
    expect(walkableCount).toBe(EXPECTED_WALKABLE);
  });
});
