/**
 * Ocean-surface veil decorator — render-only. Real input (regionAt) reads world geometry, so we mock
 * it and assert the layering contract: a full-tile fill on every water tile (regionAt === null:
 * ocean + bridge spans), and NO fill on land tiles (regionAt non-null).
 */
import { describe, it, expect, vi } from "vitest";

// Mock the geometry source: a 4-wide row where columns 0,1 are water (null) and 2,3 are land.
vi.mock("@farm/sim-core/world/regions", () => ({
  regionAt: (tx: number, _ty: number) => (tx <= 1 ? null : ("farm-0" as unknown)),
}));

import { makeOceanVeilDecorator } from "./ocean-veil";

const TILE = 16;

function makeRecordingCtx() {
  const calls: Array<{ x: number; y: number; w: number; h: number; color: string }> = [];
  const ctx = {
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "" as string,
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ x, y, w, h, color: String(this.fillStyle) });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("makeOceanVeilDecorator", () => {
  it("fills water tiles (regionAt null) and skips land tiles", () => {
    const { ctx, calls } = makeRecordingCtx();
    makeOceanVeilDecorator(TILE)(ctx, 4 * TILE, TILE);
    const cols = calls.map((c) => Math.floor(c.x / TILE)).sort();
    expect(cols).toEqual([0, 1]); // only the two water columns
    for (const c of calls) {
      expect(c.w).toBe(TILE); // full-tile fill (no seams)
      expect(c.h).toBe(TILE);
    }
  });

  it("uses a single translucent rgba fill and restores ctx state", () => {
    const { ctx, calls } = makeRecordingCtx();
    makeOceanVeilDecorator(TILE)(ctx, 4 * TILE, TILE);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.color.startsWith("rgba(")).toBe(true);
    }
    expect(ctx.globalCompositeOperation).toBe("source-over");
    expect(ctx.globalAlpha).toBe(1);
  });
});
