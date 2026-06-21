/**
 * Quad primitive: color maps (EDG), tint packing, QuadSpec, and the per-entity
 * quad builders (building, villager, raider, ghost). All pure — no GPU, no
 * renderer dependency. Also owns the generated 1×1 atlas id/frame constants and
 * the quadToSprite helper that wraps a QuadSpec for the sprite-batch.
 */
import {
  EDG,
  rgbOf,
} from "@engine/core";
import type { Canvas2dSprite } from "@engine/core";
import {
  TerrainType,
  TILE_SIZE,
} from "@citadel/sim-core";
import type {
  BuildingSnapshot,
  VillagerSnapshot,
  RaiderSnapshot,
} from "@citadel/sim-core";
import {
  BUILDING_SPRITE_TYPES,
  buildingFrameName,
  VILLAGER_FRAME,
  RAIDER_FRAME,
} from "./sprites/recipes";

// ---------------------------------------------------------------------------
// Color maps (EDG only) — ported verbatim from the deleted Canvas2D renderers.
// ---------------------------------------------------------------------------

/** EDG palette color per terrain type. Covers every TerrainType. */
export const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.Grass]: EDG.greenMid,
  [TerrainType.Water]: EDG.skyBlue,
  [TerrainType.Forest]: EDG.greenDark,
  [TerrainType.Stone]: EDG.slate,
  [TerrainType.Rough]: EDG.tan, // sandy scrubland — softer/more natural than the salmon `wood` brown
};

/** EDG color per building type. */
export const BUILDING_COLORS: Record<string, string> = {
  house: EDG.clay,
  farm: EDG.greenMid,
  mill: EDG.cream,
  bakery: EDG.tan,
  woodcutter: EDG.wood,
  storehouse: EDG.steel,
  road: EDG.navy,
  chapel: EDG.white,
  market: EDG.gold,
  watchpost: EDG.silver,
  tradingpost: EDG.mauve,
  quarry: EDG.slate,
  sawmill: EDG.greenDark,
  smith: EDG.crimson,
  mine: EDG.ink,
  wall: EDG.steel,
  gate: EDG.gold,
  tower: EDG.navy,
  garrison: EDG.blue,
  keep: EDG.plum,
  well: EDG.skyBlue,
  healer: EDG.green,
};

/** EDG color per villager FSM state. */
export const VILLAGER_COLORS: Record<string, string> = {
  idle: EDG.silver,
  walkToWork: EDG.yellow,
  work: EDG.orange,
  haulToStore: EDG.cyan,
  walkHome: EDG.salmon,
};

export const FALLBACK_BUILDING_COLOR = EDG.steel;
export const FALLBACK_VILLAGER_COLOR = EDG.white;

// ---------------------------------------------------------------------------
// Color packing
// ---------------------------------------------------------------------------

/**
 * Pack an EDG hex string into a `0xRRGGBBAA` int for `Sprite.tintRgba`.
 * `alpha` defaults to fully opaque (0xff). Pure — used by both the renderer
 * and the tests.
 */
export function packTint(hex: string, alpha = 0xff): number {
  const [r, g, b] = rgbOf(hex);
  // >>> 0 keeps the result an unsigned 32-bit int.
  return (((r << 24) | (g << 16) | (b << 8) | (alpha & 0xff)) >>> 0);
}

// ---------------------------------------------------------------------------
// QuadSpec
// ---------------------------------------------------------------------------

export interface QuadSpec {
  /** World-px X of the quad's top-left. */
  x: number;
  /** World-px Y of the quad's top-left. */
  y: number;
  /** Quad width in world px. */
  width: number;
  /** Quad height in world px. */
  height: number;
  /** Packed 0xRRGGBBAA tint. */
  tintRgba: number;
  /**
   * Atlas frame to sample. Defaults to the 1×1 white `px` frame (so all the
   * tinted-box paths — ghost, light-pool, wear, autotile networks, cluster
   * border, ambient crowd — are unchanged). Per-entity sprite quads set this to
   * a real frame (`bld/<type>`, `vil/person`, `raider`).
   */
  frame?: string;
}

// ---------------------------------------------------------------------------
// Atlas constants + quadToSprite
// ---------------------------------------------------------------------------

/** The atlas id for the generated 1×1 white quad sheet. */
export const QUAD_ATLAS_ID = "citadel-quads";
/** The single frame name in that atlas. */
export const QUAD_FRAME = "px";

/**
 * Build the Sprite the sprite-batch consumes from a QuadSpec + layer. `sortY`
 * (optional) overrides the within-layer painter's-order key — for isometric we
 * set it to the iso depth so entities on the same layer occlude back-to-front
 * regardless of their (already-projected) screen Y.
 */
export function quadToSprite(q: QuadSpec, layer: number, alpha = 1, sortY?: number): Canvas2dSprite {
  return {
    atlasId: QUAD_ATLAS_ID,
    frame: q.frame ?? QUAD_FRAME,
    x: q.x,
    y: q.y,
    width: q.width,
    height: q.height,
    rotation: 0,
    layer,
    alpha,
    tintRgba: q.tintRgba,
    ...(sortY !== undefined ? { sortY } : {}),
  };
}

// ---------------------------------------------------------------------------
// Building → quad mapping (pure, tested)
// ---------------------------------------------------------------------------

/**
 * Map a building snapshot to its quad. Buildings with a sprite recipe fill their
 * full footprint and sample the real `bld/<type>` frame at full opacity (tint =
 * white, so the recipe's own colors show); a burning building multiplies its
 * tint toward orange (preserving the old fire cue, on top of the soot/wear
 * overlay). Roads draw as a centered inset band and gates as an inset gold
 * block (both keep the tinted 1×1 `px` path — no sprite). A type without a
 * recipe falls back to a solid tinted box (never requesting a missing frame).
 * Pure — no GPU.
 */
export function buildingQuad(b: BuildingSnapshot): QuadSpec {
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const pw = b.w * TILE_SIZE;
  const ph = b.h * TILE_SIZE;

  if (b.type === "road") {
    const inset = TILE_SIZE * 0.25;
    return {
      x: px + inset,
      y: py + inset,
      width: pw - inset * 2,
      height: ph - inset * 2,
      tintRgba: packTint(BUILDING_COLORS.road ?? FALLBACK_BUILDING_COLOR),
    };
  }

  if (b.type === "gate") {
    const inset = TILE_SIZE * 0.15;
    return {
      x: px + inset,
      y: py + inset,
      width: pw - inset * 2,
      height: ph - inset * 2,
      tintRgba: packTint(BUILDING_COLORS.gate ?? FALLBACK_BUILDING_COLOR),
    };
  }

  if (BUILDING_SPRITE_TYPES.has(b.type)) {
    // Real sprite: tint white so the recipe colors show; orange-multiply when
    // burning. Footprint-sized so the frame scales 1:1 (nearest-crisp).
    return {
      x: px,
      y: py,
      width: pw,
      height: ph,
      tintRgba: packTint(b.burning ? EDG.orange : EDG.white),
      frame: buildingFrameName(b.type),
    };
  }

  // Fallback: a type with no recipe (e.g. a future building) → tinted box.
  const hex = b.burning ? EDG.orange : (BUILDING_COLORS[b.type] ?? FALLBACK_BUILDING_COLOR);
  return { x: px, y: py, width: pw, height: ph, tintRgba: packTint(hex) };
}

// ---------------------------------------------------------------------------
// Directional building shadow (idea ported from tiny-world-builder's low sun)
// ---------------------------------------------------------------------------

/** Shadow tint alpha — soft, so it reads as ground-shade not a black box. */
export const SHADOW_ALPHA = Math.round(0xff * 0.22);
/** Shadow offset toward the SE (sun from the NW), as a fraction of TILE_SIZE. */
export const SHADOW_OFFSET = TILE_SIZE * 0.18;

/**
 * Building types that DON'T cast a drop-shadow: flat ground features (road,
 * wall, gate) that sit in the terrain plane rather than rising out of it.
 */
const FLAT_TYPES = new Set(["road", "wall", "gate"]);

/**
 * A soft SE-offset ground shadow behind a building, faking a low NW sun so every
 * structure reads with a little volume — the 2D echo of tiny-world-builder's
 * directional sun shading. Returns `null` for flat ground features (roads,
 * walls, gates), which sit in the terrain plane and cast nothing. The quad is
 * footprint-sized, ink-tinted, and translucent; the caller pushes it on a layer
 * just below the building sprite. Pure — no GPU.
 */
export function buildingShadowQuad(b: BuildingSnapshot): QuadSpec | null {
  if (FLAT_TYPES.has(b.type)) return null;
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const pw = b.w * TILE_SIZE;
  const ph = b.h * TILE_SIZE;
  return {
    x: px + SHADOW_OFFSET,
    y: py + SHADOW_OFFSET,
    width: pw,
    height: ph,
    tintRgba: packTint(EDG.ink, SHADOW_ALPHA),
  };
}

/**
 * Map a villager snapshot to a small centered sprite quad. The `vil/person`
 * frame is a grey-ramp silhouette; the FSM-state color is applied as the tint
 * (texture × tint), so state still reads at a glance but now on a shaded figure.
 */
export function villagerQuad(v: VillagerSnapshot): QuadSpec {
  const size = TILE_SIZE * 0.7;
  const cx = v.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = v.y * TILE_SIZE + TILE_SIZE / 2;
  const hex = VILLAGER_COLORS[v.fsm] ?? FALLBACK_VILLAGER_COLOR;
  return { x: cx - size / 2, y: cy - size / 2, width: size, height: size, tintRgba: packTint(hex), frame: VILLAGER_FRAME };
}

/** Map a raider snapshot to a red-tinted sprite quad sized by strength. */
export function raiderQuad(r: RaiderSnapshot): QuadSpec {
  // Strength grows the footprint (matches old radius scaling: 0.4..1.0 tiles).
  const half = TILE_SIZE * (0.4 + Math.min(0.6, r.strength / 60));
  const cx = r.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = r.y * TILE_SIZE + TILE_SIZE / 2;
  return { x: cx - half, y: cy - half, width: half * 2, height: half * 2, tintRgba: packTint(EDG.red), frame: RAIDER_FRAME };
}

// ---------------------------------------------------------------------------
// Ghost preview quad
// ---------------------------------------------------------------------------

/** Ghost / drag-paint preview alpha (translucent over the world). */
export const GHOST_ALPHA = Math.round(0xff * 0.45);

/**
 * Map a ghost-preview cell to a translucent colored quad (green = valid,
 * red = invalid). Pure — used by `pushGhost` and the tests.
 *
 * NOTE: the ghost is drawn as a **sprite-batch quad**, not via the `endFrame`
 * overlay callback. The WebGPU renderer's `endFrame(overlay)` parameter is a
 * no-op (it only uses its overlay canvas for particles / weather / wash — see
 * webgpu/renderer.ts), so an OverlayFn would never render on the backend
 * Citadel actually uses at runtime. A translucent quad in the sprite-batch is
 * the path that works on WebGPU and keeps everything going through brief 20's
 * batch.
 */
export function ghostQuad(tileX: number, tileY: number, w: number, h: number, valid: boolean): QuadSpec {
  return {
    x: tileX * TILE_SIZE,
    y: tileY * TILE_SIZE,
    width: w * TILE_SIZE,
    height: h * TILE_SIZE,
    tintRgba: packTint(valid ? EDG.green : EDG.red, GHOST_ALPHA),
  };
}
