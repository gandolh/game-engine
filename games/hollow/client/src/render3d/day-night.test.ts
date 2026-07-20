import { describe, it, expect } from "vitest";
import { dayNightPhase, dayNightFromPhase } from "./day-night";

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
