/**
 * Citadel isometric projection — the single source of truth for the diamond
 * grid (true-isometric brief, 2026-06-21).
 *
 * The sim world is an axis-aligned `WORLD_WIDTH × WORLD_HEIGHT` tile grid; iso
 * is purely a *display* of it. We project each tile `(tx, ty)` into an
 * **iso world-px** coordinate space (a diamond), and the engine's linear
 * Camera2D pans/zooms *that* space — so the shared `@engine/core` renderer never
 * needs to know about iso. Both the baked terrain (diamonds drawn into the
 * static-layer texture) and the per-entity sprite quads live in this same iso
 * world-px space, so they stay registered.
 *
 * Convention: **2:1 dimetric** — `ISO_TILE_W = 2 · ISO_TILE_H` — the pixel-art
 * isometric standard. Integer-friendly, so it stays crisp under the renderer's
 * `pixelSnap`. All math here is pure + deterministic + render-only (no sim, no
 * RNG, no determinism impact).
 */
import { WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";

// ---------------------------------------------------------------------------
// Constants (2:1 dimetric)
// ---------------------------------------------------------------------------

/** Iso tile footprint width in iso world-px (full diamond width). */
export const ISO_TILE_W = 32;
/** Iso tile footprint height in iso world-px (full diamond height = W/2). */
export const ISO_TILE_H = 16;
/** Half extents — the projection works in half-tiles. */
export const ISO_HW = ISO_TILE_W / 2; // 16
export const ISO_HH = ISO_TILE_H / 2; // 8

/**
 * Iso world-px lifted per unit of elevation (a tile or building "height"). One
 * step ≈ half a tile-height so stacked levels read clearly. Elevation lifts a
 * point UP the screen (−Y in world-px) and is otherwise just a Y offset.
 */
export const ISO_HEIGHT_STEP = 8;

/**
 * X origin shift so every projected point has `isoX ≥ 0`. The leftmost tile is
 * `(0, HEIGHT-1)` at `isoX = -(HEIGHT-1)·ISO_HW`; shifting by `+(HEIGHT-1)·ISO_HW`
 * pins it to 0. Keeps the iso world-px space non-negative (matches the
 * static-layer texture's origin-at-0 assumption).
 */
export const ISO_ORIGIN_X = (WORLD_HEIGHT - 1) * ISO_HW;

/** Total iso world-px width: the diamond spans (W + H) half-tiles across. */
export const ISO_WORLD_W = (WORLD_WIDTH + WORLD_HEIGHT) * ISO_HW;
/** Total iso world-px height: (W + H) half-tile-heights, plus one tile of pad
 *  at top (for elevation lift) and bottom (for the last diamond's lower point). */
export const ISO_WORLD_H = (WORLD_WIDTH + WORLD_HEIGHT) * ISO_HH + ISO_TILE_H;

/** Y pad at the top of the iso world so lifted/elevated points stay ≥ 0. */
export const ISO_ORIGIN_Y = ISO_TILE_H;

// ---------------------------------------------------------------------------
// Forward projection: tile / sub-tile → iso world-px
// ---------------------------------------------------------------------------

/** A point in iso world-px space (what the engine camera consumes as sprite.x/y). */
export interface IsoPoint {
  x: number;
  y: number;
}

/**
 * Project a CONTINUOUS tile coordinate `(tileX, tileY)` (fractional allowed, so
 * footprint centres and sub-tile positions work) to iso world-px. `elevation`
 * (in height steps) lifts the point up the screen. Pure.
 *
 * The diamond mapping: moving +1 in tileX goes down-right; +1 in tileY goes
 * down-left. `(0,0)` lands at the top of the diamond.
 */
export function tileToIso(tileX: number, tileY: number, elevation = 0): IsoPoint {
  return {
    x: (tileX - tileY) * ISO_HW + ISO_ORIGIN_X,
    y: (tileX + tileY) * ISO_HH + ISO_ORIGIN_Y - elevation * ISO_HEIGHT_STEP,
  };
}

/**
 * The iso world-px position of a tile's CENTER (the diamond centre). Equivalent
 * to `tileToIso(tx + 0.5, ty + 0.5)`. Handy for placing sprites whose anchor is
 * the footprint centre. Pure.
 */
export function tileCenterToIso(tileX: number, tileY: number, elevation = 0): IsoPoint {
  return tileToIso(tileX + 0.5, tileY + 0.5, elevation);
}

// ---------------------------------------------------------------------------
// Inverse projection: iso world-px → tile  (the linchpin — powers placement)
// ---------------------------------------------------------------------------

/**
 * Invert iso world-px back to a CONTINUOUS tile coordinate (no flooring), the
 * exact inverse of `tileToIso` at `elevation = 0`. Pure.
 *
 *   a = (isoX - ORIGIN_X) / ISO_HW = tileX - tileY
 *   b = (isoY - ORIGIN_Y) / ISO_HH = tileX + tileY
 *   tileX = (a + b) / 2 ;  tileY = (b - a) / 2
 */
export function isoToTileContinuous(isoX: number, isoY: number): { tileX: number; tileY: number } {
  const a = (isoX - ISO_ORIGIN_X) / ISO_HW;
  const b = (isoY - ISO_ORIGIN_Y) / ISO_HH;
  return { tileX: (a + b) / 2, tileY: (b - a) / 2 };
}

/**
 * Invert iso world-px to the integer tile under that point (floored). Used by
 * placement / ghost / drag-paint / click-select. Pure.
 *
 * NOTE: ignores elevation — Citadel's tiles are currently flat (the elevation
 * field is a render decoration, not gameplay height), so the ground plane is at
 * elevation 0 and this inverse is exact for picking.
 */
export function isoToTile(isoX: number, isoY: number): { tx: number; ty: number } {
  const { tileX, tileY } = isoToTileContinuous(isoX, isoY);
  return { tx: Math.floor(tileX), ty: Math.floor(tileY) };
}

// ---------------------------------------------------------------------------
// Diamond polygon (for the terrain bake)
// ---------------------------------------------------------------------------

/**
 * The four corners (top, right, bottom, left) of a tile's diamond in iso
 * world-px, used by the terrain bake to fill a diamond instead of a rect.
 * Returned top→right→bottom→left (clockwise) for canvas pathing. Pure.
 */
export function tileDiamond(tileX: number, tileY: number, elevation = 0): readonly IsoPoint[] {
  const c = tileCenterToIso(tileX, tileY, elevation);
  return [
    { x: c.x, y: c.y - ISO_HH }, // top
    { x: c.x + ISO_HW, y: c.y }, // right
    { x: c.x, y: c.y + ISO_HH }, // bottom
    { x: c.x - ISO_HW, y: c.y }, // left
  ];
}

// ---------------------------------------------------------------------------
// Iso depth (painter's order)
// ---------------------------------------------------------------------------

/**
 * Back-to-front depth key for a tile: larger = nearer the camera (drawn later).
 * `(tileX + tileY)` is the diamond row; ties broken by elevation. Multi-tile
 * footprints should pass their front-most (max) tile. Pure.
 */
export function isoDepth(tileX: number, tileY: number, elevation = 0): number {
  return (tileX + tileY) + elevation * 0.001;
}

// ---------------------------------------------------------------------------
// Footprint → iso sprite placement
// ---------------------------------------------------------------------------

/** An axis-aligned iso-placed sprite box + its painter's-order depth. */
export interface IsoBox {
  /** Iso world-px X of the box's top-left. */
  x: number;
  /** Iso world-px Y of the box's top-left. */
  y: number;
  /** Box width in iso world-px. */
  width: number;
  /** Box height in iso world-px. */
  height: number;
  /** Painter's-order depth (larger = nearer = drawn later). */
  depth: number;
}

/**
 * Place an iso sprite for a `w×h`-tile footprint anchored at tile `(tx, ty)`.
 * The footprint's diamond spans `(w + h)·ISO_HW` across; the sprite is an
 * axis-aligned image whose width is that diamond span and whose **bottom** sits
 * at the footprint's front (the `(tx+w-1, ty+h-1)` tile's bottom point), so the
 * art rises UP from the ground. `heightTiles` is how many tiles tall the sprite
 * art is drawn (≥1; taller buildings loom). `elevation` lifts it further. Pure.
 *
 * The diamond's top corner is at `tileToIso(tx, ty)`; its left/right points are
 * `ISO_HW·h` / `ISO_HW·w` out; its bottom point is `tileToIso(tx+w, ty+h)`. The
 * sprite box's top-left X is the diamond's leftmost point; its bottom is the
 * diamond's bottom point; its top extends up by the art height above the
 * diamond's top.
 */
export function isoFootprintBox(
  tx: number,
  ty: number,
  w: number,
  h: number,
  heightTiles = 1,
  elevation = 0,
): IsoBox {
  const top = tileToIso(tx, ty, elevation); // diamond top corner
  const leftX = top.x - h * ISO_HW; // leftmost diamond point
  const dims = isoSpriteDims(w, h, heightTiles);
  // The sprite's bottom sits at the footprint diamond's BOTTOM point; its top is
  // `dims.height` above that. This matches the authored sprite exactly so the
  // art maps 1:1 (roof at the top of the box, ground diamond at the bottom).
  const bottomY = top.y + (w + h) * ISO_HH;
  return {
    x: leftX,
    y: bottomY - dims.height,
    width: dims.width,
    height: dims.height,
    // Depth by the front-most tile so a building occludes things behind it.
    depth: isoDepth(tx + w - 1, ty + h - 1, elevation),
  };
}

/**
 * Sprite pixel dimensions for a `w×h`-tile building `heightTiles` tall — the
 * SINGLE source of truth shared by the renderer (`isoFootprintBox`) and the iso
 * sprite generators (`iso-draw.ts`), so the authored art maps 1:1 onto the quad.
 *   width  = (w + h) · ISO_HW                  (full footprint diamond width)
 *   height = roof + walls + diamond            (top of roof → bottom diamond point)
 * Pure.
 */
export function isoSpriteDims(w: number, h: number, heightTiles: number): { width: number; height: number; roofH: number; wallH: number; diaH: number } {
  const width = (w + h) * ISO_HW;
  const diaH = (w + h) * ISO_HH;
  // Walls rise ~1 tile-height per storey so a multi-storey building is clearly
  // taller; floored so even a 1-storey shack has a readable wall band.
  const wallH = Math.max(ISO_TILE_H, Math.round(heightTiles * ISO_TILE_H));
  // Roof is a shallow hip capping the full width: peak rises ~¼ the diamond
  // width. Kept modest so the WALLS stay visible (roof ≈ a third of the body),
  // unlike a full half-width diamond which would swallow the walls.
  const roofH = Math.round(width * 0.22);
  // Height budget below the roof: the wall band (top→ground mid-line) plus only
  // the LOWER half of the ground diamond. The diamond is drawn centred on the
  // wall-bottom mid-line (yBotMid), so its upper half sits *behind* the walls,
  // not below them — counting the full diaH here left a blank diaH/2 band at the
  // sprite bottom, which `isoFootprintBox` pinned to the diamond's bottom point
  // and so floated the whole building up half a tile. Use diaH/2.
  return { width, height: roofH + wallH + Math.round(diaH / 2), roofH, wallH, diaH };
}

/**
 * The axis-aligned bounding box (in iso world-px) of a `w×h`-tile footprint's
 * FLAT diamond at `(tx, ty)` — i.e. the quad to stamp the `fx/diamond` frame
 * into so it covers the footprint's ground diamond exactly. Top-left at the
 * diamond's left point + top point; size = full diamond span × full diamond
 * height. Depth by the front-most tile. Pure.
 */
export function isoFootprintDiamondBox(tx: number, ty: number, w: number, h: number, elevation = 0): IsoBox {
  const top = tileToIso(tx, ty, elevation); // diamond top corner
  const bottom = tileToIso(tx + w, ty + h, elevation); // diamond bottom corner
  const spanW = (w + h) * ISO_HW;
  return {
    x: top.x - h * ISO_HW, // leftmost point
    y: top.y, // diamond top
    width: spanW,
    height: bottom.y - top.y,
    depth: isoDepth(tx + w - 1, ty + h - 1, elevation),
  };
}

/**
 * Project a legacy axis-aligned tile-px box (x,y,w,h in `tile·TILE_SIZE` space)
 * to an iso-placed box by mapping its CENTER tile to the iso point and keeping
 * the box's pixel size. A pragmatic bridge for small decoration quads
 * (light-pool rings, ambient-crowd dots, network bands) that haven't been given
 * bespoke iso geometry yet — they land at the right diamond, just not reshaped
 * into diamonds. `tileSize` converts px→tiles. Pure.
 */
export function isoProjectTilePxBox(
  x: number,
  y: number,
  w: number,
  h: number,
  tileSize: number,
): IsoBox {
  const cxTile = (x + w / 2) / tileSize;
  const cyTile = (y + h / 2) / tileSize;
  const c = tileToIso(cxTile, cyTile);
  return {
    x: c.x - w / 2,
    y: c.y - h / 2,
    width: w,
    height: h,
    depth: isoDepth(cxTile, cyTile),
  };
}

/**
 * Place a small point sprite (villager / raider) centred on tile `(tx, ty)` —
 * fractional coords allowed (units move sub-tile). `sizePx` is the sprite's
 * iso-px size (square). Anchored so the sprite's bottom-centre sits at the tile
 * centre's iso point (feet on the ground). Pure.
 */
export function isoPointBox(tileX: number, tileY: number, sizePx: number, elevation = 0): IsoBox {
  const c = tileCenterToIso(tileX, tileY, elevation);
  return {
    x: c.x - sizePx / 2,
    y: c.y - sizePx,
    width: sizePx,
    height: sizePx,
    depth: isoDepth(tileX, tileY, elevation),
  };
}
