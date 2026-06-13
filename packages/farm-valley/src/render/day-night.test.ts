import { describe, it, expect } from "vitest";
import { washFor, daylightAt } from "./day-night";

const TPD = 1200;

describe("day-night grading", () => {
  it("daylight peaks at midday and is zero deep at night", () => {
    expect(daylightAt(0.5, 0.6)).toBe(1); 
    expect(daylightAt(0.0, 0.6)).toBe(0); 
    expect(daylightAt(0.95, 0.6)).toBe(0); 
  });

  it("the night wash is stronger (more opaque) than the noon wash", () => {
    const noon = washFor({ tick: TPD * 0.5, ticksPerDay: TPD, season: "spring" });
    const night = washFor({ tick: TPD * 0.95, ticksPerDay: TPD, season: "spring" });
    expect(night.alpha).toBeGreaterThan(noon.alpha);
  });

  it("winter has a shorter daylight window than summer", () => {

    const f = 0.72;
    const winterLight = daylightAt(f, 0.42);
    const summerLight = daylightAt(f, 0.7);
    expect(winterLight).toBeLessThan(summerLight);
  });

  it("is deterministic on (tick, ticksPerDay, season)", () => {
    const a = washFor({ tick: 800, ticksPerDay: TPD, season: "autumn" });
    const b = washFor({ tick: 800, ticksPerDay: TPD, season: "autumn" });
    expect(a).toEqual(b);
  });

  it("returns a valid #rrggbb color and alpha in [0,1]", () => {
    for (const tick of [0, 300, 600, 900, 1199]) {
      const w = washFor({ tick, ticksPerDay: TPD, season: "winter" });
      expect(w.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(w.alpha).toBeGreaterThanOrEqual(0);
      expect(w.alpha).toBeLessThanOrEqual(1);
    }
  });

  it("winter nights are darker (higher alpha) than spring nights", () => {
    const winterNight = washFor({ tick: TPD * 0.97, ticksPerDay: TPD, season: "winter" });
    const springNight = washFor({ tick: TPD * 0.97, ticksPerDay: TPD, season: "spring" });
    expect(winterNight.alpha).toBeGreaterThan(springNight.alpha);
  });
});
