import { describe, expect, it } from "vitest";
import { SampleRing, percentile, summarizeFramesDrawn, summarizeIntervals } from "./frame-stats";

describe("percentile", () => {
  it("takes the nearest rank", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 0.5)).toBe(5);
    expect(percentile(sorted, 0.95)).toBe(10);
    expect(percentile(sorted, 0.99)).toBe(10);
    expect(percentile(sorted, 0.1)).toBe(1);
    expect(percentile(sorted, 0)).toBe(1);
  });

  it("is 0 for no samples", () => {
    expect(percentile([], 0.95)).toBe(0);
  });
});

describe("summarizeIntervals", () => {
  it("reports the percentiles of a steady 60 Hz run with two hitches", () => {
    // 98 frames on time, one that missed a refresh, one that missed two.
    const intervals = [...Array.from({ length: 98 }, () => 16.6), 33.3, 50];
    const s = summarizeIntervals(intervals);
    expect(s.samples).toBe(100);
    expect(s.p50).toBeCloseTo(16.6);
    expect(s.p95).toBeCloseTo(16.6);
    expect(s.p99).toBeCloseTo(33.3);
    // 33.3 and 50 are both over 16.7 ms; only 50 is over 33.3 ms (33.3 < 1000/30 = 33.33…).
    expect(s.over16_7).toBeCloseTo(0.02);
    expect(s.over33_3).toBeCloseTo(0.01);
  });

  it("counts a frame exactly on the boundary as on time", () => {
    const s = summarizeIntervals([1000 / 60, 1000 / 30]);
    expect(s.over16_7).toBeCloseTo(0.5); // 1000/30 is over 16.7, 1000/60 is not
    expect(s.over33_3).toBe(0);
  });

  it("derives fps from the measured span", () => {
    const s = summarizeIntervals([20, 20, 20, 20]);
    expect(s.fps).toBeCloseTo(50);
    expect(s.mean).toBeCloseTo(20);
  });

  it("does not reorder the input", () => {
    const input = [3, 1, 2];
    summarizeIntervals(input);
    expect(input).toEqual([3, 1, 2]);
  });

  it("is all zeros without samples", () => {
    expect(summarizeIntervals([])).toEqual({
      samples: 0,
      mean: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      over16_7: 0,
      over33_3: 0,
      fps: 0,
    });
  });
});

describe("summarizeFramesDrawn", () => {
  it("reports the CPU cost and the drawn rate", () => {
    const s = summarizeFramesDrawn([2, 4, 6, 8], 100);
    expect(s.frames).toBe(4);
    expect(s.meanMs).toBe(5);
    expect(s.p95Ms).toBe(8);
    expect(s.fps).toBe(40);
  });
});

describe("SampleRing", () => {
  it("keeps the newest samples in arrival order", () => {
    const ring = new SampleRing(3);
    for (const v of [1, 2, 3, 4, 5]) ring.push(v);
    expect(ring.length).toBe(3);
    expect(Array.from(ring.values())).toEqual([3, 4, 5]);
    ring.clear();
    expect(ring.length).toBe(0);
    expect(Array.from(ring.values())).toEqual([]);
  });
});
