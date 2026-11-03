import { describe, it, expect } from "vitest";
import {
  patchGrid,
  patchRect,
  patchSizeFor,
  planPatches,
  slicePatches,
  spriteBounds,
  spritesInRect,
  validatePatchManifest,
  visiblePatchRange,
} from "./static-patches";
import type { Sprite } from "./sprite-types";

const sprite = (p: Partial<Sprite>): Sprite => ({
  x: 0, y: 0, width: 16, height: 16, frame: "f", atlasId: "a", rotation: 0, layer: 0, alpha: 1, ...p,
});

describe("patch sizing", () => {
  it("is 2048, or the device's limit when that is smaller", () => {
    expect(patchSizeFor(16384)).toBe(2048);
    expect(patchSizeFor(2048)).toBe(2048);
    expect(patchSizeFor(1024)).toBe(1024);
  });
});

describe("the grid", () => {
  const grid = patchGrid({ originX: 100, originY: 50, width: 100, height: 70 }, 32);

  it("covers the region, the edge patches cropped", () => {
    expect([grid.cols, grid.rows]).toEqual([4, 3]);
    expect(patchRect(grid, 0)).toEqual({ originX: 100, originY: 50, width: 32, height: 32 });
    expect(patchRect(grid, 3)).toEqual({ originX: 196, originY: 50, width: 4, height: 32 });
    expect(patchRect(grid, 11)).toEqual({ originX: 196, originY: 114, width: 4, height: 6 });
  });

  it("finds the patches a view touches, ignoring an edge-only touch and anything off the region", () => {
    expect(visiblePatchRange(grid, { visL: 140, visT: 60, visR: 170, visB: 90 })).toEqual({ c0: 1, r0: 0, c1: 2, r1: 1 });
    expect(visiblePatchRange(grid, { visL: 100, visT: 50, visR: 132, visB: 82 })).toEqual({ c0: 0, r0: 0, c1: 0, r1: 0 });
    expect(visiblePatchRange(grid, { visL: 0, visT: 0, visR: 100, visB: 50 })).toBeNull();
    expect(visiblePatchRange(grid, { visL: 0, visT: 0, visR: 1000, visB: 1000 })).toEqual({ c0: 0, r0: 0, c1: 3, r1: 2 });
  });
});

describe("the plan", () => {
  const grid = patchGrid({ originX: 0, originY: 0, width: 320, height: 320 }, 32); // 10×10

  it("lists the visible patches, the ring not yet live, and live patches two rings out", () => {
    const range = { c0: 4, r0: 4, c1: 5, r1: 4 };
    const live = new Set([44, 33, 22, 99]); // in view, ring 1, ring 2, far
    const plan = planPatches(grid, range, live);
    expect(plan.visible).toEqual([44, 45]);
    expect(plan.ahead).not.toContain(33);
    expect(plan.ahead).toHaveLength(10 - 1); // the 4×3 ring block minus the 2 visible, minus live 33
    expect([...plan.evict].sort((a, b) => a - b)).toEqual([22, 99]);
  });

  it("frees everything when the view misses the grid", () => {
    expect(planPatches(grid, null, new Set([1, 2])).evict).toEqual([1, 2]);
  });
});

describe("sprite culling", () => {
  it("boxes a sprite round its centre, and a rotated one round its corners", () => {
    expect(spriteBounds(sprite({ x: 10, y: 20, width: 8, height: 4 }))).toEqual({ l: 6, t: 18, r: 14, b: 22 });
    const r = spriteBounds(sprite({ x: 0, y: 0, width: 6, height: 8, rotation: 0.5 }));
    expect(r.r).toBeCloseTo(5);
    expect(r.b).toBeCloseTo(5);
  });

  it("keeps the sprites that overlap a rect, in their order", () => {
    const a = sprite({ x: 8, y: 8 }); // 0..16
    const b = sprite({ x: 40, y: 8 }); // 32..48
    const c = sprite({ x: 30, y: 8 }); // 22..38, straddles 32
    expect(spritesInRect([a, b, c], { originX: 32, originY: 0, width: 32, height: 32 })).toEqual([b, c]);
    expect(spritesInRect([a, b, c], { originX: 0, originY: 0, width: 32, height: 32 })).toEqual([a, c]);
  });
});

describe("the painted-image manifest", () => {
  it("slices row-major, edge patches cropped", () => {
    expect(slicePatches(300, 200, 128).map((p) => [p.col, p.row, p.x, p.y, p.w, p.h])).toEqual([
      [0, 0, 0, 0, 128, 128],
      [1, 0, 128, 0, 128, 128],
      [2, 0, 256, 0, 44, 128],
      [0, 1, 0, 128, 128, 72],
      [1, 1, 128, 128, 128, 72],
      [2, 1, 256, 128, 44, 72],
    ]);
  });

  it("accepts a manifest that matches its own slicing and rejects one that does not", () => {
    const patches = slicePatches(64, 32, 32).map((p) => ({ file: `p${p.col}.png`, x: p.x, y: p.y, w: p.w, h: p.h }));
    expect(validatePatchManifest({ version: 1, width: 64, height: 32, patchSize: 32, patches }).patches).toHaveLength(2);
    expect(() => validatePatchManifest({ version: 2 })).toThrow(/unknown version/);
    expect(() => validatePatchManifest({ version: 1, width: 64, height: 32, patchSize: 32, patches: patches.slice(1) })).toThrow(
      /1 patches, but a 64×32 image at 32 px has 2/,
    );
    const moved = patches.map((p, i) => (i === 1 ? { ...p, x: 30 } : p));
    expect(() => validatePatchManifest({ version: 1, width: 64, height: 32, patchSize: 32, patches: moved })).toThrow(/patch 1/);
  });
});
