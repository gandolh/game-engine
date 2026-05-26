import type { PathfinderGrid } from '@engine/core';
import { REGIONS, ROADS, WORLD_WIDTH, WORLD_HEIGHT } from './regions';

/**
 * Build once at startup; the layout doesn't change at runtime.
 * Returns a row-major Uint8Array of size WORLD_WIDTH * WORLD_HEIGHT.
 * 0 = walkable, 1 = blocked.
 * Walkable = any tile inside a region's bounds OR a road tile.
 */
export function buildWalkableGrid(): PathfinderGrid {
  const cells = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);

  // Fill everything as blocked (1) first
  cells.fill(1);

  // Mark region tiles as walkable (0)
  for (const region of REGIONS) {
    const { minX, minY, maxX, maxY } = region.bounds;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        cells[y * WORLD_WIDTH + x] = 0;
      }
    }
  }

  // Mark road tiles as walkable (0)
  for (const road of ROADS) {
    const { minX, minY, maxX, maxY } = road;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        cells[y * WORLD_WIDTH + x] = 0;
      }
    }
  }

  return { cells, width: WORLD_WIDTH, height: WORLD_HEIGHT };
}
