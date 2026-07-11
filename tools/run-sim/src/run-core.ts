

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

export function fingerprint(result: RunResult): string {
  return JSON.stringify(result);
}

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
