import { describe, it, expect } from "vitest";
import { tileSpan } from "./tile-span";

describe("tileSpan", () => {
  it("is the whole grid without a region", () => {
    expect(tileSpan(240, 240, 16)).toEqual({ tx0: 0, ty0: 0, tx1: 240, ty1: 240 });
  });

  it("is the tiles a patch overlaps, including partly covered ones, clamped to the grid", () => {
    expect(tileSpan(240, 240, 16, { originX: 2048, originY: 0, width: 1792, height: 2048 })).toEqual({
      tx0: 128,
      ty0: 0,
      tx1: 240,
      ty1: 128,
    });
    expect(tileSpan(240, 240, 16, { originX: 10, originY: 20, width: 30, height: 5 })).toEqual({
      tx0: 0,
      ty0: 1,
      tx1: 3,
      ty1: 2,
    });
  });
});
