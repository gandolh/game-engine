/**
 * Uniform-grid broad-phase spatial index for 2D point/body queries.
 *
 * Generic and game-agnostic: this is the dynamic-body complement to
 * `placement/occupancy.ts`'s STATIC tile-footprint grid. Where
 * `OccupancyGrid` answers "is this tile occupied by a fixed building",
 * `SpatialHash` answers "which inserted bodies are near this point" for
 * MOVING bodies (agents, projectiles, anything not pinned to an integer
 * tile grid) — the broad-phase step before an exact narrow-phase test
 * (e.g. `circlesOverlap`).
 *
 * Deterministic by construction: `queryRadius` always returns ids sorted
 * ascending, never in bucket/insertion order, so callers that iterate the
 * result get a stable, reproducible order regardless of insertion order or
 * hash-bucket layout. No randomness, no wall-clock reads.
 */

/** A cell coordinate key, packed as a single number for Map lookups. Uses a
 *  wide multiplier so cell coordinates (which may be negative) never
 *  collide across the two axes for any realistic world size. */
function cellKey(cx: number, cy: number): number {
  // Shift into a large positive range before packing so negative cell
  // coordinates don't collide with positive ones near zero.
  const SHIFT = 1 << 20;
  return (cx + SHIFT) * (1 << 22) + (cy + SHIFT);
}

export class SpatialHash {
  private readonly cellSize: number;
  private readonly buckets = new Map<number, number[]>();
  /** id -> (x, y) at insertion time, kept so `clear()` can reset cheaply and
   *  so future incremental-update APIs (not needed yet) have a source of
   *  truth. */
  private readonly positions = new Map<number, { x: number; y: number }>();

  constructor(cellSize: number) {
    if (!(cellSize > 0)) {
      throw new Error(`SpatialHash: cellSize must be > 0, got ${cellSize}`);
    }
    this.cellSize = cellSize;
  }

  private cellOf(x: number, y: number): [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(y / this.cellSize)];
  }

  /** Insert (or re-insert) a body at `(x, y)` under `id`. Re-inserting an
   *  existing id does NOT remove its previous bucket entry — call `clear()`
   *  and re-insert all bodies for a fresh query pass each tick/frame
   *  (the expected usage: rebuild from current positions, don't mutate). */
  insert(id: number, x: number, y: number): void {
    const [cx, cy] = this.cellOf(x, y);
    const key = cellKey(cx, cy);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    bucket.push(id);
    this.positions.set(id, { x, y });
  }

  /** Drop all inserted bodies. */
  clear(): void {
    this.buckets.clear();
    this.positions.clear();
  }

  /**
   * Broad-phase query: return the ids of every inserted body whose cell
   * falls within the square neighborhood covering a circle of radius `r`
   * centered at `(x, y)`. This is a CONSERVATIVE over-approximation (it may
   * include bodies slightly further than `r` away, near cell corners) — the
   * caller is expected to do an exact narrow-phase distance test (e.g.
   * `circlesOverlap`) on the returned ids.
   *
   * Returns ids sorted ascending (deterministic — never bucket order).
   */
  queryRadius(x: number, y: number, r: number): number[] {
    const [cxMin, cyMin] = this.cellOf(x - r, y - r);
    const [cxMax, cyMax] = this.cellOf(x + r, y + r);
    const found = new Set<number>();
    for (let cx = cxMin; cx <= cxMax; cx++) {
      for (let cy = cyMin; cy <= cyMax; cy++) {
        const bucket = this.buckets.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (const id of bucket) found.add(id);
      }
    }
    return Array.from(found).sort((a, b) => a - b);
  }
}
