/**
 * Citadel 21 — render-windowed sparse grid (large-map renderer).
 *
 * Lineage: tiny-world-builder's "intent-full / render-windowed" model — the
 * logical grid may be huge (256×256 for the MP world, brief 29), but only the
 * camera-centred window needs materialised render objects; off-window cells come
 * from a virtual default via {@link getCellOr} rather than preallocation, so
 * render-object memory stays flat as the logical grid grows.
 *
 * This module is the PURE, testable core (window math + virtualisation). Wiring
 * it into the engine WebGPU static-layer bake (a windowed/offset bake re-run on
 * pan) is the remaining engine step — it needs `bakeStaticLayer` to accept a
 * sub-region offset, and is verifiable only on a real GPU.
 *
 * Render-only; no determinism impact.
 */

export interface TileWindow {
  readonly minTx: number;
  readonly minTy: number;
  readonly maxTx: number;
  readonly maxTy: number;
}

/**
 * The inclusive tile bounds visible to a camera centred at (cx, cy) world-px,
 * with a `viewW × viewH` px viewport at `zoom`, clamped to a `worldTilesW ×
 * worldTilesH` grid and padded by `pad` tiles (so a tile entering the edge is
 * already materialised).
 */
export function visibleTileWindow(
  cx: number,
  cy: number,
  viewW: number,
  viewH: number,
  zoom: number,
  tileSize: number,
  worldTilesW: number,
  worldTilesH: number,
  pad = 2,
): TileWindow {
  const z = zoom > 0 ? zoom : 1;
  const halfW = viewW / 2 / z;
  const halfH = viewH / 2 / z;
  const minTx = Math.max(0, Math.floor((cx - halfW) / tileSize) - pad);
  const minTy = Math.max(0, Math.floor((cy - halfH) / tileSize) - pad);
  const maxTx = Math.min(worldTilesW - 1, Math.ceil((cx + halfW) / tileSize) + pad);
  const maxTy = Math.min(worldTilesH - 1, Math.ceil((cy + halfH) / tileSize) + pad);
  return { minTx, minTy, maxTx, maxTy };
}

/** Number of tiles in the window (the render-object allocation count). */
export function windowTileCount(w: TileWindow): number {
  if (w.maxTx < w.minTx || w.maxTy < w.minTy) return 0;
  return (w.maxTx - w.minTx + 1) * (w.maxTy - w.minTy + 1);
}

export function windowContains(w: TileWindow, tx: number, ty: number): boolean {
  return tx >= w.minTx && tx <= w.maxTx && ty >= w.minTy && ty <= w.maxTy;
}

/**
 * tiny-world's `getWorldCell`: in-window cells are materialised; off-window cells
 * return the virtual default instead of being preallocated.
 */
export function getCellOr<T>(
  w: TileWindow,
  tx: number,
  ty: number,
  materialise: (tx: number, ty: number) => T,
  virtualDefault: T,
): T {
  return windowContains(w, tx, ty) ? materialise(tx, ty) : virtualDefault;
}
