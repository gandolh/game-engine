import { describe, it, expect } from "vitest";
import { visibleTileWindow, windowContains, windowTileCount, getCellOr } from "./render-window";

const TILE = 16;

describe("Citadel 21 — render-windowed sparse grid", () => {
  it("windows a 256² grid to the camera view (far fewer tiles than the full grid)", () => {
    const w = visibleTileWindow(2000, 2000, 800, 600, 1, TILE, 256, 256, 2);
    expect(w.minTx).toBeGreaterThan(60);  // ~98
    expect(w.maxTx).toBeLessThan(160);    // ~152
    const count = windowTileCount(w);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(256 * 256);
  });

  it("clamps to the world edges (no negative / out-of-range tiles)", () => {
    const tl = visibleTileWindow(0, 0, 800, 600, 1, TILE, 256, 256, 2);
    expect(tl.minTx).toBe(0);
    expect(tl.minTy).toBe(0);
    const br = visibleTileWindow(256 * TILE, 256 * TILE, 800, 600, 1, TILE, 256, 256, 2);
    expect(br.maxTx).toBe(255);
    expect(br.maxTy).toBe(255);
  });

  it("keeps render-object memory FLAT as the logical grid grows", () => {
    // Same view, bigger world → identical window size (window tracks the VIEW).
    const small = windowTileCount(visibleTileWindow(2000, 2000, 800, 600, 1, TILE, 256, 256, 2));
    const huge = windowTileCount(visibleTileWindow(2000, 2000, 800, 600, 1, TILE, 1024, 1024, 2));
    expect(huge).toBe(small);
  });

  it("materialises in-window cells and virtualises off-window cells", () => {
    const w = visibleTileWindow(2000, 2000, 800, 600, 1, TILE, 256, 256, 0);
    const VIRTUAL = { kind: "virtual" } as const;
    const materialise = (tx: number, ty: number): { kind: string } => ({ kind: `real-${tx}-${ty}` });

    expect(windowContains(w, w.minTx, w.minTy)).toBe(true);
    expect(getCellOr(w, w.minTx, w.minTy, materialise, VIRTUAL)).not.toBe(VIRTUAL);

    expect(windowContains(w, 0, 0)).toBe(false); // far corner, off-window
    expect(getCellOr(w, 0, 0, materialise, VIRTUAL)).toBe(VIRTUAL);
  });
});
