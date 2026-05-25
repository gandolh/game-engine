/**
 * Spatial hash grid for 2D point queries.
 *
 * Buckets entries into uniform cells of size `cellSize`. Supports O(1)
 * amortized insert/update/remove and fast AABB / circle queries that scan
 * only the overlapping cells.
 *
 * Determinism: query results are always sorted ascending by `id`. Iteration
 * order of the underlying `Set` is not relied upon.
 */

export interface SpatialHashGridOptions {
  /** Edge length of one cell in world units. Must be > 0. */
  cellSize: number;
}

interface Entry {
  x: number;
  y: number;
  cellKey: string;
}

export class SpatialHashGrid {
  private readonly cellSize: number;
  private readonly cells = new Map<string, Set<number>>();
  private readonly entries = new Map<number, Entry>();

  constructor(options: SpatialHashGridOptions) {
    if (!(options.cellSize > 0) || !Number.isFinite(options.cellSize)) {
      throw new Error(
        `SpatialHashGrid: cellSize must be a positive finite number, got ${options.cellSize}`,
      );
    }
    this.cellSize = options.cellSize;
  }

  /**
   * Insert a new entry. Throws if `id` is already present — use `update`
   * to move an existing entry.
   */
  insert(id: number, x: number, y: number): void {
    if (this.entries.has(id)) {
      throw new Error(`SpatialHashGrid: id ${id} already inserted`);
    }
    const cellKey = this.keyFor(x, y);
    let bucket = this.cells.get(cellKey);
    if (!bucket) {
      bucket = new Set<number>();
      this.cells.set(cellKey, bucket);
    }
    bucket.add(id);
    this.entries.set(id, { x, y, cellKey });
  }

  /**
   * Move an existing entry to a new position. If the new position maps to
   * a different cell, the entry is removed from the old cell and added to
   * the new one. O(1) amortized.
   */
  update(id: number, x: number, y: number): void {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`SpatialHashGrid: cannot update unknown id ${id}`);
    }
    const newKey = this.keyFor(x, y);
    if (newKey !== entry.cellKey) {
      const oldBucket = this.cells.get(entry.cellKey);
      if (oldBucket) {
        oldBucket.delete(id);
        if (oldBucket.size === 0) {
          this.cells.delete(entry.cellKey);
        }
      }
      let newBucket = this.cells.get(newKey);
      if (!newBucket) {
        newBucket = new Set<number>();
        this.cells.set(newKey, newBucket);
      }
      newBucket.add(id);
      entry.cellKey = newKey;
    }
    entry.x = x;
    entry.y = y;
  }

  /** Remove an entry. No-op if id is not present. */
  remove(id: number): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const bucket = this.cells.get(entry.cellKey);
    if (bucket) {
      bucket.delete(id);
      if (bucket.size === 0) {
        this.cells.delete(entry.cellKey);
      }
    }
    this.entries.delete(id);
  }

  /** Drop all entries. */
  clear(): void {
    this.cells.clear();
    this.entries.clear();
  }

  /** Current number of inserted entries. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Returns all ids whose point falls within the closed AABB
   * [minX, maxX] x [minY, maxY], sorted ascending by id.
   */
  queryAabb(minX: number, minY: number, maxX: number, maxY: number): number[] {
    if (minX > maxX || minY > maxY) return [];

    const cx0 = Math.floor(minX / this.cellSize);
    const cy0 = Math.floor(minY / this.cellSize);
    const cx1 = Math.floor(maxX / this.cellSize);
    const cy1 = Math.floor(maxY / this.cellSize);

    const out: number[] = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const bucket = this.cells.get(`${cx},${cy}`);
        if (!bucket) continue;
        for (const id of bucket) {
          const e = this.entries.get(id);
          if (!e) continue;
          if (e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY) {
            out.push(id);
          }
        }
      }
    }
    out.sort((a, b) => a - b);
    return out;
  }

  /**
   * Returns all ids whose point lies within radius `r` of `(cx, cy)`,
   * sorted ascending by id. Performs a broad-phase AABB scan over the
   * overlapping cells then a narrow-phase squared-distance check.
   */
  queryCircle(cx: number, cy: number, r: number): number[] {
    if (!(r >= 0)) return [];

    const minX = cx - r;
    const minY = cy - r;
    const maxX = cx + r;
    const maxY = cy + r;

    const gx0 = Math.floor(minX / this.cellSize);
    const gy0 = Math.floor(minY / this.cellSize);
    const gx1 = Math.floor(maxX / this.cellSize);
    const gy1 = Math.floor(maxY / this.cellSize);

    const r2 = r * r;
    const out: number[] = [];
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const bucket = this.cells.get(`${gx},${gy}`);
        if (!bucket) continue;
        for (const id of bucket) {
          const e = this.entries.get(id);
          if (!e) continue;
          const dx = e.x - cx;
          const dy = e.y - cy;
          if (dx * dx + dy * dy <= r2) {
            out.push(id);
          }
        }
      }
    }
    out.sort((a, b) => a - b);
    return out;
  }

  private keyFor(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }
}
