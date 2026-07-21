import { describe, it, expect } from "vitest";
import { dayNightPhase, dayNightFromPhase, simDayPhaseWash } from "./day-night";
import { dayPhase } from "@hollow/sim-core/world";

const TICKS_PER_DAY = 200; // the real sim default (main.ts's TICKS_PER_DAY)

describe("dayNightPhase", () => {
  it("is deterministic and in [0, 1)", () => {
    for (const [tick, ticksPerDay] of [[0, 20], [5, 20], [19, 20], [199, 20]] as const) {
      const phase = dayNightPhase(tick, ticksPerDay);
      expect(phase).toBe(dayNightPhase(tick, ticksPerDay));
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });

  it("wraps at ticksPerDay", () => {
    expect(dayNightPhase(20, 20)).toBeCloseTo(0, 10);
    expect(dayNightPhase(25, 20)).toBeCloseTo(0.25, 10);
  });

  it("accepts a fractional tick (render-clock smoothing)", () => {
    expect(dayNightPhase(10.5, 20)).toBeCloseTo(0.525, 10);
  });

  it("defensively returns 0 for a degenerate ticksPerDay", () => {
    expect(dayNightPhase(5, 0)).toBe(0);
    expect(dayNightPhase(5, -1)).toBe(0);
  });
});

describe("dayNightFromPhase", () => {
  it("peaks dayNight=1 at noon (phase 0.5) and bottoms at midnight (phase 0/1)", () => {
    expect(dayNightFromPhase(0.5).dayNight).toBeCloseTo(1, 5);
    expect(dayNightFromPhase(0).dayNight).toBeCloseTo(0, 5);
    expect(dayNightFromPhase(1).dayNight).toBeCloseTo(0, 5);
  });

  it("keeps dayNight and ambient within their documented ranges across a full day", () => {
    for (let i = 0; i <= 20; i++) {
      const phase = i / 20;
      const { dayNight, ambient } = dayNightFromPhase(phase);
      expect(dayNight).toBeGreaterThanOrEqual(0);
      expect(dayNight).toBeLessThanOrEqual(1);
      expect(ambient).toBeGreaterThan(0);
      expect(ambient).toBeLessThan(1);
    }
  });

  it("keeps the sun above (or just at) the horizon at every phase", () => {
    for (let i = 0; i <= 20; i++) {
      const { sunDir } = dayNightFromPhase(i / 20);
      expect(sunDir[2]).toBeGreaterThan(0);
    }
  });

  it("is deterministic for a given phase", () => {
    expect(dayNightFromPhase(0.3)).toEqual(dayNightFromPhase(0.3));
  });
});

describe("simDayPhaseWash", () => {
  it("is deterministic and in [0, 1)", () => {
    for (const tick of [0, 50, 140, 180, 199]) {
      const wash = simDayPhaseWash(tick, TICKS_PER_DAY);
      expect(wash).toBe(simDayPhaseWash(tick, TICKS_PER_DAY));
      expect(wash).toBeGreaterThanOrEqual(0);
      expect(wash).toBeLessThan(1);
    }
  });

  it("reads bright throughout the WORK phase (straddles dayNightFromPhase's noon hump)", () => {
    // dayPhase's WORK spans day-fraction [.15, .7) — sample its start,
    // middle, and end tick and confirm dayNight never drops far from noon.
    for (const frac of [0.15, 0.4, 0.69]) {
      const tick = frac * TICKS_PER_DAY;
      expect(dayPhase(tick, TICKS_PER_DAY).phase).toBe("work");
      const { dayNight } = dayNightFromPhase(simDayPhaseWash(tick, TICKS_PER_DAY));
      expect(dayNight).toBeGreaterThan(0.7);
    }
  });

  it("darkens across the GATHER phase — the dusk payoff (agents converge as it visibly darkens)", () => {
    const gatherStartTick = 0.7 * TICKS_PER_DAY;
    const gatherEndTick = 0.899 * TICKS_PER_DAY;
    expect(dayPhase(gatherStartTick, TICKS_PER_DAY).phase).toBe("gather");
    expect(dayPhase(gatherEndTick, TICKS_PER_DAY).phase).toBe("gather");
    const startDayNight = dayNightFromPhase(simDayPhaseWash(gatherStartTick, TICKS_PER_DAY)).dayNight;
    const endDayNight = dayNightFromPhase(simDayPhaseWash(gatherEndTick, TICKS_PER_DAY)).dayNight;
    expect(endDayNight).toBeLessThan(startDayNight);
    expect(endDayNight).toBeLessThan(0.2); // reads as genuinely dark by gather's end
  });

  it("stays dark throughout SLEEP (night)", () => {
    for (const frac of [0.9, 0.95, 0.999]) {
      const tick = frac * TICKS_PER_DAY;
      expect(dayPhase(tick, TICKS_PER_DAY).phase).toBe("sleep");
      const { dayNight } = dayNightFromPhase(simDayPhaseWash(tick, TICKS_PER_DAY));
      expect(dayNight).toBeLessThan(0.15);
    }
  });

  it("never jumps at a phase boundary — the day wraps continuously", () => {
    const justBeforeMidnight = simDayPhaseWash(TICKS_PER_DAY - 0.001, TICKS_PER_DAY);
    const justAfterMidnight = simDayPhaseWash(TICKS_PER_DAY, TICKS_PER_DAY);
    // Compare on a circular scale: the gap should be tiny, not ~1 (a wrap
    // discontinuity) or some other large jump.
    const rawDelta = Math.abs(justAfterMidnight - justBeforeMidnight);
    const circularDelta = Math.min(rawDelta, 1 - rawDelta);
    expect(circularDelta).toBeLessThan(0.01);
  });
});
