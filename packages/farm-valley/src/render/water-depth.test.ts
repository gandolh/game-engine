/**
 * Brief 83 item 4 — granular near-shore water. The decorator is render-only and
 * its real input (oceanDepthAt) reads world geometry, so we mock the depth field
 * and assert the three properties that matter: deterministic on the seed, every
 * speckle colour is an EDG palette neighbour, and grain is depth-graded (shallow
 * denser than deep). The visual itself is the user's sign-off.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the depth source: a vertical gradient — column x maps to depth x+1, so a
// 4-wide canvas yields depths 1,2,3,4 (shore → deep) and depth 0 (land) elsewhere.
vi.mock("@farm/sim-core/render-systems", () => ({
  COAST_DEPTH_MAX: 4,
  oceanDepthAt: (tx: number, _ty: number) => (tx >= 0 && tx <= 3 ? tx + 1 : 0),
}));

import { EDG } from "@engine/core";
import { makeWaterDepthDecorator } from "./water-depth";

const TILE = 16;

/** Records every fillRect with the fillStyle/alpha active at draw time. */
function makeRecordingCtx() {
  const calls: Array<{ x: number; y: number; w: number; h: number; color: string; alpha: number }> = [];
  const ctx = {
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "" as string,
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ x, y, w, h, color: String(this.fillStyle), alpha: this.globalAlpha });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** Speckles are the sub-tile draws (smaller than a full tile). The wash fills a full tile. */
const isSpeckle = (c: { w: number }) => c.w < TILE;

describe("makeWaterDepthDecorator — granular water (brief 83.4)", () => {
  // One tile column per depth band: 4 tiles wide, 1 tall.
  const W = 4 * TILE;
  const H = TILE;

  let allowedColors: Set<string>;
  beforeEach(() => {
    allowedColors = new Set([EDG.cyan, EDG.skyBlue, EDG.blue, EDG.teal, EDG.white]);
  });

  it("is deterministic on the seed — identical speckle output across two runs", () => {
    const run = () => {
      const { ctx, calls } = makeRecordingCtx();
      makeWaterDepthDecorator(TILE, 0xc0ffee)(ctx, W, H);
      return calls;
    };
    expect(run()).toEqual(run());
  });

  it("a different seed produces a different speckle pattern", () => {
    const grab = (seed: number) => {
      const { ctx, calls } = makeRecordingCtx();
      makeWaterDepthDecorator(TILE, seed)(ctx, W, H);
      return JSON.stringify(calls.filter(isSpeckle));
    };
    expect(grab(1)).not.toEqual(grab(2));
  });

  it("every drawn colour is an EDG water-palette neighbour", () => {
    const { ctx, calls } = makeRecordingCtx();
    makeWaterDepthDecorator(TILE, 0xc0ffee)(ctx, W, H);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(allowedColors.has(c.color)).toBe(true);
    }
  });

  it("grain hugs the shore — only the two nearest-shore depths get speckles", () => {
    const { ctx, calls } = makeRecordingCtx();
    makeWaterDepthDecorator(TILE, 0xc0ffee)(ctx, W, H);
    const speckles = calls.filter(isSpeckle);
    // Column 0 = depth 1 (shore) … column 3 = depth 4 (deep). Shallows are kept tight to land:
    // d=1 denser than d=2, and d=3 / d=4 produce no grain (so it never blobs into open water).
    const inCol = (col: number) => speckles.filter((c) => Math.floor(c.x / TILE) === col).length;
    expect(inCol(0)).toBeGreaterThan(inCol(1));
    expect(inCol(1)).toBeGreaterThan(0);
    expect(inCol(2)).toBe(0);
    expect(inCol(3)).toBe(0);
  });
});
