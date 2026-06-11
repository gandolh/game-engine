export interface Canvas2dSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;
  /** Atlas sheet id for this sprite's frame. addAtlas() supports replacing a sheet after first render — the swap seam is open by design. */
  atlasId: string;
  rotation: number;
  layer: number;
  alpha: number;
  /** Depth key for y-sort (defaults to `y`). For vertical-face sprites (walls, cliffs) set this to the
   *  face's bottom edge so characters behind it are correctly occluded. Drawing position is unchanged. */
  sortY?: number;
  /** Pseudo-3D height above the ground, world px. The sprite is drawn lifted up the screen by `z`
   *  (screenY = y - z) while `(x, y)` stays the ground/shadow point and the y-sort key is unchanged.
   *  Defaults to 0 → exact non-elevated behaviour. Clamp callers to z ≥ 0. */
  z?: number;
  /** When true, this sprite gets an "x-ray" pass: if a taller world sprite drawn in front of it
   *  (later in sort order, non-UI layer) overlaps its rect, it is re-drawn on top at low alpha so it
   *  stays partially visible behind walls/buildings. Flag only a few sprites (e.g. the player) — the
   *  pass scans the draw tail per flagged sprite. Absent/false = no extra work. */
  occludable?: boolean;
  flipX?: boolean;
  /** RGB multiply tint as 0xRRGGBBAA. 0xffffffff/absent = no tint. Applied via a pooled offscreen buffer — never leaks. */
  tintRgba?: number;
}

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
