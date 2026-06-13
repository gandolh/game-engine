

export interface MetricStats {
  count: number; 
  mean: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  last: number;
}

export type ProfileReport = Record<string, MetricStats>;

interface Ring {
  readonly buf: Float64Array;
  head: number;   
  size: number;   
  total: number;  
  last: number;
}

const DEFAULT_CAPACITY = 240; 

export class Profiler {
  enabled: boolean; 

  private readonly capacity: number;
  private readonly rings = new Map<string, Ring>();
  private scratch: Float64Array; 

  constructor(opts: { enabled?: boolean; capacity?: number } = {}) {
    this.enabled = opts.enabled ?? false;
    this.capacity = opts.capacity ?? DEFAULT_CAPACITY;
    this.scratch = new Float64Array(this.capacity);
  }

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

  time<T>(key: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const t0 = performance.now();
    const out = fn();
    this.add(key, performance.now() - t0);
    return out;
  }

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
    const slice = this.scratch.subarray(0, n);
    slice.sort();
    const p50 = slice[Math.min(n - 1, Math.floor(n * 0.5))]!;
    const p95 = slice[Math.min(n - 1, Math.floor(n * 0.95))]!;

    return { count: ring.total, mean: sum / n, min, max, p50, p95, last: ring.last };
  }

  report(): ProfileReport {
    const out: ProfileReport = {};
    for (const key of this.rings.keys()) {
      const s = this.stats(key);
      if (s !== null) out[key] = s;
    }
    return out;
  }

  reset(): void {
    this.rings.clear();
  }
}
