import { describe, it, expect } from "vitest";
import { bootstrapSim, leaderboard, type FarmerSummary } from "./sim-bootstrap";

/**
 * Determinism regression guard.
 *
 * The entire architecture rests on the sim being fully deterministic
 * (seed + tick count → identical outputs). This test boots two sims with the
 * same seed, ticks both to completion, and asserts the per-day leaderboard
 * snapshots and final standings are byte-for-byte identical. A stray
 * `Math.random` / `Date.now` / Map-iteration-order bug would fail this loudly.
 *
 * It compares SIM OUTPUTS only — never wall-clock timings.
 */

interface DaySnapshot {
  day: number;
  weather: string;
  summaries: FarmerSummary[];
}

interface RunResult {
  perDay: DaySnapshot[];
  finalDay: number;
  finalStandings: FarmerSummary[];
}

function currentWeather(world: ReturnType<typeof bootstrapSim>["world"]): string {
  for (const w of world.query("weatherStation")) {
    return w.weatherStation.current;
  }
  return "normal";
}

function runOnce(seed: number, ticksPerDay: number, maxDays: number): RunResult {
  const { world, scheduler, dayClock } = bootstrapSim({ seed, ticksPerDay, maxDays });
  const perDay: DaySnapshot[] = [];
  let lastCaptured = -1;
  const totalTicks = maxDays * ticksPerDay;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    if (dayClock.day !== lastCaptured) {
      perDay.push({ day: dayClock.day, weather: currentWeather(world), summaries: leaderboard(world) });
      lastCaptured = dayClock.day;
    }
  }
  return { perDay, finalDay: dayClock.day, finalStandings: leaderboard(world) };
}

describe("sim determinism", () => {
  // Smaller than a full 100-day run to keep the test fast, but long enough to
  // exercise the deterministic blight shock and multiple market days.
  const TICKS_PER_DAY = 20;
  const MAX_DAYS = 30;

  it("produces identical results for the same seed (run twice, diff)", () => {
    const seed = 0xc0ffee;
    const a = runOnce(seed, TICKS_PER_DAY, MAX_DAYS);
    const b = runOnce(seed, TICKS_PER_DAY, MAX_DAYS);

    // Per-day snapshots match exactly.
    expect(b.perDay).toEqual(a.perDay);
    // Final standings match exactly.
    expect(b.finalStandings).toEqual(a.finalStandings);
    expect(b.finalDay).toBe(a.finalDay);

    // Sanity: the run actually did something (not an empty/degenerate run).
    expect(a.perDay.length).toBeGreaterThan(1);
    expect(a.finalStandings.length).toBe(4);
  });

  it("is internally reproducible across several seeds", () => {
    for (const seed of [1, 42, 0xbeef, 123456]) {
      const a = runOnce(seed, TICKS_PER_DAY, MAX_DAYS);
      const b = runOnce(seed, TICKS_PER_DAY, MAX_DAYS);
      expect(b.perDay, `seed ${seed} per-day divergence`).toEqual(a.perDay);
      expect(b.finalStandings, `seed ${seed} final divergence`).toEqual(a.finalStandings);
    }
  });

  it("different seeds generally produce different outcomes", () => {
    // Guards against the harness accidentally ignoring the seed entirely.
    const a = runOnce(1, TICKS_PER_DAY, MAX_DAYS);
    const b = runOnce(999, TICKS_PER_DAY, MAX_DAYS);
    expect(JSON.stringify(b.finalStandings)).not.toBe(JSON.stringify(a.finalStandings));
  });
});
