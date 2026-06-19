import { describe, it, expect } from "vitest";
import { resolveStaticRegion, staticBlitRect } from "./static-region";

describe("resolveStaticRegion", () => {
  it("defaults to the whole world when no region is given", () => {
    expect(resolveStaticRegion(640, 480)).toEqual({
      originX: 0,
      originY: 0,
      width: 640,
      height: 480,
    });
  });

  it("rounds the default world size (ceil width, min 1)", () => {
    expect(resolveStaticRegion(0, 10.2)).toEqual({
      originX: 0,
      originY: 0,
      width: 1,
      height: 11,
    });
  });

  it("floors the origin and ceils the size of an explicit region", () => {
    expect(
      resolveStaticRegion(4096, 4096, { originX: 32.9, originY: 16.1, width: 100.2, height: 50.0 }),
    ).toEqual({ originX: 32, originY: 16, width: 101, height: 50 });
  });
});

describe("staticBlitRect — whole-world region is the pre-windowing identity", () => {
  const full = resolveStaticRegion(640, 480);

  it("maps the visible rect straight through (src == dst) for a full-world bake", () => {
    const blit = staticBlitRect(100, 80, 300, 240, full);
    expect(blit).toEqual({
      srcX: 100, srcY: 80, srcW: 200, srcH: 160,
      dstL: 100, dstT: 80, dstW: 200, dstH: 160,
    });
  });

  it("clamps a visible rect that runs past the world to the texture bounds", () => {
    // The renderer already clamps vis to the logical world, but prove the
    // region clamp matches: a rect to the world edge stays src == dst.
    const blit = staticBlitRect(600, 460, 640, 480, full);
    expect(blit).toEqual({
      srcX: 600, srcY: 460, srcW: 40, srcH: 20,
      dstL: 600, dstT: 460, dstW: 40, dstH: 20,
    });
  });
});

describe("staticBlitRect — windowed sub-region", () => {
  // A 256-px window of a big world, baked with its top-left at world (1000, 2000).
  const region = { originX: 1000, originY: 2000, width: 256, height: 256 } as const;

  it("offsets the source rect by the region origin (dst stays in world space)", () => {
    // Camera fully inside the window: src is window-local, dst is world.
    const blit = staticBlitRect(1050, 2050, 1150, 2150, region);
    expect(blit).toEqual({
      srcX: 50, srcY: 50, srcW: 100, srcH: 100,
      dstL: 1050, dstT: 2050, dstW: 100, dstH: 100,
    });
  });

  it("clamps the visible rect to the baked window (trailing margin not yet baked)", () => {
    // Camera has panned so the visible rect extends past the baked window's
    // right/bottom edge — the blit shrinks to the window, leaving the un-baked
    // margin uncovered until the next re-bake.
    const blit = staticBlitRect(1200, 2200, 1400, 2400, region);
    expect(blit).toEqual({
      // window right/bottom edge = 1256 / 2256
      srcX: 200, srcY: 200, srcW: 56, srcH: 56,
      dstL: 1200, dstT: 2200, dstW: 56, dstH: 56,
    });
  });

  it("clamps the leading edge too (visible rect starts before the window origin)", () => {
    const blit = staticBlitRect(900, 1900, 1100, 2100, region);
    expect(blit).toEqual({
      srcX: 0, srcY: 0, srcW: 100, srcH: 100,
      dstL: 1000, dstT: 2000, dstW: 100, dstH: 100,
    });
  });

  it("returns null when the visible rect does not intersect the window", () => {
    expect(staticBlitRect(0, 0, 500, 500, region)).toBeNull();
    expect(staticBlitRect(2000, 3000, 2100, 3100, region)).toBeNull();
  });
});
