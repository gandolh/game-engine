/**
 * Frame statistics for the shared profiler (corpus brief 05): pure functions over sample arrays, plus a
 * fixed-capacity ring that keeps samples in arrival order.
 *
 * Two things are counted apart. **Display ticks** are `requestAnimationFrame` callbacks: their spacing is
 * the frame interval the player sees. **Frames drawn** are the game's own draw calls: their cost is the
 * CPU frame time. They differ in a game whose loop is not paced by the display.
 */

/** A long frame on a 60 Hz display: it missed one refresh. */
export const LONG_FRAME_MS = 1000 / 60;
/** A very long frame: it missed two refreshes or more. */
export const VERY_LONG_FRAME_MS = 1000 / 30;

/** The frame interval, from display ticks. */
export interface FrameIntervalStats {
  /** Intervals measured (one fewer than the display ticks they span). */
  samples: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  /** Share of intervals over 16.7 ms, from 0 to 1. */
  over16_7: number;
  /** Share of intervals over 33.3 ms, from 0 to 1. */
  over33_3: number;
  /** Display ticks per second over the measured span. */
  fps: number;
}

/** The CPU cost of the frames the game drew. */
export interface FramesDrawnStats {
  frames: number;
  meanMs: number;
  p95Ms: number;
  /** Frames drawn per second over `spanMs`. */
  fps: number;
}

/**
 * The nearest-rank percentile of an ascending array: the smallest value with at least `p` of the samples
 * at or below it. `p` is from 0 to 1. Returns 0 for an empty array.
 */
export function percentile(sortedAscending: ArrayLike<number>, p: number): number {
  const n = sortedAscending.length;
  if (n === 0) return 0;
  const rank = Math.ceil(p * n);
  const index = Math.min(n - 1, Math.max(0, rank - 1));
  return sortedAscending[index] ?? 0;
}

function sortedCopy(values: ArrayLike<number>): Float64Array {
  const copy = Float64Array.from(values);
  copy.sort();
  return copy;
}

/** Summarizes frame intervals in milliseconds. An empty input gives all zeros. */
export function summarizeIntervals(intervalsMs: ArrayLike<number>): FrameIntervalStats {
  const n = intervalsMs.length;
  if (n === 0) return { samples: 0, mean: 0, p50: 0, p95: 0, p99: 0, over16_7: 0, over33_3: 0, fps: 0 };
  let sum = 0;
  let long = 0;
  let veryLong = 0;
  for (let i = 0; i < n; i += 1) {
    const v = intervalsMs[i] ?? 0;
    sum += v;
    if (v > LONG_FRAME_MS) long += 1;
    if (v > VERY_LONG_FRAME_MS) veryLong += 1;
  }
  const sorted = sortedCopy(intervalsMs);
  return {
    samples: n,
    mean: sum / n,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    over16_7: long / n,
    over33_3: veryLong / n,
    fps: sum > 0 ? (n * 1000) / sum : 0,
  };
}

/** Summarizes the CPU time of drawn frames, with the rate over the span they were drawn in. */
export function summarizeFramesDrawn(cpuMs: ArrayLike<number>, spanMs: number): FramesDrawnStats {
  const n = cpuMs.length;
  if (n === 0) return { frames: 0, meanMs: 0, p95Ms: 0, fps: 0 };
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += cpuMs[i] ?? 0;
  return {
    frames: n,
    meanMs: sum / n,
    p95Ms: percentile(sortedCopy(cpuMs), 0.95),
    fps: spanMs > 0 ? (n * 1000) / spanMs : 0,
  };
}

/** A fixed-capacity ring of numbers. When full, a push drops the oldest sample. */
export class SampleRing {
  private readonly buf: Float64Array;
  private head = 0;
  private size = 0;

  constructor(capacity: number) {
    this.buf = new Float64Array(Math.max(1, capacity));
  }

  get length(): number {
    return this.size;
  }

  push(value: number): void {
    this.buf[this.head] = value;
    this.head = (this.head + 1) % this.buf.length;
    if (this.size < this.buf.length) this.size += 1;
  }

  /** The samples, oldest first, as a new array. */
  values(): Float64Array {
    const out = new Float64Array(this.size);
    const start = (this.head - this.size + this.buf.length) % this.buf.length;
    for (let i = 0; i < this.size; i += 1) out[i] = this.buf[(start + i) % this.buf.length] ?? 0;
    return out;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }
}
