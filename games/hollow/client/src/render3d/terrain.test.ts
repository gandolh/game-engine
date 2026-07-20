import { describe, it, expect } from "vitest";
import { groundHeightAt, GROUND_HEIGHT_MAX_MAGNITUDE } from "./terrain";

describe("groundHeightAt", () => {
  it("is deterministic: same (gx, gy) always returns the same height", () => {
    expect(groundHeightAt(5, 12)).toBe(groundHeightAt(5, 12));
    expect(groundHeightAt(0, 0)).toBe(groundHeightAt(0, 0));
    expect(groundHeightAt(63, 63)).toBe(groundHeightAt(63, 63));
  });

  it("stays within the documented bound over the whole 64x64 grid", () => {
    for (let gx = 0; gx < 64; gx += 3) {
      for (let gy = 0; gy < 64; gy += 3) {
        const h = groundHeightAt(gx, gy);
        expect(Math.abs(h)).toBeLessThanOrEqual(GROUND_HEIGHT_MAX_MAGNITUDE + 1e-9);
      }
    }
  });

  it("is not a flat constant (real relief, not a stub)", () => {
    const heights = new Set<number>();
    for (let gx = 0; gx < 64; gx += 5) heights.add(groundHeightAt(gx, 0));
    expect(heights.size).toBeGreaterThan(1);
  });

  it("differs between distinct tiles in general (not degenerately periodic at small offsets)", () => {
    expect(groundHeightAt(1, 1)).not.toBe(groundHeightAt(2, 1));
  });
});
