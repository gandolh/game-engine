import { describe, it, expect } from "vitest";
import { dayPhase, DAY_PHASE_BOUNDARIES } from "./day-cycle";
import type { DayPhase } from "./day-cycle";

const TICKS_PER_DAY_VALUES = [20, 200, 1200];

describe("dayPhase", () => {
  it("tick 0 is commute, day 0, at the very start of the phase", () => {
    for (const ticksPerDay of TICKS_PER_DAY_VALUES) {
      expect(dayPhase(0, ticksPerDay)).toEqual({
        phase: "commute",
        dayOfRun: 0,
        fractionThroughPhase: 0,
      });
    }
  });

  it("maps each fraction of the day to the boundary table's phase, on both sides of every boundary", () => {
    for (const ticksPerDay of TICKS_PER_DAY_VALUES) {
      for (const boundary of DAY_PHASE_BOUNDARIES) {
        // A tick just inside the phase's start (its own boundary tick).
        const startTick = Math.round(boundary.start * ticksPerDay);
        expect(dayPhase(startTick, ticksPerDay).phase).toBe(boundary.phase);

        // A tick one below the phase's end boundary is still this phase.
        const lastTickInPhase = Math.round(boundary.end * ticksPerDay) - 1;
        if (lastTickInPhase >= startTick) {
          expect(dayPhase(lastTickInPhase, ticksPerDay).phase).toBe(boundary.phase);
        }
      }
    }
  });

  it("the end boundary tick belongs to the NEXT phase (end is exclusive), except the day's own end", () => {
    for (const ticksPerDay of TICKS_PER_DAY_VALUES) {
      for (let i = 0; i < DAY_PHASE_BOUNDARIES.length - 1; i++) {
        const boundary = DAY_PHASE_BOUNDARIES[i]!;
        const next = DAY_PHASE_BOUNDARIES[i + 1]!;
        const boundaryTick = Math.round(boundary.end * ticksPerDay);
        expect(dayPhase(boundaryTick, ticksPerDay).phase).toBe(next.phase);
      }
    }
  });

  it("exact ticksPerDay (fraction 1.0 / start of next day) rolls over to commute, day 1", () => {
    for (const ticksPerDay of TICKS_PER_DAY_VALUES) {
      expect(dayPhase(ticksPerDay, ticksPerDay)).toEqual({
        phase: "commute",
        dayOfRun: 1,
        fractionThroughPhase: 0,
      });
    }
  });

  it("dayOfRun advances by exactly one once per ticksPerDay ticks", () => {
    for (const ticksPerDay of TICKS_PER_DAY_VALUES) {
      expect(dayPhase(0, ticksPerDay).dayOfRun).toBe(0);
      expect(dayPhase(ticksPerDay - 1, ticksPerDay).dayOfRun).toBe(0);
      expect(dayPhase(ticksPerDay, ticksPerDay).dayOfRun).toBe(1);
      expect(dayPhase(ticksPerDay * 5 + 3, ticksPerDay).dayOfRun).toBe(5);
    }
  });

  it("the phase sequence over one full day, sampled tick by tick, is commute -> work -> gather -> sleep with no other order", () => {
    for (const ticksPerDay of TICKS_PER_DAY_VALUES) {
      const seen: DayPhase[] = [];
      for (let tick = 0; tick < ticksPerDay; tick++) {
        const phase = dayPhase(tick, ticksPerDay).phase;
        if (seen.length === 0 || seen[seen.length - 1] !== phase) {
          seen.push(phase);
        }
      }
      expect(seen).toEqual(["commute", "work", "gather", "sleep"]);
    }
  });

  it("fractionThroughPhase goes from 0 (phase start) toward 1 (phase end) within a phase", () => {
    const ticksPerDay = 200;
    // work phase is [0.15, 0.7) -> ticks [30, 140)
    const atStart = dayPhase(30, ticksPerDay);
    expect(atStart.phase).toBe("work");
    expect(atStart.fractionThroughPhase).toBe(0);

    const atMid = dayPhase(85, ticksPerDay); // halfway through [30,140)
    expect(atMid.phase).toBe("work");
    expect(atMid.fractionThroughPhase).toBeCloseTo(0.5, 5);

    const atLast = dayPhase(139, ticksPerDay);
    expect(atLast.phase).toBe("work");
    expect(atLast.fractionThroughPhase).toBeGreaterThan(0.9);
    expect(atLast.fractionThroughPhase).toBeLessThan(1);
  });

  it("is total/defensive on a degenerate ticksPerDay: returns a sane default instead of NaN/throwing", () => {
    for (const bad of [0, -1, -200, NaN, Infinity, -Infinity]) {
      const result = dayPhase(50, bad);
      expect(result.phase).toBe("commute");
      expect(result.dayOfRun).toBe(0);
      expect(result.fractionThroughPhase).toBe(0);
      expect(Number.isNaN(result.dayOfRun)).toBe(false);
      expect(Number.isNaN(result.fractionThroughPhase)).toBe(false);
    }
  });

  it("is pure/deterministic: same inputs always produce the same (deep-equal) output", () => {
    for (const ticksPerDay of TICKS_PER_DAY_VALUES) {
      for (const tick of [0, 1, ticksPerDay - 1, ticksPerDay, ticksPerDay * 3 + 17]) {
        expect(dayPhase(tick, ticksPerDay)).toEqual(dayPhase(tick, ticksPerDay));
      }
    }
  });
});
