/**
 * profiler.ts — tiny, dependency-free rolling-stats sampler for perf work.
 *
 * Both the sim Web Worker and the main render thread feed timing samples into a
 * Profiler; it keeps a fixed-size ring of recent samples per named metric and
 * derives count / mean / min / max / p50 / p95 on demand. No DOM, no globals —
 * so the exact same class runs in the worker (tick + snapshot timings) and on
 * the main thread (frame timings), and a snapshot of its numbers ships cleanly
 * over postMessage.
 *
 * This is a DIAGNOSTIC tool, gated by the caller (see Profiler.enabled). It never
 * touches sim state, so it has zero determinism impact: profiling is wall-clock
 * measurement of *display/host* timing, exactly like the worker's setInterval
 * pacing and the client's performance.now() interpolation clock.
 */

/** Derived statistics for one named metric over its current ring of samples. */
export interface MetricStats {
  /** Number of samples observed since the last reset (not the ring size). */
  count: number;
  mean: number;
  min: number;
  max: number;
  /** Median of the retained samples. */
  p50: number;
  /** 95th percentile of the retained samples. */
  p95: number;
  /** Most recent sample. */
  last: number;
}

/** A plain, structured-clone-friendly snapshot of every metric's stats. */
export type ProfileReport = Record<string, MetricStats>;

interface Ring {
  /** Fixed-capacity sample buffer (oldest overwritten once full). */
  readonly buf: Float64Array;
  /** Next write index into buf (wraps). */
  head: number;
  /** Live element count in buf (<= capacity). */
  size: number;
  /** Total samples ever added (the reported `count`). */
  total: number;
  last: number;
}

const DEFAULT_CAPACITY = 240; // ~4 s of ticks at 60 Hz, or 4 s of frames

/**
 * Collects timing samples under string keys and reports rolling stats. Cheap
 * enough to leave wired in; flip `enabled = false` to make add()/time() no-ops.
 */
export class Profiler {
  /** When false, add()/time() do nothing — keep it off in production paths. */
  enabled: boolean;

  private readonly capacity: number;
  private readonly rings = new Map<string, Ring>();
  /** Scratch buffer reused by stats() for percentile sorting (no per-call alloc). */
  private scratch: Float64Array;

  constructor(opts: { enabled?: boolean; capacity?: number } = {}) {
    this.enabled = opts.enabled ?? false;
    this.capacity = opts.capacity ?? DEFAULT_CAPACITY;
    this.scratch = new Float64Array(this.capacity);
  }

  /** Record one sample (e.g. a duration in ms, or a byte count) under `key`. */
  add(key: string, value: number): void {
    if (!this.enabled) return;
    let ring = this.rings.get(key);
    if (ring === undefined) {
      ring = {
        buf: new Float64Array(this.capacity),
        head: 0,
        size: 0,
        total: 0,
        last: 0,
      };
      this.rings.set(key, ring);
    }
    ring.buf[ring.head] = value;
    ring.head = (ring.head + 1) % this.capacity;
    if (ring.size < this.capacity) ring.size += 1;
    ring.total += 1;
    ring.last = value;
  }

  /**
   * Time the synchronous `fn`, record its duration in ms under `key`, and return
   * its result. When disabled, runs `fn` with no measurement overhead.
   */
  time<T>(key: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const t0 = performance.now();
    const out = fn();
    this.add(key, performance.now() - t0);
    return out;
  }

  /** Derived stats for one metric, or null if it has no samples. */
  stats(key: string): MetricStats | null {
    const ring = this.rings.get(key);
    if (ring === undefined || ring.size === 0) return null;

    const n = ring.size;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const v = ring.buf[i]!;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
      this.scratch[i] = v;
    }
    // Sort the live slice in place for percentile lookups.
    const slice = this.scratch.subarray(0, n);
    slice.sort();
    const p50 = slice[Math.min(n - 1, Math.floor(n * 0.5))]!;
    const p95 = slice[Math.min(n - 1, Math.floor(n * 0.95))]!;

    return { count: ring.total, mean: sum / n, min, max, p50, p95, last: ring.last };
  }

  /** Stats for every metric, as a structured-clone-friendly object. */
  report(): ProfileReport {
    const out: ProfileReport = {};
    for (const key of this.rings.keys()) {
      const s = this.stats(key);
      if (s !== null) out[key] = s;
    }
    return out;
  }

  /** Drop all retained samples (keeps the enabled flag). */
  reset(): void {
    this.rings.clear();
  }
}
