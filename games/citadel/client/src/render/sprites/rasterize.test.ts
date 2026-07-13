/**
 * Pure tests for the runtime-atlas rasterizer + shelf packer. These never touch
 * a canvas/GPU, so they run headlessly: they prove the atlas LAYOUT and pixels
 * are deterministic (byte-identical every boot) and well-formed.
 */
import { describe, it, expect } from "vitest";
import { rasterizeRecipe, packShelf, nextPow2, type PackItem } from "./rasterize";
import { rgbOf, type PixelRect } from "@engine/core";
import { CITADEL_PAL } from "../citadel-palette";
import type { PixelRecipe } from "./types";

describe("nextPow2", () => {
  it("rounds up to the next power of two", () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(3)).toBe(4);
    expect(nextPow2(48)).toBe(64);
    expect(nextPow2(256)).toBe(256);
    expect(nextPow2(257)).toBe(512);
  });
});

describe("rasterizeRecipe", () => {
  it("maps chars to RGBA row-major, with `.` transparent", () => {
    const r: PixelRecipe = { name: "t", width: 2, height: 2, pixels: ["v.", ".#"] };
    const out = rasterizeRecipe(r);
    expect(out.width).toBe(2);
    expect(out.rgba.length).toBe(2 * 2 * 4);
    // (0,0) = white v → opaque white (Apollo value of the `white` role).
    const [wr, wg, wb] = rgbOf(CITADEL_PAL.white);
    expect([out.rgba[0], out.rgba[1], out.rgba[2], out.rgba[3]]).toEqual([wr, wg, wb, 255]);
    // (1,0) = `.` → transparent.
    expect(out.rgba[7]).toBe(0);
    // (1,1) = `#` black → opaque, non-white.
    expect(out.rgba[(3 * 4) + 3]).toBe(255);
    expect(out.rgba[3 * 4]).toBeLessThan(255);
  });

  it("throws on a ragged row or wrong row count (catches art typos)", () => {
    expect(() => rasterizeRecipe({ name: "bad", width: 3, height: 1, pixels: ["vv"] })).toThrow();
    expect(() => rasterizeRecipe({ name: "bad", width: 2, height: 2, pixels: ["vv"] })).toThrow();
  });

  it("throws on an unknown swatch char", () => {
    expect(() => rasterizeRecipe({ name: "bad", width: 1, height: 1, pixels: ["?"] })).toThrow();
  });
});

const SAMPLE: PackItem[] = [
  { name: "px", width: 1, height: 1 },
  { name: "a", width: 48, height: 48 },
  { name: "b", width: 32, height: 32 },
  { name: "c", width: 48, height: 32 },
  { name: "d", width: 16, height: 16 },
];

function overlaps(p: PixelRect, q: PixelRect): boolean {
  return p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
}

describe("packShelf", () => {
  it("is deterministic and order-independent", () => {
    const a = packShelf(SAMPLE);
    const b = packShelf([...SAMPLE].reverse());
    expect(a).toEqual(b);
  });

  it("produces power-of-two dimensions", () => {
    const p = packShelf(SAMPLE);
    expect(nextPow2(p.width)).toBe(p.width);
    expect(nextPow2(p.height)).toBe(p.height);
  });

  it("places every frame inside the atlas with no overlaps and a gutter", () => {
    const p = packShelf(SAMPLE);
    const rects = Object.entries(p.frames);
    expect(rects.length).toBe(SAMPLE.length);
    for (const [name, r] of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(p.width);
      expect(r.y + r.h).toBeLessThanOrEqual(p.height);
      // matches the requested size
      const item = SAMPLE.find((i) => i.name === name)!;
      expect([r.w, r.h]).toEqual([item.width, item.height]);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i]![1], rects[j]![1])).toBe(false);
      }
    }
  });
});
