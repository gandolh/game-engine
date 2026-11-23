/**
 * The ghost check on a uniform grid. A ghost candidate (an occludable sprite) is redrawn see-through when a
 * later sprite in the sorted queue overlaps it. The plain scan tests every later sprite; the grid tests only
 * the sprites in the cells the candidate's rectangle touches. The answer is the same for every candidate.
 */
import { spritesOverlap } from "../raster2d";
import type { Sprite } from "../sprite-types";

/** The plain check: any later, non-occludable, below-UI sprite that overlaps `g`. The reference the grid must match. */
export function ghostCoveredLinear(
  queue: readonly (Sprite | undefined)[],
  queueLen: number,
  queueIdx: number,
  g: Sprite,
  uiLayer: number,
): boolean {
  for (let jj = queueIdx + 1; jj < queueLen; jj += 1) {
    const o = queue[jj];
    if (o === undefined) continue;
    if (o.occludable || o.layer >= uiLayer) continue;
    if (spritesOverlap(g, o)) return true;
  }
  return false;
}

/**
 * The plain scan's work, in sprite tests, below which the grid does not pay for its build. Picked from two
 * measurements: Farm's bench scene (about 1,700 sprites, few after each occluder, scan about 0.003 ms against
 * 0.78 ms to build the grid) and the 300 x 4,000 worst case (about 1.2 million tests, scan 101 ms, grid 2.4 ms).
 * The build walks the whole queue about three times, so below a few thousand tests the scan is cheaper.
 */
export const GHOST_GRID_MIN_WORK = 20000;

/** The plain scan's work for a frame: the sum over candidates of the sprites after each one. O(candidates). */
export function ghostLinearWork(queueLen: number, candidates: readonly number[], candidateCount: number): number {
  let work = 0;
  for (let i = 0; i < candidateCount; i += 1) work += queueLen - 1 - (candidates[i] as number);
  return work;
}

const MAX_CELLS_PER_AXIS = 128;
const MIN_CELL = 4;

export class GhostGrid {
  private _cols = 1;
  private _rows = 1;
  private _cell = 1;
  private _minX = 0;
  private _minY = 0;
  // Compressed rows: `_start[c]..._start[c + 1]` indexes `_items`, queue indices ascending within a cell.
  private _start = new Int32Array(2);
  private _fill = new Int32Array(2);
  private _items = new Int32Array(0);
  private _queue: readonly (Sprite | undefined)[] = [];

  /**
   * Bucket every sprite that can cover a ghost (not occludable, below `uiLayer`) into the grid. `candidates` holds
   * the queue indices of the ghost candidates; their rectangles set the grid's extent along with the buckets'.
   * The arrays are reused from frame to frame.
   */
  build(
    queue: readonly (Sprite | undefined)[],
    queueLen: number,
    candidates: readonly number[],
    candidateCount: number,
    uiLayer: number,
  ): void {
    this._queue = queue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let widthSum = 0;
    let widthN = 0;
    for (let i = 0; i < candidateCount; i += 1) {
      const g = queue[candidates[i] as number];
      if (g === undefined) continue;
      widthSum += g.width;
      widthN += 1;
    }
    for (let i = 0; i < queueLen; i += 1) {
      const s = queue[i];
      if (s === undefined) continue;
      if (!s.occludable && s.layer >= uiLayer) continue;
      const y = s.z ? s.y - s.z : s.y;
      const l = s.x - s.width / 2;
      const r = s.x + s.width / 2;
      const t = y - s.height / 2;
      const b = y + s.height / 2;
      if (l < minX) minX = l;
      if (r > maxX) maxX = r;
      if (t < minY) minY = t;
      if (b > maxY) maxY = b;
    }
    if (!(maxX >= minX) || !(maxY >= minY)) {
      this._cols = 1;
      this._rows = 1;
      this._cell = 1;
      this._minX = 0;
      this._minY = 0;
      this._start[0] = 0;
      this._start[1] = 0;
      return;
    }

    // One occluder's width per cell, grown when the view would need more than the cap along an axis.
    let cell = widthN > 0 ? Math.max(MIN_CELL, widthSum / widthN) : 16;
    cell = Math.max(cell, (maxX - minX) / MAX_CELLS_PER_AXIS, (maxY - minY) / MAX_CELLS_PER_AXIS);
    this._cell = cell;
    this._minX = minX;
    this._minY = minY;
    this._cols = Math.floor((maxX - minX) / cell) + 1;
    this._rows = Math.floor((maxY - minY) / cell) + 1;
    const cells = this._cols * this._rows;
    if (this._start.length < cells + 1) {
      this._start = new Int32Array(cells + 1);
      this._fill = new Int32Array(cells + 1);
    }
    this._start.fill(0, 0, cells + 1);

    // Pass one counts the entries per cell, pass two places them in ascending queue order.
    let total = 0;
    for (let i = 0; i < queueLen; i += 1) {
      const s = queue[i];
      if (s === undefined || s.occludable || s.layer >= uiLayer) continue;
      const y = s.z ? s.y - s.z : s.y;
      const c0 = this._col(s.x - s.width / 2);
      const c1 = this._col(s.x + s.width / 2);
      const r0 = this._row(y - s.height / 2);
      const r1 = this._row(y + s.height / 2);
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) {
          this._start[r * this._cols + c + 1] = (this._start[r * this._cols + c + 1] as number) + 1;
          total += 1;
        }
      }
    }
    for (let c = 0; c < cells; c += 1) {
      this._start[c + 1] = (this._start[c + 1] as number) + (this._start[c] as number);
    }
    if (this._items.length < total) this._items = new Int32Array(Math.max(total, this._items.length * 2));
    for (let c = 0; c < cells; c += 1) this._fill[c] = this._start[c] as number;
    for (let i = 0; i < queueLen; i += 1) {
      const s = queue[i];
      if (s === undefined || s.occludable || s.layer >= uiLayer) continue;
      const y = s.z ? s.y - s.z : s.y;
      const c0 = this._col(s.x - s.width / 2);
      const c1 = this._col(s.x + s.width / 2);
      const r0 = this._row(y - s.height / 2);
      const r1 = this._row(y + s.height / 2);
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) {
          const cellIdx = r * this._cols + c;
          const at = this._fill[cellIdx] as number;
          this._items[at] = i;
          this._fill[cellIdx] = at + 1;
        }
      }
    }
  }

  private _col(x: number): number {
    const c = Math.floor((x - this._minX) / this._cell);
    return c < 0 ? 0 : c >= this._cols ? this._cols - 1 : c;
  }

  private _row(y: number): number {
    const r = Math.floor((y - this._minY) / this._cell);
    return r < 0 ? 0 : r >= this._rows ? this._rows - 1 : r;
  }

  /** Same answer as `ghostCoveredLinear` for the queue given to `build`: only sprites after `queueIdx` count. */
  covered(queueIdx: number, g: Sprite): boolean {
    const y = g.z ? g.y - g.z : g.y;
    const c0 = this._col(g.x - g.width / 2);
    const c1 = this._col(g.x + g.width / 2);
    const r0 = this._row(y - g.height / 2);
    const r1 = this._row(y + g.height / 2);
    const items = this._items;
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const cellIdx = r * this._cols + c;
        const end = this._start[cellIdx + 1] as number;
        // Entries ascend, so jump past the ones at or before the candidate.
        let lo = this._start[cellIdx] as number;
        let hi = end;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if ((items[mid] as number) <= queueIdx) lo = mid + 1;
          else hi = mid;
        }
        for (let at = lo; at < end; at += 1) {
          const o = this._queue[items[at] as number];
          if (o !== undefined && spritesOverlap(g, o)) return true;
        }
      }
    }
    return false;
  }
}
