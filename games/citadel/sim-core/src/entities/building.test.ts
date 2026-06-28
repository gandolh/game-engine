import { describe, it, expect } from "vitest";
import { SERVICE_RECTS, coversRect } from "./building";

describe("coversRect — rectangular service coverage", () => {
  it("the well covers an 8-wide × 6-tall rectangle (not a diamond)", () => {
    expect(SERVICE_RECTS.well).toEqual({ w: 8, h: 6 });
    // Centre at (20,20): even spans anchor the extra col/row to +x/+y, so the
    // rectangle is cols 16..23 (8 wide) and rows 17..22 (6 tall).
    let covered = 0;
    for (let py = 10; py <= 30; py++) {
      for (let px = 10; px <= 30; px++) {
        if (coversRect("well", 20, 20, px, py)) covered++;
      }
    }
    expect(covered).toBe(8 * 6);

    // Corners of the rectangle are inside; just outside each edge is not.
    expect(coversRect("well", 20, 20, 16, 17)).toBe(true);
    expect(coversRect("well", 20, 20, 23, 22)).toBe(true);
    expect(coversRect("well", 20, 20, 15, 20)).toBe(false); // one west of x0
    expect(coversRect("well", 20, 20, 24, 20)).toBe(false); // one east of x1
    expect(coversRect("well", 20, 20, 20, 16)).toBe(false); // one north of y0
    expect(coversRect("well", 20, 20, 20, 23)).toBe(false); // one south of y1
  });

  it("is a true rectangle, not a Manhattan diamond (corners are covered)", () => {
    // The far corner (16,17) is Manhattan distance 4+3=7 from centre — a radius-5
    // diamond would EXCLUDE it, but the rectangle includes it.
    expect(Math.abs(16 - 20) + Math.abs(17 - 20)).toBe(7);
    expect(coversRect("well", 20, 20, 16, 17)).toBe(true);
  });

  it("returns false for types without a rectangular coverage", () => {
    expect(coversRect("chapel", 20, 20, 20, 20)).toBe(false);
    expect(coversRect("house", 5, 5, 5, 5)).toBe(false);
  });
});
