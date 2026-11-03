/** A world-px rect, as the static-layer bake hands its decorators (the engine's `StaticRegion`). */
export interface TileRegionPx {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The tiles a decorator has to paint for a bake of `region` (the whole `cols × rows` grid when
 * absent): every tile that overlaps it, as half-open ranges. A patch bake then paints its own
 * tiles only; the canvas clips anything outside the patch anyway.
 */
export function tileSpan(
  cols: number,
  rows: number,
  tilePx: number,
  region?: TileRegionPx,
): { tx0: number; ty0: number; tx1: number; ty1: number } {
  if (!region) return { tx0: 0, ty0: 0, tx1: cols, ty1: rows };
  return {
    tx0: Math.max(0, Math.floor(region.originX / tilePx)),
    ty0: Math.max(0, Math.floor(region.originY / tilePx)),
    tx1: Math.min(cols, Math.ceil((region.originX + region.width) / tilePx)),
    ty1: Math.min(rows, Math.ceil((region.originY + region.height) / tilePx)),
  };
}
