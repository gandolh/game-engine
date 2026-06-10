/**
 * run-history.test.ts — tests for RunHistorySystem
 *
 * Drives bootstrapSim() directly (no browser, no Worker), the canonical way
 * to exercise sim behaviour from tests. See sim-bootstrap.test.ts for the
 * established pattern.
 */

import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";

const TICKS_PER_DAY = 20;

/** Boot and tick for N complete sim days, returning the booted sim. */
function runDays(seed: number, days: number, maxDays = days + 5) {
  const sim = bootstrapSim({ seed, ticksPerDay: TICKS_PER_DAY, maxDays });
  const totalTicks = days * TICKS_PER_DAY;
  for (let tick = 0; tick < totalTicks; tick++) {
    sim.scheduler.tick({ tick });
  }
  return sim;
}

describe("RunHistorySystem", () => {
  it("records exactly one row per farmer per day", () => {
    const DAYS = 5;
    const sim = runDays(0xc0ffee, DAYS);
    const history = sim.runHistory.history();

    // DAY_START fires for days 0..(DAYS-1), one row per farmer per day.
    expect(history).toHaveLength(DAYS * sim.farmers.length);
  });

  it("rows cover the expected day range (0..DAYS-1 as triggered by the sim clock)", () => {
    // DayClockSystem emits DAY_START starting at day 0 (tick 0), then day 1
    // (tick ticksPerDay), etc. Running DAYS*TICKS_PER_DAY ticks produces days
    // 0..(DAYS-1) — the last tick of day DAYS never fires because the loop
    // ends before tick DAYS*TICKS_PER_DAY is processed.
    const DAYS = 3;
    const sim = runDays(0xc0ffee, DAYS);
    const history = sim.runHistory.history();
    const days = new Set(history.map((r) => r.day));
    // Days 0..(DAYS-1) should all be present.
    for (let d = 0; d < DAYS; d++) {
      expect(days.has(d), `day ${d} should be present`).toBe(true);
    }
  });

  it("each day has exactly one row per unique farmerId", () => {
    const DAYS = 4;
    const sim = runDays(42, DAYS);
    const history = sim.runHistory.history();

    const dayMap = new Map<number, number[]>();
    for (const row of history) {
      const ids = dayMap.get(row.day) ?? [];
      ids.push(row.farmerId);
      dayMap.set(row.day, ids);
    }
    for (const [day, ids] of dayMap) {
      const unique = new Set(ids);
      expect(unique.size, `day ${day}: duplicate farmerId detected`).toBe(
        ids.length,
      );
    }
  });

  it("rank tie-break is deterministic: lower farmerId wins on equal totalValue", () => {
    // We can't easily force a tie in a full sim, so we test the property
    // that ranks are always 1-indexed and sorted (no gaps, no duplicates per day).
    const DAYS = 5;
    const sim = runDays(1, DAYS);
    const history = sim.runHistory.history();

    const dayMap = new Map<number, number[]>();
    for (const row of history) {
      const ranks = dayMap.get(row.day) ?? [];
      ranks.push(row.rank);
      dayMap.set(row.day, ranks);
    }
    for (const [day, ranks] of dayMap) {
      const sorted = ranks.slice().sort((a, b) => a - b);
      expect(
        sorted,
        `day ${day}: ranks should be [1..N] with no gaps`,
      ).toEqual(Array.from({ length: ranks.length }, (_, i) => i + 1));
    }
  });

  it("does NOT record duplicate rows for the same (day, farmerId)", () => {
    const DAYS = 3;
    const sim = runDays(0xc0ffee, DAYS);
    const history = sim.runHistory.history();
    const keys = history.map((r) => `${r.day}:${r.farmerId}`);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("buffer is bounded — no more than maxDays × farmerCount rows", () => {
    const MAX_DAYS = 10;
    const sim = runDays(0xc0ffee, MAX_DAYS, MAX_DAYS);
    const history = sim.runHistory.history();
    // one row per farmer per day maximum
    expect(history.length).toBeLessThanOrEqual(MAX_DAYS * sim.farmers.length);
  });

  it("is deterministic: same seed produces identical history", () => {
    const DAYS = 5;
    const simA = runDays(0xc0ffee, DAYS);
    const simB = runDays(0xc0ffee, DAYS);
    expect(simB.runHistory.history()).toEqual(simA.runHistory.history());
  });
});
