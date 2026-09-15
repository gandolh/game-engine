import { describe, it, expect } from "vitest";
import {
  clampAlpha,
  computeSnapshotAlpha,
  lerp,
  lerpEntityPositions,
  SnapshotInterpBuffer,
  type InterpEntityLike,
} from "./snapshot-interp";

interface E extends InterpEntityLike {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

function e(id: number, x: number, y: number): E {
  return { id, x, y };
}

describe("lerp", () => {
  it("interpolates linearly, including outside [0,1]", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 2)).toBe(20);
  });
});

describe("clampAlpha", () => {
  it("clamps to [0,1]", () => {
    expect(clampAlpha(-0.5)).toBe(0);
    expect(clampAlpha(0)).toBe(0);
    expect(clampAlpha(0.5)).toBe(0.5);
    expect(clampAlpha(1)).toBe(1);
    expect(clampAlpha(1.5)).toBe(1);
  });
});

describe("computeSnapshotAlpha", () => {
  it("computes the elapsed fraction of the interval since arrival", () => {
    expect(computeSnapshotAlpha(1050, 1000, 100)).toBeCloseTo(0.5, 10);
    expect(computeSnapshotAlpha(1000, 1000, 100)).toBe(0);
    expect(computeSnapshotAlpha(1100, 1000, 100)).toBe(1);
  });

  it("never extrapolates past 1 even far beyond the interval (stalled feed)", () => {
    expect(computeSnapshotAlpha(5000, 1000, 100)).toBe(1);
  });

  it("never goes negative if now is before arrival", () => {
    expect(computeSnapshotAlpha(900, 1000, 100)).toBe(0);
  });

  it("subtracts an optional render-behind delay before computing the fraction", () => {
    // 60ms elapsed, 100ms interval, 50ms delay -> (60-50)/100 = 0.1
    expect(computeSnapshotAlpha(1060, 1000, 100, 50)).toBeCloseTo(0.1, 10);
  });

  it("returns 1 for a non-positive interval instead of dividing by zero", () => {
    expect(computeSnapshotAlpha(1050, 1000, 0)).toBe(1);
    expect(computeSnapshotAlpha(1050, 1000, -10)).toBe(1);
  });
});

describe("lerpEntityPositions", () => {
  it("lerps an id present in both prev and next", () => {
    const prev = [e(1, 0, 0)];
    const next = [e(1, 10, 20)];
    const out = lerpEntityPositions(prev, next, 0.5);
    expect(out.get(1)).toEqual({ x: 5, y: 10 });
  });

  it("snaps a new id (present in next, absent from prev) to its next position", () => {
    const prev: E[] = [];
    const next = [e(7, 42, 99)];
    const out = lerpEntityPositions(prev, next, 0.25);
    expect(out.get(7)).toEqual({ x: 42, y: 99 });
  });

  it("does not emit a despawned id (present in prev, absent from next)", () => {
    const prev = [e(1, 0, 0), e(2, 5, 5)];
    const next = [e(1, 10, 10)];
    const out = lerpEntityPositions(prev, next, 0.5);
    expect(out.has(2)).toBe(false);
    expect(out.size).toBe(1);
  });

  it("clamps alpha outside [0,1] before lerping", () => {
    const prev = [e(1, 0, 0)];
    const next = [e(1, 10, 10)];
    expect(lerpEntityPositions(prev, next, -1).get(1)).toEqual({ x: 0, y: 0 });
    expect(lerpEntityPositions(prev, next, 2).get(1)).toEqual({ x: 10, y: 10 });
  });
});

describe("SnapshotInterpBuffer", () => {
  it("is empty before the first snapshot", () => {
    const buf = new SnapshotInterpBuffer<E>(50);
    expect(buf.getLatest()).toBeNull();
    expect(buf.getPrev()).toBeNull();
    expect(buf.interpolatedPositions(0).size).toBe(0);
    expect(buf.alpha(0)).toBe(1);
  });

  it("snaps to latest (alpha 1, no smoothing) after only one snapshot", () => {
    const buf = new SnapshotInterpBuffer<E>(50);
    buf.ingest([e(1, 3, 4)], 1000);
    expect(buf.alpha(1025)).toBe(1);
    expect(buf.interpolatedPositions(1025).get(1)).toEqual({ x: 3, y: 4 });
  });

  it("interpolates between the last two ingested snapshots using the measured interval", () => {
    const buf = new SnapshotInterpBuffer<E>(1000 / 20);
    buf.ingest([e(1, 0, 0)], 1000);
    buf.ingest([e(1, 16, 0)], 1050); // measured interval becomes 50ms

    expect(buf.alpha(1075)).toBeCloseTo(0.5, 10);
    const pos = buf.interpolatedPositions(1075).get(1)!;
    expect(pos.x).toBeCloseTo(8, 10);
    expect(pos.y).toBe(0);
  });

  it("holds (does not extrapolate) once render time runs past the measured interval", () => {
    const buf = new SnapshotInterpBuffer<E>(1000 / 20);
    buf.ingest([e(1, 0, 0)], 1000);
    buf.ingest([e(1, 16, 0)], 1050);

    expect(buf.alpha(5000)).toBe(1);
    expect(buf.interpolatedPositions(5000).get(1)).toEqual({ x: 16, y: 0 });
  });

  it("snaps a newly-spawned id introduced in the latest snapshot", () => {
    const buf = new SnapshotInterpBuffer<E>(1000 / 20);
    buf.ingest([e(1, 0, 0)], 1000);
    buf.ingest([e(1, 16, 0), e(2, 99, 99)], 1050);

    const positions = buf.interpolatedPositions(1075);
    expect(positions.get(1)!.x).toBeCloseTo(8, 10);
    expect(positions.get(2)).toEqual({ x: 99, y: 99 });
  });

  it("reset() discards buffered history without touching the measured interval", () => {
    const buf = new SnapshotInterpBuffer<E>(1000 / 20);
    buf.ingest([e(1, 0, 0)], 1000);
    buf.ingest([e(1, 16, 0)], 1050);
    buf.reset();

    expect(buf.getLatest()).toBeNull();
    expect(buf.getPrev()).toBeNull();
    expect(buf.alpha(2000)).toBe(1);

    // Next ingest after reset behaves like a fresh first snapshot (snap, alpha 1).
    buf.ingest([e(1, 5, 5)], 2000);
    expect(buf.alpha(2025)).toBe(1);
    expect(buf.interpolatedPositions(2025).get(1)).toEqual({ x: 5, y: 5 });
  });

  it("applies an optional render-behind delay in alpha()/interpolatedPositions()", () => {
    const buf = new SnapshotInterpBuffer<E>(1000 / 20);
    buf.ingest([e(1, 0, 0)], 1000);
    buf.ingest([e(1, 100, 0)], 1050); // interval 50ms

    // 30ms elapsed since latest arrival, 20ms delay -> (30-20)/50 = 0.2
    expect(buf.alpha(1080, 20)).toBeCloseTo(0.2, 10);
    expect(buf.interpolatedPositions(1080, 20).get(1)!.x).toBeCloseTo(20, 10);
  });
});
