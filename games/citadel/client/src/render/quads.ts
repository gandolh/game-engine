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
  VillagerJob,
} from "@citadel/sim-core";
import {
  BUILDING_SPRITE_TYPES,
  buildingFrameName,
  buildingLitFrameName,
  LIT_BUILDING_TYPES,
  millFrameAt,
  unitFrameAt,
  villagerFrameName,
  villagerNameForJob,
  raiderFrameName,
  VILLAGER_FRAME,
  RAIDER_FRAME,
} from "./sprites/recipes";

/** Building types that gain a warm dusk-lit (`@lit`) window-glow frame. */
const LIT_BUILDING_SET: ReadonlySet<string> = new Set(LIT_BUILDING_TYPES);

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
  bridge: EDG.wood,
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

/**
 * Every VillagerJob value. Mirrors `VillagerJob` in
 * `@citadel/sim-core` (`VillagerJob`, the authoritative union). `VILLAGER_JOB_COLORS`
 * is typed `Record<VillagerJob, string>`, so adding a job to the union is a COMPILE
 * error here until it gets a color — totality is enforced by the type, not just the test.
 */

/**
 * Complete set of job values (runtime array for totality checks). Typed against the
 * real `VillagerJob` union so it can't silently drift from the sim.
 */
export const ALL_VILLAGER_JOBS: readonly VillagerJob[] = [
  "farmer",
  "miller",
  "baker",
  "woodcutter",
  "quarryman",
  "miner",
  "sawyer",
  "smith",
  "priest",
  "trader",
  "watchman",
  "soldier",
  "healer",
  "idle",
] as const;

/**
 * Primary body tint per villager job (EDG32 only). This is the "who is this"
 * read — the color that tells a player a job role at a glance.
 *
 * Composition decision: `job` drives the ONLY tint. The old FSM-state cue
 * (VILLAGER_COLORS) is dropped from the body tint channel because composing
 * two independent dimensions (job + FSM) on the same tint would muddy both
 * reads — a baker-walking-to-work would look neither like a baker nor like a
 * traveller. A future per-villager mood layer (posture/desaturation) will
 * carry the FSM cue instead, keeping the body tint cleanly job-only.
 *
 * Color rationale:
 *   farmer     — green (crops / fields)
 *   miller     — cream (flour dust)
 *   baker      — tan / warm brown (baked bread)
 *   woodcutter — wood brown (timber)
 *   quarryman  — slate grey (stone)
 *   miner      — ink / dark grey (deep rock)
 *   sawyer     — dark green (sawdust / forest)
 *   smith      — crimson (forge fire)
 *   priest     — white (vestments)
 *   trader     — gold (commerce)
 *   watchman   — blue (guard livery)
 *   soldier    — navy (armour)
 *   healer     — cyan (medicine / water)
 *   idle       — silver (neutral / unassigned)
 */
export const VILLAGER_JOB_COLORS: Record<VillagerJob, string> = {
  farmer:     EDG.greenMid,
  miller:     EDG.cream,
  baker:      EDG.tan,
  woodcutter: EDG.wood,
  quarryman:  EDG.slate,
  miner:      EDG.ink,
  sawyer:     EDG.greenDark,
  smith:      EDG.crimson,
  priest:     EDG.white,
  trader:     EDG.gold,
  watchman:   EDG.blue,
  soldier:    EDG.navy,
  healer:     EDG.cyan,
  idle:       EDG.silver,
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
  /**
   * Optional render-only billboard lean (radians) along the figure's heading —
   * set by moving units (ambient crowd) for legibility. Defaults to 0 (upright).
   */
  lean?: number;
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
 *
 * Coordinate convention bridge: a `QuadSpec` (like every iso box helper) is a
 * TOP-LEFT rect (x,y = top-left, +width/height down-right), but the engine
 * sprite-batch anchors sprites by their CENTRE (both backends draw `pos ±
 * 0.5·size` — see sprite.wgsl / canvas2d draw.ts). So we convert here by adding
 * half-extents; without this every iso sprite renders shifted up-left by half
 * its size (buildings float off their footprint, the ghost sits left of the
 * cursor).
 */
export function quadToSprite(q: QuadSpec, layer: number, alpha = 1, sortY?: number): Canvas2dSprite {
  return {
    atlasId: QUAD_ATLAS_ID,
    frame: q.frame ?? QUAD_FRAME,
    x: q.x + q.width / 2,
    y: q.y + q.height / 2,
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
export function buildingQuad(b: BuildingSnapshot, clockMs?: number, nightFactor = 0): QuadSpec {
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
    // burning. Footprint-sized so the frame scales 1:1 (nearest-crisp). The mill
    // animates: when a render clock is supplied, pick its rotated-sail frame.
    // At dusk/night an eligible building swaps to its warm-window-glow `@lit`
    // frame (the strongest cozy cue) — but never while burning (fire read wins).
    const lit = !b.burning && nightFactor > 0.45 && LIT_BUILDING_SET.has(b.type);
    const frame = b.type === "mill" && clockMs !== undefined
      ? millFrameAt(clockMs)
      : lit
        ? buildingLitFrameName(b.type)
        : buildingFrameName(b.type);
    return {
      x: px,
      y: py,
      width: pw,
      height: ph,
      tintRgba: packTint(b.burning ? EDG.orange : EDG.white),
      frame,
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
const FLAT_TYPES = new Set(["road", "wall", "gate", "bridge"]);

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
 * frame is a grey-ramp silhouette; the job color is applied as the tint
 * (texture × tint) so a player can read each villager's role at a glance.
 *
 * Tint source: `v.job` drives the primary body tint via `VILLAGER_JOB_COLORS`.
 * The old FSM-state cue (walkToWork/work/etc.) is deliberately NOT composed
 * here — layering two independent color signals on one tint channel muddied
 * both reads. `v.mood` is NOT composed into the tint here either: job stays
 * this function's one job (pun intended) and mood is applied as a separate
 * alpha/posture layer by the caller (see `villagerAlphaForMood` /
 * `villagerSlumpOffset` in citadel-fx.ts, applied in the renderer's villager
 * draw loop) — mirroring how house mood-dim composes on top of `buildingQuad`.
 */
export function villagerQuad(v: VillagerSnapshot, clockMs?: number): QuadSpec {
  // Sized up for the 32×32 iso figure art (was 0.7 tiles for the old 16px sprite).
  const size = TILE_SIZE * 1.1;
  const cx = v.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = v.y * TILE_SIZE + TILE_SIZE / 2;
  // Cast v.job (snapshot field is widened to `string`, like fsm/carryGood) to the
  // VillagerJob union. The sim only writes known job values; any unmapped value falls
  // back to neutral silver via FALLBACK_VILLAGER_COLOR.
  const hex = VILLAGER_JOB_COLORS[v.job as VillagerJob] ?? FALLBACK_VILLAGER_COLOR;
  // Idle-sway / walk-cycle animation (render-only, like the mill sails). Stagger
  // each figure by its id so the crowd doesn't lock-step — `unitFrameAt`'s phaseMs.
  // art-05: pick the JOB's role-accessory frame family (falls back to the plain
  // `vil/person` body for jobs with no accessory) so a farmer/smith/priest reads
  // by silhouette, not just tint. Static fallback keeps the plain base frame.
  const nameFor = villagerNameForJob(v.job);
  const frame = clockMs !== undefined
    ? unitFrameAt(clockMs, nameFor, 900, (v.id % 5) * 180)
    : nameFor(0);
  return { x: cx - size / 2, y: cy - size / 2, width: size, height: size, tintRgba: packTint(hex), frame };
}

/** Raider strength tiers — the silhouette cue, not just size (legibility todo). */
export type RaiderTier = "weak" | "normal" | "strong" | "elite";

/** Classify a raider by strength so its shape communicates threat at a glance. */
export function raiderTier(strength: number): RaiderTier {
  if (strength < 15) return "weak";
  if (strength < 30) return "normal";
  if (strength < 50) return "strong";
  return "elite";
}

/**
 * Map a raider snapshot to a red-tinted sprite quad whose SHAPE — not only size —
 * communicates strength (entity-silhouette-legibility todo):
 *   weak   → thin & small
 *   normal → baseline figure
 *   strong → wide & blocky
 *   elite  → tall + a brighter crimson, reading as a champion
 * Size still scales with strength so big raids loom; the aspect/tint make the
 * tier readable during the march. Pure — derives only from snapshot strength.
 */
export function raiderQuad(r: RaiderSnapshot, clockMs?: number): QuadSpec {
  const tier = raiderTier(r.strength);
  // Base size still grows with strength (0.4..1.0 tiles), as before.
  const base = TILE_SIZE * (0.4 + Math.min(0.6, r.strength / 60));
  // Per-tier aspect: weak is narrow, strong is broad, elite is tall.
  const aspect: Record<RaiderTier, { wx: number; hy: number; hex: string }> = {
    weak:   { wx: 0.7, hy: 0.85, hex: EDG.red },
    normal: { wx: 1.0, hy: 1.0,  hex: EDG.red },
    strong: { wx: 1.3, hy: 1.0,  hex: EDG.red },
    elite:  { wx: 1.15, hy: 1.3, hex: EDG.crimson },
  };
  const a = aspect[tier];
  const w = base * a.wx;
  const h = base * a.hy;
  const cx = r.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = r.y * TILE_SIZE + TILE_SIZE / 2;
  // Idle-sway / walk-cycle (render-only), staggered per raider so a marching
  // warband doesn't move in perfect unison.
  const frame = clockMs !== undefined
    ? unitFrameAt(clockMs, raiderFrameName, 820, (r.id % 5) * 160)
    : RAIDER_FRAME;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h, tintRgba: packTint(a.hex), frame };
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
