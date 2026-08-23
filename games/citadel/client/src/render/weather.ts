/**
 * Citadel weather FX (brief 16) — season-keyed snow / rain visuals.
 *
 * RENDER-ONLY, VISUAL LAYER ONLY. This adds NO gameplay/economic weather
 * effects (APR decision #25 parks weather events) — it only draws particles.
 * Zero sim/determinism impact: the weather kind is a PURE function of the
 * snapshot's `season` + `day` (a fixed render-side cadence picks the rainy
 * spells), and the falling-drop motion is handled by the engine `RainField`,
 * which keeps its own pooled + swap-removed drop pool (hard-capped at 900).
 *
 * ## Why there is no sprite-batch fallback
 * A `RainField` passed as `endFrame(_, _, weather, _)` renders through the engine's
 * `WeatherPass.draw` whenever `useGpuEffects` is on (the default) — re-verified
 * 2026-08-23 in `engine/core/src/render/webgl2/renderer.ts`. When it is off, the
 * renderer draws the field itself on the 2D overlay canvas. Either way Citadel
 * needs no fallback of its own; we pass the RainField straight through.
 *
 * NOTE on RNG: `RainField` itself uses the global PRNG internally for drop
 * placement — that is ENGINE code, explicitly documented as display-only and
 * never touched by the sim worker (Citadel's sim runs in the Worker; this runs
 * on the main/render thread). Our Citadel code here adds none of its own.
 * RainField has no seed parameter to thread, so "seeded with a render seed" is
 * satisfied structurally: it is render-side state, fully decoupled from the sim
 * sequence.
 */
import { CITADEL_PAL as EDG } from "./citadel-palette";
import { RainField } from "@engine/core";
import type { WeatherKind } from "@engine/core";

/** Days-per-year used to derive the seasonal/rainy cadence (matches sim seasons: 4 equal seasons). */
const RAINY_CADENCE = 5; // every 5th non-winter day is a rainy spell

export interface WeatherVisual {
  kind: WeatherKind;
  /** Density/visibility multiplier for RainField. */
  intensity: number;
  /** Streak/flake EDG color. */
  color: string;
  /** Curtain draw alpha. */
  alpha: number;
}

const CLEAR: WeatherVisual = { kind: "none", intensity: 0, color: EDG.white, alpha: 0 };

/**
 * Map (season, day) → the weather visual. PURE, deterministic, render-side.
 *
 * - winter → snow (always; intensifies on the rainy-cadence days into a flurry)
 * - other seasons → rain on a fixed day cadence (a "rainy spell"), else clear
 *
 * The cadence is a plain `day % N` so it's reproducible and never reads sim RNG.
 */
export function seasonToWeather(season: string, day: number): WeatherVisual {
  const d = Math.max(0, Math.floor(day));
  const isRainyDay = d % RAINY_CADENCE === 0;
  if (season === "winter") {
    // Snow always falls in winter; a flurry on cadence days.
    return { kind: "snow", intensity: isRainyDay ? 1.0 : 0.55, color: EDG.white, alpha: 0.85 };
  }
  if (isRainyDay) {
    // A rainy spell in a non-winter season.
    return { kind: "rain", intensity: 0.85, color: EDG.skyBlue, alpha: 0.5 };
  }
  return CLEAR;
}

/** The view rect (world-px) RainField needs to keep a constant-density volume. */
export interface WeatherViewRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Thin render-side owner of the engine `RainField`. Citadel-local (no FV
 * import; promotion of a shared "weather controller" to @engine is a future
 * refactor). Reconfigures the field from the latest snapshot and advances it by
 * `dt`; the caller passes the field to `endFrame(_, _, field, _)`.
 */
export class CitadelWeather {
  readonly field: RainField;

  constructor() {
    this.field = new RainField();
  }

  /**
   * Update the weather field for `dtSec` against the visible world rect. Picks
   * the kind/intensity from (season, day) via `seasonToWeather` (pure), then
   * lets RainField advance + recycle its pooled drops.
   */
  update(dtSec: number, season: string, day: number, view: WeatherViewRect): void {
    const v = seasonToWeather(season, day);
    this.field.setConfig({ kind: v.kind, intensity: v.intensity, color: v.color, alpha: v.alpha });
    this.field.update(dtSec, view);
  }

  /** Live drop count (0 when clear) — for the renderer's `count > 0` guard. */
  get count(): number {
    return this.field.count;
  }
}
