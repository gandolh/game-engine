import { describe, it, expect, vi } from "vitest";
import { FixedStepClock } from "./clock";

describe("FixedStepClock", () => {
  describe("bit-stability / determinism", () => {
    it("produces identical tick sequences across two instances given the same advance schedule", () => {
      const schedule = [0, 16, 32, 50, 100, 116, 132, 200, 300, 400];

      function runClock(schedule: number[]): Array<{ ticks: number; tick: number }> {
        const clock = new FixedStepClock({ tickRateHz: 60 });
        const log: Array<{ ticks: number; tick: number }> = [];
        for (const t of schedule) {
          const ticksBefore = clock.tick;
          const count = clock.advance(t, () => {});
          log.push({ ticks: count, tick: ticksBefore });
        }
        return log;
      }

      const logA = runClock(schedule);
      const logB = runClock(schedule);
      expect(logA).toEqual(logB);
    });
  });

  describe("catch-up cap", () => {
    it("executes at most maxTicksPerFrame ticks when a huge delta is fed", () => {
      const maxTicksPerFrame = 4;
      const clock = new FixedStepClock({ tickRateHz: 60, maxTicksPerFrame });
      const ticks: number[] = [];
      // First call initializes lastWallMs
      clock.advance(0, () => {});
      // Feed a huge delta (10 seconds)
      const count = clock.advance(10_000, (t) => ticks.push(t));
      expect(count).toBe(maxTicksPerFrame);
      expect(ticks.length).toBe(maxTicksPerFrame);
    });

    it("uses default maxTicksPerFrame of 8 when not specified", () => {
      const clock = new FixedStepClock({ tickRateHz: 60 });
      clock.advance(0, () => {});
      let count = 0;
      const returned = clock.advance(10_000, () => count++);
      expect(returned).toBe(8);
      expect(count).toBe(8);
    });
  });

  describe("alpha", () => {
    it("is in [0, 1) after partial accumulation", () => {
      // Use 10Hz (100ms/step) to avoid floating-point edge cases
      const clock = new FixedStepClock({ tickRateHz: 10 });
      clock.advance(0, () => {});
      // Advance by 150ms = 1.5 steps so we get one tick and 50ms remaining
      clock.advance(150, () => {});
      expect(clock.alpha).toBeGreaterThanOrEqual(0);
      expect(clock.alpha).toBeLessThan(1);
    });

    it("is 0 when no accumulation has occurred", () => {
      const clock = new FixedStepClock({ tickRateHz: 60 });
      clock.advance(0, () => {});
      expect(clock.alpha).toBe(0);
    });
  });

  describe("reset", () => {
    it("restores currentTick and clears the accumulator", () => {
      // Use 10Hz (100ms/step) to avoid floating-point edge cases
      const clock = new FixedStepClock({ tickRateHz: 10 });
      clock.advance(0, () => {});
      clock.advance(500, () => {}); // 500ms / 100ms = exactly 5 ticks
      expect(clock.tick).toBe(5);

      clock.reset(10);
      expect(clock.tick).toBe(10);
      expect(clock.alpha).toBe(0);
    });

    it("treats next advance after reset as first advance (initializes lastWallMs)", () => {
      const clock = new FixedStepClock({ tickRateHz: 10 });
      clock.advance(0, () => {});
      clock.advance(300, () => {}); // 3 ticks

      clock.reset(0);
      // First call after reset should return 0 (just sets lastWallMs)
      const count = clock.advance(1000, () => {});
      expect(count).toBe(0);
    });
  });

  describe("constructor", () => {
    it("throws if tickRateHz is not positive", () => {
      expect(() => new FixedStepClock({ tickRateHz: 0 })).toThrow();
      expect(() => new FixedStepClock({ tickRateHz: -1 })).toThrow();
    });
  });
});
