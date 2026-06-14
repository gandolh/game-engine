import type { PathfinderGrid } from '@engine/core';
import { REGIONS, ROADS, WORLD_WIDTH, WORLD_HEIGHT, forEachLandTile } from './regions';

/** Row-major Uint8Array (WORLD_WIDTH×WORLD_HEIGHT): 0 = walkable, 1 = blocked. Build once at startup. */
export function buildWalkableGrid(): PathfinderGrid {
  const cells = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  cells.fill(1);
  for (const region of REGIONS) {
    forEachLandTile(region, (x, y) => { cells[y * WORLD_WIDTH + x] = 0; });
  }
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
