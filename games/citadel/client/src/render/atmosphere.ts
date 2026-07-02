/**
 * Citadel atmosphere — day/night wash + night light pool (brief 15) and the
 * season→weather mapping (brief 16).
 *
 * RENDER-ONLY, zero sim/determinism impact. Everything here is a pure function
 * of the RenderSnapshot fields (`tick`, `season`, `tier`) the worker already
 * posts — no sim RNG, no `Math.random`, no `Date.now`. All colors route through
 * `EDG.*` so the palette guard stays clean.
 *
 * ## endFrame-on-WebGPU finding (verified against engine webgpu/renderer.ts)
 * `WebGpuRenderer.endFrame(wash, particles, weather, _overlay)`:
 *   - `wash`   → `TintPass.draw` on the GPU pass — RENDERS on WebGPU.  ✅
 *   - `weather` (a `RainField`) → `WeatherPass.draw` when `useGpuEffects` —
 *     RENDERS on WebGPU.  ✅  (see weather.ts)
 *   - `particles` → `ParticleBatch.draw` — renders, but we don't use it.
 *   - `_overlay` (OverlayFn) → NEVER invoked on WebGPU — a NO-OP.  ❌
 * So the day/night wash is passed straight to `endFrame(wash, …)`. The light
 * pool has no native channel, so it is emitted as sprite-batch quads (the
 * proven path in citadel-renderer.ts) layered above terrain/buildings.
 */
import { EDG } from "@engine/core";
import { TILE_SIZE } from "@citadel/sim-core";
import type { BuildingSnapshot } from "@citadel/sim-core";
import { packTint, type QuadSpec } from "./citadel-renderer";

// ---------------------------------------------------------------------------
// Day fraction + night factor (pure)
// ---------------------------------------------------------------------------

/**
 * Day fraction in [0, 1): how far through the in-game day we are, derived from
 * the tick within the day. `dawn` ≈ 0.0, `noon` ≈ 0.5, `dusk` ≈ 0.75, midnight
 * wraps back to 0. Pure — only depends on the tick the snapshot carries.
 */
export function dayFractionOf(tick: number, ticksPerDay: number): number {
  if (ticksPerDay <= 0) return 0;
  const m = ((tick % ticksPerDay) + ticksPerDay) % ticksPerDay;
  return m / ticksPerDay;
}

/**
 * Night factor in [0, 1]: 0 at midday, rising to 1 deep at night. A smooth
 * cosine curve over the day fraction — peak darkness at fraction 0 / 1
 * (midnight) and full daylight at 0.5 (noon). Pure.
 *
 * f = (1 + cos(2π · dayFraction)) / 2  → 1 at midnight, 0 at noon.
 */
export function nightFactorOf(dayFraction: number): number {
  const f = (1 + Math.cos(2 * Math.PI * dayFraction)) / 2;
  return Math.max(0, Math.min(1, f));
}

// ---------------------------------------------------------------------------
// Day/night + seasonal wash (pure)
// ---------------------------------------------------------------------------

export interface WashSpec {
  /** EDG hex color of the full-screen tint. */
  color: string;
  /** Tint alpha, 0..1. */
  alpha: number;
}

/**
 * Per-season tint endpoints. The wash blends between a faint DAY tint (cheap
 * seasonal grading — winter reads cool/blue, summer near-clear) and a NIGHT
 * tint (a dark ink-navy that deepens as night falls), with a warm DUSK accent
 * around the evening. EDG-only.
 */
interface SeasonWash {
  /** Daytime tint hue (low alpha — just a seasonal grade). */
  dayColor: string;
  /** Daytime tint alpha at noon. */
  dayAlpha: number;
}

const SEASON_WASH: Record<string, SeasonWash> = {
  spring: { dayColor: EDG.green, dayAlpha: 0.04 },
  summer: { dayColor: EDG.gold, dayAlpha: 0.03 },
  autumn: { dayColor: EDG.clay, dayAlpha: 0.06 },
  winter: { dayColor: EDG.skyBlue, dayAlpha: 0.12 },
};

const FALLBACK_SEASON_WASH: SeasonWash = { dayColor: EDG.skyBlue, dayAlpha: 0.05 };

/**
 * Night tint: a GENTLE cool navy, never the near-black `ink`. Cozy nights are
 * lamplit — the wash should read as dim dusk-blue, not a hard blue-black void.
 * Alpha capped lower than before (0.6 → 0.42) so window/light-pool glow (below)
 * still reads warm against it instead of getting crushed.
 */
const NIGHT_COLOR = EDG.navy;
const NIGHT_MAX_ALPHA = 0.42;

/**
 * Dusk/dawn warm accent: peaks at the day→night transition bands. Pushed
 * further toward `gold` golden-hour warmth (was a flatter `orange`) and
 * strengthened a touch (0.24 → 0.28) — the low warm sun is the single most
 * recognisable beat of the cozy storybook look.
 */
const DUSK_COLOR = EDG.gold;
const DUSK_MAX_ALPHA = 0.28;

/**
 * Strength of the warm dusk accent over the day fraction. Peaks around dawn
 * (~0.0/1.0 boundary handled by night) and dusk (~0.72) — modelled as a narrow
 * bump centered on the evening transition. Pure.
 */
function duskWeight(dayFraction: number): number {
  // Two transition bands: dawn (~0.22) and dusk (~0.78). A gaussian-ish bump
  // around each, kept cheap with a triangular falloff of half-width 0.10.
  const band = (center: number): number => {
    const d = Math.abs(dayFraction - center);
    return Math.max(0, 1 - d / 0.1);
  };
  return Math.min(1, band(0.22) + band(0.78));
}

/**
 * Compute the day/night + seasonal wash for `endFrame(wash, …)`. PURE — a
 * function of (season, dayFraction) only.
 *
 * Composition rule (keeps it simple, avoids confusing double-darkening):
 *   - We emit ONE wash quad. Its color/alpha interpolate across the day:
 *       night-heavy  → deep ink (NIGHT_COLOR), alpha ∝ nightFactor
 *       dusk band    → warm orange accent mixed toward the surface
 *       daytime      → faint seasonal grade (SEASON_WASH)
 *   - The renderer's existing fire/disease tints are applied as their own
 *     building-level quads elsewhere; this wash is a thin global grade, so it
 *     never stacks into an unreadable murk (night alpha caps at 0.42, and the
 *     night tint itself is a gentle navy — never a hard blue-black).
 */
export function computeWash(season: string, dayFraction: number): WashSpec {
  const night = nightFactorOf(dayFraction);
  const dusk = duskWeight(dayFraction);
  const sw = SEASON_WASH[season] ?? FALLBACK_SEASON_WASH;

  // Daytime seasonal grade dominates when night≈0; night ink dominates when
  // night≈1. Dusk warm accent wins in the transition bands.
  if (night > 0.001 && night >= dusk) {
    // Night-leaning: deep ink, alpha grows with night factor.
    return { color: NIGHT_COLOR, alpha: NIGHT_MAX_ALPHA * night };
  }
  if (dusk > 0.001) {
    // Dusk/dawn warm accent.
    return { color: DUSK_COLOR, alpha: DUSK_MAX_ALPHA * dusk };
  }
  // Full daytime: faint seasonal grade.
  return { color: sw.dayColor, alpha: sw.dayAlpha };
}

// ---------------------------------------------------------------------------
// Night light pool (sprite-batch quads — no native channel on WebGPU)
// ---------------------------------------------------------------------------

/**
 * Building types that emit a warm glow at night, with a relative intensity
 * (0..1 — bakery's oven glows brightest, the chapel softly). Only these types
 * get a light pool; everything else stays dark.
 */
export const LIGHT_EMITTERS: Record<string, number> = {
  bakery: 1.0, // oven
  smith: 0.95, // forge
  market: 0.7, // braziers / stalls
  chapel: 0.6, // candle-light
};

/**
 * Warm glow palette — inner hot core → outer soft ring. EDG-only. Retuned
 * warmer: the hot core now leans `yellow` (was `gold`) for a brighter
 * lamplit/candle read, and the outer ring uses `gold` (was `orange`) so the
 * whole pool sits warmer without tipping into a hot-orange bonfire look.
 */
const GLOW_CORE = EDG.yellow;
const GLOW_RING = EDG.gold;

/**
 * Number of concentric rings approximating a radial gradient, with their
 * radius (in tiles, beyond the footprint edge) and base alpha. A true radial
 * gradient isn't available in the flat-quad sprite-batch, so we stack a few
 * translucent rings (largest+faintest first, drawn back-to-front) to fake one.
 *
 * Alphas are deliberately LOW: the rings are stamped as solid `fx/diamond`
 * pools on the ground (see `pushLightPool`), so three stacked rings compound —
 * keep each faint so the result reads as soft lamplight, not a bright orange
 * diamond. (Earlier values were tuned for transparent-cornered squares.)
 *
 * Softened for a lamplit-at-dusk read: the outer ring widened slightly
 * (2.2 → 2.6 tiles) and its alpha lowered a touch so the glow fades out
 * gently rather than stopping abruptly; the core alpha nudged up slightly so
 * the warm center still reads clearly against the gentler night wash above.
 */
const GLOW_RINGS: ReadonlyArray<{ radiusTiles: number; alpha: number; hex: string }> = [
  { radiusTiles: 2.6, alpha: 0.035, hex: GLOW_RING },
  { radiusTiles: 1.5, alpha: 0.045, hex: GLOW_RING },
  { radiusTiles: 0.7, alpha: 0.065, hex: GLOW_CORE },
];

/** A light emitter as the pool needs it: footprint + type. */
export interface EmitterFootprint {
  type: string;
  x: number; // tile col of top-left
  y: number; // tile row of top-left
  w: number;
  h: number;
}

/** Extract the light-emitting buildings from a building snapshot list. Pure. */
export function emittersOf(buildings: readonly BuildingSnapshot[]): EmitterFootprint[] {
  const out: EmitterFootprint[] = [];
  for (const b of buildings) {
    if (LIGHT_EMITTERS[b.type] !== undefined) {
      out.push({ type: b.type, x: b.x, y: b.y, w: b.w, h: b.h });
    }
  }
  return out;
}

/**
 * Emit the warm glow quads for the given emitters at the current `nightFactor`
 * (0 = midday → no glow, 1 = deep night → full glow). PURE — returns quads the
 * sprite-batch consumes; emits NOTHING when nightFactor ≈ 0 or for non-emitter
 * types. Each emitter gets a small stack of concentric translucent rings
 * centered on its footprint, approximating a radial light pool.
 *
 * Quads are returned largest/faintest first so the caller pushes them
 * back-to-front and the bright core lands on top.
 */
export function lightPoolQuads(emitters: readonly EmitterFootprint[], nightFactor: number): QuadSpec[] {
  const quads: QuadSpec[] = [];
  if (nightFactor <= 0.001) return quads;
  for (const e of emitters) {
    const intensity = LIGHT_EMITTERS[e.type];
    if (intensity === undefined) continue; // defensive — non-emitters never glow
    const cx = (e.x + e.w / 2) * TILE_SIZE;
    const cy = (e.y + e.h / 2) * TILE_SIZE;
    const footHalf = (Math.max(e.w, e.h) / 2) * TILE_SIZE;
    for (const ring of GLOW_RINGS) {
      const half = footHalf + ring.radiusTiles * TILE_SIZE;
      const a = ring.alpha * intensity * nightFactor;
      const alphaByte = Math.round(Math.max(0, Math.min(1, a)) * 0xff);
      if (alphaByte <= 0) continue;
      quads.push({
        x: cx - half,
        y: cy - half,
        width: half * 2,
        height: half * 2,
        tintRgba: packTint(ring.hex, alphaByte),
      });
    }
  }
  return quads;
}
