

import {
  bootstrapSim,
  leaderboard,
  type FarmerSummary,
  type PathfinderLike,
} from "@farm/sim-core/sim-bootstrap";

export type { FarmerSummary, PathfinderLike };

export interface DaySnapshot {
  day: number;
  weather: string;
  summaries: FarmerSummary[];
}

export interface RunResult {
  perDay: DaySnapshot[];
  finalDay: number;
  finalWeather: string;
  finalStandings: FarmerSummary[];
}

export interface RunOptions {
  seed: number;
  ticksPerDay: number;
  maxDays: number;
  pathfinder?: PathfinderLike | null;
  /** World-gen seed (brief 92/93). Defaults to the fixed WORLD_GEN_SEED inside bootstrap. */
  worldSeed?: number;
  /**
   * Optional per-tick observer, invoked after `scheduler.tick()` with the tick
   * index and the booted sim. Purely additive: it exists so callers can harvest
   * data (e.g. the event feed) without growing `RunResult`'s shape, which is the
   * determinism check's comparator. Default: no-op — zero behavior change when
   * omitted, and the observer itself must not mutate the sim.
   */
  onTick?: (tick: number, sim: ReturnType<typeof bootstrapSim>) => void;
}

function currentWeather(world: ReturnType<typeof bootstrapSim>["world"]): string {
  for (const w of world.query("weatherStation")) {
    return w.weatherStation.current;
  }
  return "normal";
}

export function summarize(
  world: ReturnType<typeof bootstrapSim>["world"],
): { weather: string; summaries: FarmerSummary[] } {
  return { weather: currentWeather(world), summaries: leaderboard(world) };
}

export function runOnce(opts: RunOptions): RunResult {
  const sim = bootstrapSim({
    seed: opts.seed,
    ticksPerDay: opts.ticksPerDay,
    maxDays: opts.maxDays,
    pathfinder: opts.pathfinder ?? null,
    ...(opts.worldSeed !== undefined ? { worldSeed: opts.worldSeed } : {}),
  });
  const { world, scheduler, dayClock } = sim;

  const perDay: DaySnapshot[] = [];
  let lastCaptured = -1;
  const totalTicks = opts.maxDays * opts.ticksPerDay;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    opts.onTick?.(tick, sim);
    if (dayClock.day !== lastCaptured) {
      const { weather, summaries } = summarize(world);
      perDay.push({ day: dayClock.day, weather, summaries });
      lastCaptured = dayClock.day;
    }
  }

  const { weather, summaries } = summarize(world);
  return {
    perDay,
    finalDay: dayClock.day,
    finalWeather: weather,
    finalStandings: summaries,
  };
}

// `JSON.stringify` collapses Infinity/-Infinity/NaN all to `null` and prints
// `-0` as `0` — so a real float-drift bug that flips a division-derived
// metric between, say, Infinity and -Infinity between two passes fingerprints
// *identically* and the determinism check falsely passes. These sentinels
// make each case a distinct, visible string instead.
//
// Collision note: a legitimate string field equal to one of these exact
// sentinel strings (e.g. a farmer somehow named "__NaN") would fingerprint
// the same as the corresponding non-finite number. `escapeSentinelString`
// below guards against that by re-escaping any raw string value that already
// matches a sentinel, so the collision is a non-issue in practice.
const SENTINEL_NAN = "__NaN";
const SENTINEL_POS_INF = "__Inf";
const SENTINEL_NEG_INF = "__-Inf";
const SENTINEL_NEG_ZERO = "__-0";
const SENTINELS: ReadonlySet<string> = new Set([
  SENTINEL_NAN,
  SENTINEL_POS_INF,
  SENTINEL_NEG_INF,
  SENTINEL_NEG_ZERO,
]);

function escapeSentinelString(value: string): string {
  return SENTINELS.has(value) ? `__esc${value}` : value;
}

function fingerprintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return SENTINEL_NAN;
    if (value === Number.POSITIVE_INFINITY) return SENTINEL_POS_INF;
    if (value === Number.NEGATIVE_INFINITY) return SENTINEL_NEG_INF;
    if (Object.is(value, -0)) return SENTINEL_NEG_ZERO;
    return value;
  }
  if (typeof value === "string") return escapeSentinelString(value);
  return value;
}

export function fingerprint(result: RunResult): string {
  return JSON.stringify(result, fingerprintReplacer);
}

/** Same-value comparison for leaf values: unlike `===`, this treats NaN as
 *  equal to itself and -0 as DIFFERENT from 0 — the exact bit-for-bit
 *  reproducibility this tool is meant to enforce. */
function sameLeaf(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Object.is(a, b);
  return a === b;
}

/** Renders a single leaf value legibly, spelling out non-finite numbers and
 *  -0 by name instead of letting them collapse to "null"/"0". */
function formatLeaf(v: unknown): string {
  if (typeof v === "number") {
    if (Number.isNaN(v)) return "NaN";
    if (v === Number.POSITIVE_INFINITY) return "Infinity";
    if (v === Number.NEGATIVE_INFINITY) return "-Infinity";
    if (Object.is(v, -0)) return "-0";
  }
  return JSON.stringify(v, fingerprintReplacer);
}

/** Recursively walks two same-shaped values and returns a legible
 *  `path: run A = ...\n  run B = ...` report for the first leaf that
 *  differs, or null if they match. */
function findDivergence(a: unknown, b: unknown, path: string): string | null {
  if (sameLeaf(a, b)) return null;

  const aIsObj = typeof a === "object" && a !== null;
  const bIsObj = typeof b === "object" && b !== null;
  if (aIsObj && bIsObj) {
    const aRec = a as Record<string, unknown>;
    const bRec = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aRec), ...Object.keys(bRec)]);
    const isArray = Array.isArray(a) || Array.isArray(b);
    for (const key of keys) {
      const childPath = isArray ? `${path}[${key}]` : `${path}.${key}`;
      const found = findDivergence(aRec[key], bRec[key], childPath);
      if (found) return found;
    }
    return null;
  }

  return `${path}: run A = ${formatLeaf(a)}\n  run B = ${formatLeaf(b)}`;
}

export function describeDivergence(a: RunResult, b: RunResult): string {
  const n = Math.max(a.perDay.length, b.perDay.length);
  for (let i = 0; i < n; i++) {
    const found = findDivergence(a.perDay[i] ?? null, b.perDay[i] ?? null, `perDay[${i}]`);
    if (found) return `first divergence at ${found}`;
  }
  const found = findDivergence(a.finalStandings, b.finalStandings, "finalStandings");
  if (found) return `final standings differ at ${found}`;
  return "runs differ but no per-field difference located (length mismatch?)";
}
