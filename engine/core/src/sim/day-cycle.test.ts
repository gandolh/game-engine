import { describe, it, expect } from "vitest";
import { dayFraction, nightFactor, daylightFactor } from "./day-cycle";

describe("dayFraction", () => {
  it("maps a tick to its position through the day", () => {
    expect(dayFraction(0, 20)).toBe(0);
    expect(dayFraction(5, 20)).toBe(0.25);
    expect(dayFraction(10, 20)).toBe(0.5);
    expect(dayFraction(15, 20)).toBe(0.75);
  });

  it("wraps at the day boundary", () => {
    expect(dayFraction(20, 20)).toBe(0);
    expect(dayFraction(21, 20)).toBe(0.05);
    expect(dayFraction(1200 * 7, 1200)).toBe(0);
  });

  it("handles negative ticks via the double modulo", () => {
    expect(dayFraction(-1, 20)).toBe(0.95);
    expect(dayFraction(-20, 20)).toBe(0);
    expect(dayFraction(-25, 20)).toBe(0.75);
  });

  it("accepts a fractional tick (render-clock smoothing)", () => {
    expect(dayFraction(2.5, 10)).toBe(0.25);
  });

  it("is always in [0, 1)", () => {
    for (let t = -50; t < 200; t++) {
      const f = dayFraction(t, 17);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  // audit-62: Farm's copy lacked this guard, so it divided by zero and returned NaN — which then
  // compared false against every phase threshold and silently reported "night" forever.
  it("returns 0, not NaN, for a degenerate ticksPerDay", () => {
    for (const bad of [0, -1, NaN, -0]) {
      expect(dayFraction(5, bad), `ticksPerDay=${String(bad)}`).toBe(0);
    }
  });
});

describe("nightFactor / daylightFactor — the named polarity pair (audit-62)", () => {
  // THE test of this brief. Three games defined this curve with two opposite signs under names
  // that did not make the difference obvious; these pin which is which, by value.
  it("nightFactor is 1 at midnight and 0 at noon", () => {
    expect(nightFactor(0)).toBeCloseTo(1, 10);
    expect(nightFactor(0.5)).toBeCloseTo(0, 10);
    expect(nightFactor(1)).toBeCloseTo(1, 10);
  });

  it("daylightFactor is 0 at midnight and 1 at noon", () => {
    expect(daylightFactor(0)).toBeCloseTo(0, 10);
    expect(daylightFactor(0.5)).toBeCloseTo(1, 10);
    expect(daylightFactor(1)).toBeCloseTo(0, 10);
  });

  it("both are 0.5 at sunrise and sunset", () => {
    for (const p of [0.25, 0.75]) {
      expect(nightFactor(p)).toBeCloseTo(0.5, 10);
      expect(daylightFactor(p)).toBeCloseTo(0.5, 10);
    }
  });

  it("pins all four quarter-phase values for both curves", () => {
    const quarters = [0, 0.25, 0.5, 0.75];
    expect(quarters.map((p) => Number(nightFactor(p).toFixed(6)))).toEqual([1, 0.5, 0, 0.5]);
    expect(quarters.map((p) => Number(daylightFactor(p).toFixed(6)))).toEqual([0, 0.5, 1, 0.5]);
  });

  it("they sum to exactly 1 across the whole day", () => {
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      expect(nightFactor(p) + daylightFactor(p)).toBeCloseTo(1, 12);
    }
  });

  it("both stay clamped to [0, 1] even off the [0,1) phase domain", () => {
    for (const p of [-3.7, -0.2, 1.4, 9.9]) {
      expect(nightFactor(p)).toBeGreaterThanOrEqual(0);
      expect(nightFactor(p)).toBeLessThanOrEqual(1);
      expect(daylightFactor(p)).toBeGreaterThanOrEqual(0);
      expect(daylightFactor(p)).toBeLessThanOrEqual(1);
    }
  });

  it("nightFactor is monotonically falling from midnight to noon", () => {
    let prev = nightFactor(0);
    for (let i = 1; i <= 50; i++) {
      const cur = nightFactor(i / 100);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });

  it("is periodic with period 1", () => {
    for (const p of [0.13, 0.37, 0.62, 0.88]) {
      expect(nightFactor(p + 1)).toBeCloseTo(nightFactor(p), 12);
      expect(nightFactor(p + 5)).toBeCloseTo(nightFactor(p), 12);
    }
  });
});
