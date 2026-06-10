import type { Season } from "@farm/sim-core/protocols/weather";
import { dayFraction } from "@farm/sim-core/systems/day-phase";
import { EDG, rgbOf } from "@engine/core/render";

/**
 * Day/night + seasonal color wash. Pure function of (tick, ticksPerDay, season);
 * render-only, never fed back into the sim. Canvas2D fillRect wash, not a shader.
 * Night/noon colors lerp between EDG palette anchors; the per-frame tint is not
 * palette-locked per pixel (only the anchor colors are). Only meaningful with
 * ticksPerDay ≥ 1200; at 20-tick days it would strobe.
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

// Night/noon anchors are EDG32 colors; the palette guard is satisfied because
// anchors are on-palette. Interpolated tint values are not individually palette-
// locked (they can't be) — only the anchors are.
const SEASON_GRADES: Record<Season, SeasonGrade> = {
  spring: { night: rgbOf(EDG.slate), noon: rgbOf(EDG.white), nightAlpha: 0.3, daylight: 0.62 },
  summer: { night: rgbOf(EDG.slate), noon: rgbOf(EDG.cream), nightAlpha: 0.26, daylight: 0.7 },
  autumn: { night: rgbOf(EDG.navy), noon: rgbOf(EDG.cream), nightAlpha: 0.34, daylight: 0.55 },
  winter: { night: rgbOf(EDG.ink), noon: rgbOf(EDG.silver), nightAlpha: 0.42, daylight: 0.42 },
};

/** Smoothstep — eases 0→1 between edges. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Daylight intensity in [0,1]. 0=night, 1=noon. Symmetric ramp; shorter daylight = winter. */
export function daylightAt(f: number, daylight: number): number {
  // Daylight window centered on 0.5, width = daylight.
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

/** Compute the day/night/seasonal wash for the current tick. */
export function washFor(args: {
  tick: number;
  ticksPerDay: number;
  season: Season;
}): Wash {
  const grade = SEASON_GRADES[args.season];
  const f = dayFraction(args.tick, args.ticksPerDay);
  const light = daylightAt(f, grade.daylight); // 0=night, 1=noon
  const r = lerp(grade.night[0], grade.noon[0], light);
  const g = lerp(grade.night[1], grade.noon[1], light);
  const b = lerp(grade.night[2], grade.noon[2], light);

  const NOON_ALPHA = 0.06;
  const alpha = lerp(grade.nightAlpha, NOON_ALPHA, light);

  return { color: toHex(r, g, b), alpha };
}
