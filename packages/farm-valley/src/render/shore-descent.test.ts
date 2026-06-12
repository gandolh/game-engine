/**
 * Brief 83 item 2 — sandy-shore descent. The real input (SAND_SHORES) is world geometry, so we pass
 * a controlled shore list explicitly and assert: every draw is the EDG wet-sand colour under multiply,
 * bands land on the ocean-facing edge (per rotation), and the waterline band is the darkest. Visual
 * sign-off is the user's.
 */

import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import { makeShoreDescentDecorator } from "./shore-descent";

const TILE = 16;

function makeRecordingCtx() {
  const calls: Array<{ x: number; y: number; w: number; h: number; color: string; alpha: number; op: string }> = [];
  const ctx = {
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "" as string,
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ x, y, w, h, color: String(this.fillStyle), alpha: this.globalAlpha, op: this.globalCompositeOperation });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("makeShoreDescentDecorator (brief 83.2)", () => {
  it("darkens with the EDG wet-sand colour under multiply", () => {
    const { ctx, calls } = makeRecordingCtx();
    makeShoreDescentDecorator(TILE, [{ tx: 0, ty: 0, rotation: 0 }])(ctx, TILE, TILE);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.color).toBe(EDG.skinMid);
      expect(c.op).toBe("multiply");
    }
  });

  it("ocean-up (rotation 0): bands hug the TOP edge, darkest at the waterline", () => {
    const { ctx, calls } = makeRecordingCtx();
    makeShoreDescentDecorator(TILE, [{ tx: 0, ty: 0, rotation: 0 }])(ctx, TILE, TILE);
    // Bands are full-width horizontal strips stacked downward from y=0.
    for (const c of calls) expect(c.w).toBe(TILE);
    const topBand = calls.find((c) => c.y === 0)!;
    const lowest = calls.reduce((a, b) => (b.y > a.y ? b : a));
    expect(topBand.alpha).toBeGreaterThan(lowest.alpha); // waterline (top) darkest
  });

  it("ocean-right (rotation π/2): bands hug the RIGHT edge as vertical strips", () => {
    const { ctx, calls } = makeRecordingCtx();
    makeShoreDescentDecorator(TILE, [{ tx: 0, ty: 0, rotation: Math.PI / 2 }])(ctx, TILE, TILE);
    for (const c of calls) expect(c.h).toBe(TILE); // full-height vertical strips
    const rightmost = calls.reduce((a, b) => (b.x > a.x ? b : a));
    // Waterline band sits flush against the right edge (x + w === TILE) and is the darkest.
    expect(rightmost.x + rightmost.w).toBe(TILE);
    expect(rightmost.alpha).toBe(Math.max(...calls.map((c) => c.alpha)));
  });
});
