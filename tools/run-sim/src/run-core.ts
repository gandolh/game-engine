/**
 * run-core.ts — the side-effect-free core of the headless runner.
 *
 * Holds the canonical "boot a sim, tick to completion, capture per-day
 * snapshots" routine plus the byte-comparison helpers. Both `index.ts` (the
 * CLI) and `determinism-worker.ts` (a worker thread) import from here, so the
 * worker can reuse `runOnce` without triggering `index.ts`'s top-level `main()`.
 *
 * Nothing here reads the wall clock or env vars — the result depends solely on
 * the seed, so it is reproducible and byte-for-byte comparable.
 */
import {
  bootstrapSim,
  leaderboard,
  type FarmerSummary,
  type PathfinderLike,
} from "farm-valley/src/sim-bootstrap";

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

/**
 * Boots and ticks a sim to completion, capturing a leaderboard snapshot at the
 * end of every distinct day plus the final standings. No console output, no
 * timing — pure sim outputs, so the result is byte-for-byte comparable.
 */
export function runOnce(opts: RunOptions): RunResult {
  const { world, scheduler, dayClock } = bootstrapSim({
    seed: opts.seed,
    ticksPerDay: opts.ticksPerDay,
    maxDays: opts.maxDays,
    pathfinder: opts.pathfinder ?? null,
  });

  const perDay: DaySnapshot[] = [];
  let lastCaptured = -1;
  const totalTicks = opts.maxDays * opts.ticksPerDay;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
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

// A stable string form of a run, used purely for equality comparison.
export function fingerprint(result: RunResult): string {
  return JSON.stringify(result);
}

// First textual difference between two runs (day-by-day), for a helpful report.
export function describeDivergence(a: RunResult, b: RunResult): string {
  const n = Math.max(a.perDay.length, b.perDay.length);
  for (let i = 0; i < n; i++) {
    const da = a.perDay[i];
    const db = b.perDay[i];
    const sa = JSON.stringify(da ?? null);
    const sb = JSON.stringify(db ?? null);
    if (sa !== sb) {
      return `first divergence at perDay index ${i}:\n  run A: ${sa}\n  run B: ${sb}`;
    }
  }
  const fa = JSON.stringify(a.finalStandings);
  const fb = JSON.stringify(b.finalStandings);
  if (fa !== fb) {
    return `final standings differ:\n  run A: ${fa}\n  run B: ${fb}`;
  }
  return "runs differ but no per-field difference located (length mismatch?)";
}
