import type { Season } from "../protocols/weather";
import { dayFraction } from "../systems/day-phase";

/**
 * brief 26 — day/night + seasonal color grading.
 *
 * A full-frame color wash computed render-side from the sim clock: a within-day
 * sun curve (dawn → noon → dusk → night) tinted by a per-season palette, with
 * the season also shortening winter daylight. Pure function of
 * (tick, ticksPerDay, season) — deterministic, render-only, never fed back into
 * the sim.
 *
 * The math (palette lerp + a smooth sun curve) is reimplemented in JS, inspired
 * by The Book of Shaders' Colors chapter — NOT copied (its code is all-rights-
 * reserved). This renderer is Canvas2D: the wash is one translucent fillRect,
 * not a GLSL shader.
 *
 * Only meaningful once days are long (brief 27, ticksPerDay 1200/6000); at the
 * old 20-tick day it would strobe. Validated together with brief 27.
 */

export interface Wash {
  /** Overlay color, "#rrggbb". */
  color: string;
  /** Overlay opacity in [0,1]; 0 means "no wash" (skip the fill). */
  alpha: number;
}

/** Per-season night tint + how much of the day is full daylight. */
interface SeasonGrade {
  /** Night overlay color (a cool dim, not black). */
  night: [number, number, number];
  /** Warm noon tint (subtle). */
  noon: [number, number, number];
  /** Peak night opacity (winter nights are darker). */
  nightAlpha: number;
  /** Fraction of the day that is "full daylight"; smaller = shorter days. */
  daylight: number;
}

const SEASON_GRADES: Record<Season, SeasonGrade> = {
  spring: { night: [40, 60, 110], noon: [255, 250, 220], nightAlpha: 0.3, daylight: 0.62 },
  summer: { night: [40, 55, 100], noon: [255, 244, 200], nightAlpha: 0.26, daylight: 0.7 },
  autumn: { night: [55, 50, 95], noon: [255, 235, 190], nightAlpha: 0.34, daylight: 0.55 },
  winter: { night: [35, 45, 95], noon: [225, 235, 255], nightAlpha: 0.42, daylight: 0.42 },
};

/** Smoothstep — eases 0→1 between edges. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Daylight intensity in [0,1] for a within-day fraction `f`, given the season's
 * daylight share. 0 = deep night, 1 = noon. A symmetric dawn/dusk ramp around
 * a daylight plateau centered at midday; shorter `daylight` ⇒ longer/darker
 * night (winter).
 */
export function daylightAt(f: number, daylight: number): number {
  // Daylight window centered on 0.5, width = daylight; ramps over a margin.
  const half = daylight / 2;
  const dawnStart = 0.5 - half - 0.12;
  const dawnEnd = 0.5 - half;
  const duskStart = 0.5 + half;
  const duskEnd = 0.5 + half + 0.12;
  if (f < dawnStart || f > duskEnd) return 0;
  if (f < dawnEnd) return smoothstep(dawnStart, dawnEnd, f);
  if (f > duskStart) return 1 - smoothstep(duskStart, duskEnd, f);
  return 1;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Compute the day/night/seasonal wash for the current tick. At full daylight
 * the wash is a faint warm noon tint; toward night it lerps to the season's
 * cool dim at `nightAlpha`. Returns alpha 0 (skip) only never — there's always
 * a subtle grade — but callers may treat very small alphas as skippable.
 */
export function washFor(args: {
  tick: number;
  ticksPerDay: number;
  season: Season;
}): Wash {
  const grade = SEASON_GRADES[args.season];
  const f = dayFraction(args.tick, args.ticksPerDay);
  const light = daylightAt(f, grade.daylight); // 0 night .. 1 noon

  // Night → noon blend of the overlay color.
  const r = lerp(grade.night[0], grade.noon[0], light);
  const g = lerp(grade.night[1], grade.noon[1], light);
  const b = lerp(grade.night[2], grade.noon[2], light);

  // Opacity: strong cool wash at night, fading to a faint warm wash at noon.
  const NOON_ALPHA = 0.06;
  const alpha = lerp(grade.nightAlpha, NOON_ALPHA, light);

  return { color: toHex(r, g, b), alpha };
}
