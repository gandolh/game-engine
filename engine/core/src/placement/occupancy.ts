/**
 * Generic multi-tile footprint occupancy grid.
 *
 * Tracks which tiles are occupied by placed footprints. Generic: the engine
 * knows nothing about terrain semantics or building types — those are injected
 * by the game via a `buildable` predicate.
 *
 * All grid coordinates are integer tile indices (tx, ty).
 */

export interface Footprint {
  /** Top-left tile column */
  readonly x: number;
  /** Top-left tile row */
  readonly y: number;
  /** Width in tiles */
  readonly w: number;
  /** Height in tiles */
  readonly h: number;
}

export interface PlacementResult {
  readonly valid: boolean;
  /** Human-readable reason when invalid (for debug / tests) */
  readonly reason?: string;
}

/**
 * OccupancyGrid: a flat Uint8Array where each cell is either 0 (free)
 * or 1 (occupied). Separate from TerrainGrid — terrain is static,
 * occupancy changes as buildings are placed / demolished.
 */
export class OccupancyGrid {
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
  }

  isOccupied(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return true;
    return this.cells[ty * this.width + tx] !== 0;
  }

  /** Mark all tiles of a footprint as occupied (1). */
  apply(fp: Footprint): void {
    for (let dy = 0; dy < fp.h; dy++) {
      for (let dx = 0; dx < fp.w; dx++) {
        const tx = fp.x + dx;
        const ty = fp.y + dy;
        if (tx >= 0 && ty >= 0 && tx < this.width && ty < this.height) {
          this.cells[ty * this.width + tx] = 1;
        }
      }
    }
  }

  /** Clear all tiles of a footprint back to 0. */
  remove(fp: Footprint): void {
    for (let dy = 0; dy < fp.h; dy++) {
      for (let dx = 0; dx < fp.w; dx++) {
        const tx = fp.x + dx;
        const ty = fp.y + dy;
        if (tx >= 0 && ty >= 0 && tx < this.width && ty < this.height) {
          this.cells[ty * this.width + tx] = 0;
        }
      }
    }
  }
}

/**
 * Check whether a footprint can be placed.
 *
 * Rules (all must pass):
 * 1. Entire footprint is within grid bounds.
 * 2. No tile in the footprint is already occupied.
 * 3. Every tile passes the caller-supplied `buildable` predicate
 *    (terrain walkability, resource node rules, etc. — game decides).
 * 4. Optional `adjacency` hook — if provided, must return true; unused in Phase 1.
 *
 * @param fp           Footprint to test.
 * @param occ          Current occupancy grid.
 * @param buildable    (tx, ty) → true if the tile is buildable terrain.
 * @param adjacency    Optional extra constraint; omit to always pass.
 */
export function checkPlacement(
  fp: Footprint,
  occ: OccupancyGrid,
  buildable: (tx: number, ty: number) => boolean,
  adjacency?: (fp: Footprint, occ: OccupancyGrid) => boolean,
): PlacementResult {
  // 1. Bounds check
  if (
    fp.x < 0 ||
    fp.y < 0 ||
    fp.x + fp.w > occ.width ||
    fp.y + fp.h > occ.height
  ) {
    return { valid: false, reason: "out of bounds" };
  }

  // 2 & 3. Per-tile checks
  for (let dy = 0; dy < fp.h; dy++) {
    for (let dx = 0; dx < fp.w; dx++) {
      const tx = fp.x + dx;
      const ty = fp.y + dy;
      if (occ.isOccupied(tx, ty)) {
        return { valid: false, reason: `tile (${tx},${ty}) already occupied` };
      }
      if (!buildable(tx, ty)) {
        return { valid: false, reason: `tile (${tx},${ty}) not buildable` };
      }
    }
  }

  // 4. Adjacency hook
  if (adjacency !== undefined && !adjacency(fp, occ)) {
    return { valid: false, reason: "adjacency check failed" };
  }

  return { valid: true };
}

/**
 * Rebuild the walkable grid after a placement change.
 *
 * A tile is walkable if:
 *   - terrain is walkable (caller's predicate), AND
 *   - the tile is not occupied by a building footprint.
 *
 * Returns a fresh Uint8Array (1 = walkable, 0 = blocked).
 * Caller caches and invalidates as needed.
 *
 * @param width       Grid width in tiles.
 * @param height      Grid height in tiles.
 * @param occ         Current occupancy grid.
 * @param terrainWalkable  (tx, ty) → true if the tile's terrain is walkable.
 */
export function rebuildWalkable(
  width: number,
  height: number,
  occ: OccupancyGrid,
  terrainWalkable: (tx: number, ty: number) => boolean,
): Uint8Array {
  const grid = new Uint8Array(width * height);
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const idx = ty * width + tx;
      grid[idx] =
        terrainWalkable(tx, ty) && !occ.isOccupied(tx, ty) ? 1 : 0;
    }
  }
  return grid;
}
