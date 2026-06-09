export interface Canvas2dSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;
  /**
   * Id of the atlas sheet that owns this sprite's frame. Must match one of the
   * sheet ids in the renderer's atlas map (e.g. "terrain", "buildings",
   * "characters"). Set centrally by frameToAtlasId (render-systems.ts) so every
   * sprite automatically resolves against the correct sheet.
   *
   * Design decision (brief 47 open question): `addAtlas` deliberately supports
   * adding/replacing a sheet after first render so brief 45's seasonal terrain
   * swap can call `addAtlas(newTerrainAtlas)` without rebuilding all sheets. No
   * lazy-loading or hot-swap machinery is built — just the seam is left open.
   */
  atlasId: string;
  rotation: number;
  layer: number;
  alpha: number;
  /** Mirror horizontally about the sprite center (for left/right facing from a
   *  single side-profile frame). Optional; defaults to false. */
  flipX?: boolean;
  /**
   * Optional RGB multiply tint as 0xRRGGBBAA. The RGB channels multiply the
   * frame's pixels (white 0xffffff = unchanged); the low alpha byte is folded
   * into the sprite's `alpha`. Used by Farm Valley's visual state indicators
   * (thirsty/dying crops, exhausted/broken-tool farmers). Absent or 0xffffffff
   * means no tint. The tint is applied per-sprite via a pooled offscreen buffer
   * so it never leaks into other sprites. */
  tintRgba?: number;
}

/** Minimal 2D context surface the renderer needs — satisfied by both
 *  CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D. */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
