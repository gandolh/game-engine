/**
 * Static-layer sub-region math (pure, deterministic, tested).
 *
 * A {@link StaticRegion} describes a windowed bake of the static layer: the
 * baked texture is `width × height` px and covers world rect
 * `[originX, originY] → [originX + width, originY + height]`. The renderer bakes
 * only the camera-centred window of a large world (Citadel 21/22) instead of
 * the whole grid, so texture memory stays proportional to the viewport rather
 * than the logical grid.
 *
 * The whole-world default (`origin 0`, `size = world`) makes every consumer that
 * never passes a region — Farm Valley, solo Citadel — byte-identical to the
 * pre-windowing path (see {@link staticBlitRect}). GPU/Canvas2D draw both route
 * their src/dst rects through `staticBlitRect`, so they stay in lockstep.
 */

export interface StaticRegion {
  /** World-px X of the baked texture's left edge. */
  readonly originX: number;
  /** World-px Y of the baked texture's top edge. */
  readonly originY: number;
  /** Baked texture width in px (the region's world-px width). */
  readonly width: number;
  /** Baked texture height in px (the region's world-px height). */
  readonly height: number;
}

/**
 * Normalize an optional region to a concrete one. Absent → the whole world
 * (origin 0, size = the rounded world dimensions), which reproduces the
 * pre-windowing bake exactly. Origins are floored and sizes ceiled so the
 * texture is integer-pixel-sized.
 */
export function resolveStaticRegion(
  worldWidth: number,
  worldHeight: number,
  region?: StaticRegion,
): StaticRegion {
  if (region) {
    return {
      originX: Math.floor(region.originX),
      originY: Math.floor(region.originY),
      width: Math.max(1, Math.ceil(region.width)),
      height: Math.max(1, Math.ceil(region.height)),
    };
  }
  return {
    originX: 0,
    originY: 0,
    width: Math.max(1, Math.ceil(worldWidth)),
    height: Math.max(1, Math.ceil(worldHeight)),
  };
}

export interface StaticBlit {
  /** Source rect within the baked texture (px). */
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  /** Destination rect in world px. */
  dstL: number;
  dstT: number;
  dstW: number;
  dstH: number;
}

/**
 * Intersect the camera-visible world rect with the baked region and return the
 * texture-source + world-destination rects, or `null` when the region isn't
 * visible (nothing to draw). The caller passes the visible rect already clamped
 * to the logical world; this clamps further to the baked region so we never
 * sample outside the texture.
 *
 * For a full-world region this returns `src == dst == the visible rect` — i.e.
 * the pre-windowing behaviour, byte for byte.
 */
export function staticBlitRect(
  visL: number,
  visT: number,
  visR: number,
  visB: number,
  region: StaticRegion,
): StaticBlit | null {
  const regR = region.originX + region.width;
  const regB = region.originY + region.height;
  const dstL = Math.max(visL, region.originX);
  const dstT = Math.max(visT, region.originY);
  const dstR = Math.min(visR, regR);
  const dstB = Math.min(visB, regB);
  const dstW = dstR - dstL;
  const dstH = dstB - dstT;
  if (dstW <= 0 || dstH <= 0) return null;
  return {
    srcX: dstL - region.originX,
    srcY: dstT - region.originY,
    srcW: dstW,
    srcH: dstH,
    dstL,
    dstT,
    dstW,
    dstH,
  };
}
