/**
 * Citadel 21 — render-windowed sparse grid (large-map renderer).
 *
 * Lineage: tiny-world-builder's "intent-full / render-windowed" model — the
 * logical grid may be huge (256×256 for the MP world, brief 29), but only the
 * camera-centred window needs materialised render objects; off-window cells come
 * from a virtual default via {@link getCellOr} rather than preallocation, so
 * render-object memory stays flat as the logical grid grows.
 *
 * Windowing is **mandatory** on the MP world, not an optimisation: its iso extent
 * is 8192 × 4112 px ⇒ ~134.7 MB of RGBA static-layer texture, and the width sits
 * exactly on WebGPU's default `maxTextureDimension2D` (8192). A whole-world bake
 * would fail to allocate. Small worlds (solo's 96×96 ⇒ 3072 × 1552) bake whole.
 *
 * This module is the PURE, testable core (window math + virtualisation); the
 * engine wiring lives in `window-controller.ts`.
 *
 * Render-only; no determinism impact.
 */
import type { IsoProjection } from "./iso";

export interface TileWindow {
  readonly minTx: number;
  readonly minTy: number;
  readonly maxTx: number;
  readonly maxTy: number;
}

/**
 * The inclusive tile bounds visible to a camera centred at (cx, cy) **iso**
 * world-px, with a `viewW × viewH` px viewport at `zoom`, clamped to the
 * projection's grid and padded by `pad` tiles (so a tile entering the edge is
 * already materialised).
 *
 * ## Why the four corners (brief 110 / review findings item 35)
 *
 * The camera frames ISO world-px, but the window we want is a range of TILES.
 * The old implementation divided each iso axis by `tileSize` independently —
 * valid only in axis-aligned space. In iso space the viewport rectangle's
 * preimage is a **rotated square** (a diamond in tile space), so its tile bounds
 * are the bounding box of the four inverted viewport corners, not a per-axis
 * division. Getting this wrong skews the window off the camera as you pan away
 * from the origin — worse the further you go, which is why it was only visible
 * on the large MP world.
 *
 * `isoToTileContinuous` is exactly linear, so inverting the four corners and
 * taking min/max is exact (no sampling needed).
 */
export function visibleTileWindow(
  iso: IsoProjection,
  cx: number,
  cy: number,
  viewW: number,
  viewH: number,
  zoom: number,
  pad = 2,
): TileWindow {
  const z = zoom > 0 ? zoom : 1;
  const halfW = viewW / 2 / z;
  const halfH = viewH / 2 / z;
  const x0 = cx - halfW, x1 = cx + halfW;
  const y0 = cy - halfH, y1 = cy + halfH;

  // Invert the viewport's four corners into continuous tile space; the visible
  // tile set is the bbox of those four points (the rotated square's extent).
  const corners = [
    iso.isoToTileContinuous(x0, y0),
    iso.isoToTileContinuous(x1, y0),
    iso.isoToTileContinuous(x0, y1),
    iso.isoToTileContinuous(x1, y1),
  ];
  let loX = Infinity, hiX = -Infinity, loY = Infinity, hiY = -Infinity;
  for (const c of corners) {
    if (c.tileX < loX) loX = c.tileX;
    if (c.tileX > hiX) hiX = c.tileX;
    if (c.tileY < loY) loY = c.tileY;
    if (c.tileY > hiY) hiY = c.tileY;
  }

  const minTx = Math.max(0, Math.floor(loX) - pad);
  const minTy = Math.max(0, Math.floor(loY) - pad);
  const maxTx = Math.min(iso.worldTilesW - 1, Math.ceil(hiX) + pad);
  const maxTy = Math.min(iso.worldTilesH - 1, Math.ceil(hiY) + pad);
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
