import { describe, it, expect } from "vitest";
import {
  dayFraction,
  phaseForTick,
  isActivePhase,
  isNightPhase,
} from "./day-phase";

describe("day-phase", () => {
  const TPD = 1200;

  it("maps ticks to the four phases in order across a day", () => {
    expect(phaseForTick(0, TPD)).toBe("morning"); // 0.00
    expect(phaseForTick(TPD * 0.1, TPD)).toBe("morning");
    expect(phaseForTick(TPD * 0.2, TPD)).toBe("work"); // 0.15..0.65
    expect(phaseForTick(TPD * 0.6, TPD)).toBe("work");
    expect(phaseForTick(TPD * 0.7, TPD)).toBe("evening"); // 0.65..0.85
    expect(phaseForTick(TPD * 0.9, TPD)).toBe("night"); // 0.85..1.0
  });

  it("wraps per day — tick TPD is morning of the next day", () => {
    expect(phaseForTick(TPD, TPD)).toBe("morning");
    expect(dayFraction(TPD, TPD)).toBe(0);
    expect(dayFraction(TPD + TPD * 0.5, TPD)).toBeCloseTo(0.5);
  });

  it("classifies active vs night phases", () => {
    expect(isActivePhase("morning")).toBe(true);
    expect(isActivePhase("work")).toBe(true);
    expect(isActivePhase("evening")).toBe(true);
    expect(isActivePhase("night")).toBe(false);
    expect(isNightPhase("night")).toBe(true);
    expect(isNightPhase("work")).toBe(false);
  });

  it("is deterministic and independent of day length", () => {
    // Same fraction → same phase regardless of ticksPerDay.
    expect(phaseForTick(60, 1200)).toBe(phaseForTick(300, 6000)); // both 0.05
  });
});
