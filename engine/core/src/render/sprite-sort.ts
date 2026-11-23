import type { Sprite } from "./sprite-types";

const DIGITS = 8; // y's four bytes, then the layer's four: least significant key first
const BUCKETS = 256;

/**
 * Orders a sprite queue exactly as `queue.slice().sort(compareSprite)` would: by `layer`, then by
 * `sortY ?? y`, and exact ties keep the order the sprites were pushed in.
 *
 * Two stages, neither of which runs a comparator over the whole queue:
 *
 * 1. A stable least-significant-byte radix sort on a coarse key: each of the layer and the sort y rounded
 *    to a float32 and mapped to an unsigned integer that sorts the same way. Rounding to float32 never
 *    reverses two values, it can only make unequal ones equal, so after this stage the queue is in exact
 *    order except inside groups that share a coarse key. A byte pass whose digit is the same for every
 *    sprite is skipped, and most are, since layers are small integers.
 * 2. An insertion pass with the exact comparator (layer, sort y, push index) over that result. It only moves
 *    sprites inside those groups, so it is close to linear. The push index makes the order total, so the
 *    result is the stable sort's, ties included.
 *
 * Every array is reused across frames.
 */
export class SpriteSorter {
  private _layerKey = new Float64Array(0);
  private _yKey = new Float64Array(0);
  private _layerCoarse = new Uint32Array(0);
  private _yCoarse = new Uint32Array(0);
  private _a = new Uint32Array(0);
  private _b = new Uint32Array(0);
  private _scratch: Sprite[] = [];
  private readonly _counts = new Uint32Array(DIGITS * BUCKETS);
  private readonly _f32 = new Float32Array(1);
  private readonly _u32 = new Uint32Array(this._f32.buffer);

  /**
   * Records the sort keys of the sprite pushed at queue index `i`. The renderer calls this from `push`,
   * while the sprite is still hot in the cache: reading its fields again at the end of the frame, across
   * thousands of sprites, was most of the sort's cost. The keys are the values at push time.
   */
  setKey(i: number, layer: number, y: number): void {
    if (i >= this._layerKey.length) this._grow(i + 1);
    this._layerKey[i] = layer;
    this._yKey[i] = y;
  }

  private _grow(min: number): void {
    const cap = Math.max(min, this._layerKey.length * 2, 256);
    const layerKey = new Float64Array(cap);
    const yKey = new Float64Array(cap);
    layerKey.set(this._layerKey);
    yKey.set(this._yKey);
    this._layerKey = layerKey;
    this._yKey = yKey;
    this._layerCoarse = new Uint32Array(cap);
    this._yCoarse = new Uint32Array(cap);
    this._a = new Uint32Array(cap);
    this._b = new Uint32Array(cap);
  }

  /** Reorders `queue[0, n)`. Every index below `n` must have had its key set since the frame began. */
  sort(queue: Sprite[], n: number): void {
    if (n < 2) return;
    const layerKey = this._layerKey;
    const yKey = this._yKey;
    const layerCoarse = this._layerCoarse;
    const yCoarse = this._yCoarse;
    const counts = this._counts;
    const f32 = this._f32;
    const u32 = this._u32;
    counts.fill(0);

    for (let i = 0; i < n; i += 1) {
      const layer = layerKey[i] as number;
      const y = yKey[i] as number;
      for (let k = 0; k < 2; k += 1) {
        // `+ 0` turns -0 into +0: the comparator calls them equal.
        f32[0] = (k === 0 ? layer : y) + 0;
        const bits = u32[0] as number;
        const c = (bits >>> 31 === 1 ? ~bits : bits | 0x80000000) >>> 0;
        if (k === 0) layerCoarse[i] = c;
        else yCoarse[i] = c;
        const base = (1 - k) * 4 * BUCKETS; // y's digits are 0-3, the layer's 4-7
        const c0 = base + (c & 255);
        const c1 = base + BUCKETS + ((c >>> 8) & 255);
        const c2 = base + 2 * BUCKETS + ((c >>> 16) & 255);
        const c3 = base + 3 * BUCKETS + (c >>> 24);
        counts[c0] = (counts[c0] as number) + 1;
        counts[c1] = (counts[c1] as number) + 1;
        counts[c2] = (counts[c2] as number) + 1;
        counts[c3] = (counts[c3] as number) + 1;
      }
    }

    let src = this._a;
    let dst = this._b;
    for (let i = 0; i < n; i += 1) src[i] = i;

    // Push order is often close to sorted already, runs of tiles in row order. Try the exact insertion
    // pass on it first, with a budget of shifts so a shuffled frame costs little before the radix sort.
    if (this._insertionPass(src, n, n * 2)) {
      this._gather(queue, src, n);
      return;
    }
    for (let i = 0; i < n; i += 1) src[i] = i;

    for (let d = 0; d < DIGITS; d += 1) {
      const base = d * BUCKETS;
      const keys = d < 4 ? yCoarse : layerCoarse;
      const shift = (d & 3) * 8;
      const firstDigit = ((keys[src[0] as number] as number) >>> shift) & 255;
      if (counts[base + firstDigit] === n) continue; // every sprite has the same digit
      let sum = 0;
      for (let b = 0; b < BUCKETS; b += 1) {
        const c = counts[base + b] as number;
        counts[base + b] = sum;
        sum += c;
      }
      for (let i = 0; i < n; i += 1) {
        const idx = src[i] as number;
        const digit = ((keys[idx] as number) >>> shift) & 255;
        const at = counts[base + digit] as number;
        counts[base + digit] = at + 1;
        dst[at] = idx;
      }
      const t = src;
      src = dst;
      dst = t;
    }
    this._insertionPass(src, n, Infinity);
    this._gather(queue, src, n);
  }

  private _gather(queue: Sprite[], perm: Uint32Array, n: number): void {
    const scratch = this._scratch;
    for (let i = 0; i < n; i += 1) scratch[i] = queue[perm[i] as number] as Sprite;
    for (let i = 0; i < n; i += 1) queue[i] = scratch[i] as Sprite;
    // Don't keep sprites alive past the frame.
    scratch.length = 0;
  }

  /**
   * Exact insertion sort of `perm[0, n)` by (layer, sort y, push index). Returns false if it needed more
   * than `budget` shifts; `perm` is still a permutation then, only not sorted.
   */
  private _insertionPass(perm: Uint32Array, n: number, budget: number): boolean {
    let shifts = 0;
    const layerKey = this._layerKey;
    const yKey = this._yKey;
    for (let i = 1; i < n; i += 1) {
      const v = perm[i] as number;
      const vl = layerKey[v] as number;
      const vy = yKey[v] as number;
      let j = i - 1;
      while (j >= 0) {
        const p = perm[j] as number;
        const pl = layerKey[p] as number;
        if (pl < vl) break;
        if (pl === vl) {
          const py = yKey[p] as number;
          if (py < vy || (py === vy && p < v)) break;
        }
        perm[j + 1] = p;
        j -= 1;
      }
      perm[j + 1] = v;
      shifts += i - 1 - j;
      if (shifts > budget) return false;
    }
    return true;
  }
}
