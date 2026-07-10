import { describe, it, expect } from "vitest";
import { visibleTileWindow, windowContains, windowTileCount, getCellOr } from "./render-window";
import { makeIso } from "./iso";

/** The MP world this module exists for. */
const mp = makeIso(256, 256);

/** A camera centred on the tile the caller names, in iso world-px. */
function centredOn(tx: number, ty: number): { cx: number; cy: number } {
  const c = mp.tileCenterToIso(tx, ty);
  return { cx: c.x, cy: c.y };
}

describe("Citadel 21 — render-windowed sparse grid", () => {
  it("windows a 256² grid to the camera view (far fewer tiles than the full grid)", () => {
    const { cx, cy } = centredOn(128, 128);
    const w = visibleTileWindow(mp, cx, cy, 800, 600, 1, 2);
    // The window brackets the tile the camera is centred on…
    expect(windowContains(w, 128, 128)).toBe(true);
    // …and covers a small fraction of the grid.
    const count = windowTileCount(w);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(256 * 256);
  });

  it("clamps to the world edges (no negative / out-of-range tiles)", () => {
    const tl = centredOn(0, 0);
    const w0 = visibleTileWindow(mp, tl.cx, tl.cy, 800, 600, 1, 2);
    expect(w0.minTx).toBe(0);
    expect(w0.minTy).toBe(0);

    const br = centredOn(255, 255);
    const w1 = visibleTileWindow(mp, br.cx, br.cy, 800, 600, 1, 2);
    expect(w1.maxTx).toBe(255);
    expect(w1.maxTy).toBe(255);
  });

  it("keeps render-object memory FLAT as the logical grid grows", () => {
    // Same viewport, same iso centre, bigger logical grid → the window tracks the
    // VIEW, so its tile count is unchanged (away from the clamping edges).
    const huge = makeIso(1024, 1024);
    const c = { cx: mp.tileCenterToIso(128, 128).x, cy: mp.tileCenterToIso(128, 128).y };
    const small = windowTileCount(visibleTileWindow(mp, c.cx, c.cy, 800, 600, 1, 2));
    // Centre the big world's camera on its own mid-tile so neither window clamps.
    const cBig = huge.tileCenterToIso(512, 512);
    const big = windowTileCount(visibleTileWindow(huge, cBig.x, cBig.y, 800, 600, 1, 2));
    expect(big).toBe(small);
  });

  it("materialises in-window cells and virtualises off-window cells", () => {
    const { cx, cy } = centredOn(128, 128);
    const w = visibleTileWindow(mp, cx, cy, 800, 600, 1, 0);
    const VIRTUAL = { kind: "virtual" } as const;
    const materialise = (tx: number, ty: number): { kind: string } => ({ kind: `real-${tx}-${ty}` });

    expect(windowContains(w, w.minTx, w.minTy)).toBe(true);
    expect(getCellOr(w, w.minTx, w.minTy, materialise, VIRTUAL)).not.toBe(VIRTUAL);

    expect(windowContains(w, 0, 0)).toBe(false); // far corner, off-window
    expect(getCellOr(w, 0, 0, materialise, VIRTUAL)).toBe(VIRTUAL);
  });
});

describe("visibleTileWindow — ISO space, not axis-aligned (brief 110 / findings 35)", () => {
  it("covers every tile whose centre is inside the viewport rectangle", () => {
    // The invariant that actually matters: nothing visible may be left unbaked.
    // Sweep the viewport and assert each tile the camera can see is in the window.
    const { cx, cy } = centredOn(160, 96); // deliberately off the iso origin
    const viewW = 640, viewH = 480;
    const w = visibleTileWindow(mp, cx, cy, viewW, viewH, 1, 0);

    for (let ty = 0; ty < 256; ty++) {
      for (let tx = 0; tx < 256; tx++) {
        const c = mp.tileCenterToIso(tx, ty);
        const insideView =
          c.x >= cx - viewW / 2 && c.x <= cx + viewW / 2 &&
          c.y >= cy - viewH / 2 && c.y <= cy + viewH / 2;
        if (insideView) expect(windowContains(w, tx, ty)).toBe(true);
      }
    }
  });

  it("regression: an axis-aligned window would MISS visible tiles far from the origin", () => {
    // The old implementation divided each iso axis by tileSize independently. In iso
    // space the viewport's preimage is a rotated square, so that skews further from
    // the origin — which is why it only ever bit on the large MP world.
    const { cx, cy } = centredOn(200, 40); // far from origin, strongly skewed
    const viewW = 640, viewH = 480;
    const w = visibleTileWindow(mp, cx, cy, viewW, viewH, 1, 0);

    // Reproduce the old maths: treat iso px as if they were tile·TILE_SIZE px.
    const TILE = 16;
    const oldMinTx = Math.max(0, Math.floor((cx - viewW / 2) / TILE));
    const oldMaxTx = Math.min(255, Math.ceil((cx + viewW / 2) / TILE));
    const oldMinTy = Math.max(0, Math.floor((cy - viewH / 2) / TILE));
    const oldMaxTy = Math.min(255, Math.ceil((cy + viewH / 2) / TILE));
    const oldContains = (tx: number, ty: number): boolean =>
      tx >= oldMinTx && tx <= oldMaxTx && ty >= oldMinTy && ty <= oldMaxTy;

    // Find a tile that is genuinely on screen, is in the iso window, and that the
    // axis-aligned window would have missed. Such a tile must exist.
    let missed = 0;
    for (let ty = 0; ty < 256; ty++) {
      for (let tx = 0; tx < 256; tx++) {
        const c = mp.tileCenterToIso(tx, ty);
        const onScreen =
          c.x >= cx - viewW / 2 && c.x <= cx + viewW / 2 &&
          c.y >= cy - viewH / 2 && c.y <= cy + viewH / 2;
        if (onScreen && !oldContains(tx, ty)) missed++;
      }
    }
    expect(missed).toBeGreaterThan(0); // the old window left visible terrain unbaked
  });
});
