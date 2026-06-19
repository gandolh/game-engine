/**
 * Procedural wear / decay overlay (brief 24) — pure helpers + push function.
 *
 * SCOPE NOTE / DEFERRAL. The brief's ideal is a per-building procedural-noise
 * WGSL wear shader (cracks/erosion/soot via fxHash/fxNoise/fxFbm) injected into
 * the engine tint-pass and driven by a continuous `wear`/`age` UNIFORM. That
 * ideal is DEFERRED here because it needs two things this brief deliberately
 * does NOT touch:
 *   (a) an engine-side WGSL / tint-pass extension (out of scope — @engine/core),
 *   (b) a sim-side `age`/`wear` field on the building (out of scope — it would
 *       touch @citadel/sim-core and the determinism surface).
 * What ships instead is the achievable RENDER-ONLY slice: a fire-damage soot /
 * scorch overlay driven entirely by data the snapshot ALREADY carries
 * (`burning` / `onFire`). `wearOverlayQuads` is pure given (building, factor),
 * returns extra translucent dark quads to stamp just above the building, and is
 * empty for a healthy building. Intensity ramps with an optional render-clock
 * `factor` (0..1) so soot appears to accumulate visually while a fire burns —
 * the ramp is render-side only and never persisted or fed back into the sim.
 */
import { EDG } from "@engine/core";
import type { RendererLike } from "@engine/core";
import { TILE_SIZE } from "@citadel/sim-core";
import type { BuildingSnapshot } from "@citadel/sim-core";
import { packTint, quadToSprite } from "./quads";
import type { QuadSpec } from "./quads";

/** Soot/scorch layer — just above buildings, below villagers. */
const LAYER_WEAR = 11;

/** Max alpha of the soot fill at full intensity (translucent dark wash). */
const WEAR_SOOT_MAX_ALPHA = 0.55;
/** Alpha of the cracked-edge accent quads at full intensity. */
const WEAR_CRACK_MAX_ALPHA = 0.5;

/**
 * Compute the render-only wear factor (0..1) a building currently shows. Driven
 * purely by snapshot fire state: a `burning` building ramps toward full soot
 * over `clockMs` (render clock, e.g. performance.now since it ignited — passed
 * in by the caller so this stays pure/deterministic for a given input); a
 * building merely `onFire` (ignited but not yet actively burning) shows a light
 * baseline scorch; a healthy building is 0. Pure.
 */
export function wearFactor(b: BuildingSnapshot, clockMs = 0): number {
  if (b.burning) {
    // Ramp 0→1 over ~4s of burning so soot "accumulates" visually.
    const ramped = Math.min(1, Math.max(0, clockMs) / 4000);
    // Floor at 0.4 so an actively-burning building always reads as damaged.
    return 0.4 + 0.6 * ramped;
  }
  if (b.onFire) return 0.25;
  return 0;
}

/**
 * Produce the soot/scorch overlay quads for a building, given a wear `factor`
 * (0..1, typically from `wearFactor`). Returns an EMPTY array when the building
 * is undamaged (factor <= 0) so healthy buildings add zero draws. Otherwise:
 *   - one dark translucent soot fill over the full footprint (EDG.ink), its
 *     alpha scaled by `factor`;
 *   - two short cracked-edge accent quads (EDG.woodDark) along the top and a
 *     diagonal-ish corner, appearing only past a moderate factor — the "cracks"
 *     stand-in for the deferred procedural-noise cracks.
 * Pure — no GPU, no clock, deterministic in (building, factor). EDG-only.
 */
export function wearOverlayQuads(b: BuildingSnapshot, factor: number): QuadSpec[] {
  if (factor <= 0) return [];
  const f = Math.min(1, factor);
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const pw = b.w * TILE_SIZE;
  const ph = b.h * TILE_SIZE;

  const quads: QuadSpec[] = [];

  // Soot wash over the whole footprint.
  const sootAlpha = Math.round(0xff * WEAR_SOOT_MAX_ALPHA * f);
  quads.push({
    x: px,
    y: py,
    width: pw,
    height: ph,
    tintRgba: packTint(EDG.ink, sootAlpha),
  });

  // Cracked-edge accents — appear once damage is past a threshold.
  if (f >= 0.5) {
    const crackAlpha = Math.round(0xff * WEAR_CRACK_MAX_ALPHA * f);
    const crackHex = EDG.woodDark;
    const thick = Math.max(1, TILE_SIZE * 0.12);
    // Top edge crack — a thin dark line inset from the corners.
    quads.push({
      x: px + pw * 0.2,
      y: py,
      width: pw * 0.6,
      height: thick,
      tintRgba: packTint(crackHex, crackAlpha),
    });
    // Corner scorch — small block at the bottom-right (where fire "pools").
    const corner = Math.min(pw, ph) * 0.3;
    quads.push({
      x: px + pw - corner,
      y: py + ph - corner,
      width: corner,
      height: corner,
      tintRgba: packTint(crackHex, crackAlpha),
    });
  }
  return quads;
}

/**
 * Push the wear/decay soot overlay for the scene (brief 24). For each building
 * with fire damage, stamps `wearOverlayQuads` on the wear layer (above the
 * building). `clockMs` is an optional render clock (e.g. performance.now) used
 * to ramp soot intensity while burning — render-side only, never persisted.
 * Healthy buildings emit nothing. Call inside the same begin/endFrame as
 * `pushScene`.
 */
export function pushWearOverlay(
  renderer: RendererLike,
  buildings: readonly BuildingSnapshot[],
  clockMs = 0,
): void {
  for (const b of buildings) {
    const factor = wearFactor(b, clockMs);
    if (factor <= 0) continue;
    for (const q of wearOverlayQuads(b, factor)) {
      renderer.push(quadToSprite(q, LAYER_WEAR));
    }
  }
}
