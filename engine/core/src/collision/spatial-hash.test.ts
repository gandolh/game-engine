import { describe, it, expect } from "vitest";
import { SpatialHash } from "./spatial-hash";

describe("SpatialHash", () => {
  it("queryRadius finds a body at the query center", () => {
    const hash = new SpatialHash(1);
    hash.insert(1, 0, 0);
    expect(hash.queryRadius(0, 0, 0.5)).toEqual([1]);
  });

  it("queryRadius excludes bodies far outside the radius neighborhood", () => {
    const hash = new SpatialHash(1);
    hash.insert(1, 0, 0);
    hash.insert(2, 50, 50);
    expect(hash.queryRadius(0, 0, 1)).toEqual([1]);
  });

  it("returns ids sorted ascending, never insertion order", () => {
    const hash = new SpatialHash(1);
    hash.insert(5, 0, 0);
    hash.insert(1, 0.1, 0.1);
    hash.insert(3, -0.1, 0.1);
    expect(hash.queryRadius(0, 0, 1)).toEqual([1, 3, 5]);
  });

  it("clear() removes all previously inserted bodies", () => {
    const hash = new SpatialHash(1);
    hash.insert(1, 0, 0);
    hash.clear();
    expect(hash.queryRadius(0, 0, 5)).toEqual([]);
  });

  it("finds bodies across a cell boundary within radius", () => {
    const hash = new SpatialHash(1);
    // Cell size 1: these two land in adjacent cells but are close together.
    hash.insert(1, 0.9, 0.9);
    hash.insert(2, 1.1, 1.1);
    const found = hash.queryRadius(1.0, 1.0, 0.5);
    expect(found).toEqual([1, 2]);
  });

  it("rejects a non-positive cellSize", () => {
    expect(() => new SpatialHash(0)).toThrow();
    expect(() => new SpatialHash(-1)).toThrow();
  });
});
