import type { Season } from "@farm/sim-core/protocols/weather";
import { dayFraction } from "@farm/sim-core/systems/day-phase";
import { EDG, rgbOf } from "@engine/core/render";

export interface Wash {

  color: string;

  alpha: number;
}

interface SeasonGrade {

  night: [number, number, number];

  noon: [number, number, number];

  nightAlpha: number;

  daylight: number;
}

const SEASON_GRADES: Record<Season, SeasonGrade> = {
  spring: { night: rgbOf(EDG.slate), noon: rgbOf(EDG.white), nightAlpha: 0.3, daylight: 0.62 },
  summer: { night: rgbOf(EDG.slate), noon: rgbOf(EDG.cream), nightAlpha: 0.26, daylight: 0.7 },
  autumn: { night: rgbOf(EDG.navy), noon: rgbOf(EDG.cream), nightAlpha: 0.34, daylight: 0.55 },
  winter: { night: rgbOf(EDG.ink), noon: rgbOf(EDG.silver), nightAlpha: 0.42, daylight: 0.42 },
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function daylightAt(f: number, daylight: number): number {

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

export function nightnessFor(args: {
  tick: number;
  ticksPerDay: number;
  season: Season;
}): number {
  const grade = SEASON_GRADES[args.season];
  const f = dayFraction(args.tick, args.ticksPerDay);
  return 1 - daylightAt(f, grade.daylight);
}

export function washFor(args: {
  tick: number;
  ticksPerDay: number;
  season: Season;
}): Wash {
  const grade = SEASON_GRADES[args.season];
  const f = dayFraction(args.tick, args.ticksPerDay);
  const light = daylightAt(f, grade.daylight); 
  const r = lerp(grade.night[0], grade.noon[0], light);
  const g = lerp(grade.night[1], grade.noon[1], light);
  const b = lerp(grade.night[2], grade.noon[2], light);

  const NOON_ALPHA = 0.06;
  const alpha = lerp(grade.nightAlpha, NOON_ALPHA, light);

  return { color: toHex(r, g, b), alpha };
}
