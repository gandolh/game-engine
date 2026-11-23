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
    const key = cellKey(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    bucket.push(id);
  }

  /** Drop all inserted bodies. */
  clear(): void {
    this.buckets.clear();
  }

  /** Drop all inserted bodies but keep the bucket arrays (emptied) for the next pass, so a hash rebuilt every
   *  iteration or frame allocates no buckets once its cells have been seen. Queries behave as after `clear()`. */
  reset(): void {
    for (const bucket of this.buckets.values()) bucket.length = 0;
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

  /**
   * `queryRadius` into a caller-owned array: `out` is emptied, filled with the same ids in the same ascending
   * order, and returned. Allocates nothing once `out` has grown. An id inserted more than once appears once,
   * as in `queryRadius`.
   */
  queryRadiusInto(x: number, y: number, r: number, out: number[]): number[] {
    out.length = 0;
    const size = this.cellSize;
    const cxMin = Math.floor((x - r) / size);
    const cyMin = Math.floor((y - r) / size);
    const cxMax = Math.floor((x + r) / size);
    const cyMax = Math.floor((y + r) / size);
    for (let cx = cxMin; cx <= cxMax; cx++) {
      for (let cy = cyMin; cy <= cyMax; cy++) {
        const bucket = this.buckets.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i] as number);
      }
    }
    out.sort(ascending);
    let w = 0;
    for (let i = 0; i < out.length; i++) {
      const id = out[i] as number;
      if (i === 0 || id !== out[w - 1]) out[w++] = id;
    }
    out.length = w;
    return out;
  }
}

function ascending(a: number, b: number): number {
  return a - b;
}
