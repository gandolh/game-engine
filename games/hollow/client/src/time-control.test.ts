import { describe, it, expect } from "vitest";
import { SPEED_OPTIONS, isSpeedMultiplier, normalizeSpeedMultiplier, nextSpeed } from "./time-control";

describe("isSpeedMultiplier", () => {
  it("accepts only the four documented options", () => {
    for (const opt of SPEED_OPTIONS) expect(isSpeedMultiplier(opt)).toBe(true);
    expect(isSpeedMultiplier(3)).toBe(false);
    expect(isSpeedMultiplier(0)).toBe(false);
    expect(isSpeedMultiplier(16)).toBe(false);
  });
});

describe("normalizeSpeedMultiplier", () => {
  it("passes a valid multiplier through unchanged", () => {
    expect(normalizeSpeedMultiplier(4)).toBe(4);
  });

  it("snaps an invalid multiplier to the nearest option", () => {
    expect(normalizeSpeedMultiplier(3)).toBe(2); // |3-2|=1 < |3-4|=1 -> tie broken toward slower
    expect(normalizeSpeedMultiplier(100)).toBe(8);
    expect(normalizeSpeedMultiplier(-5)).toBe(1);
    expect(normalizeSpeedMultiplier(0)).toBe(1);
  });
});

describe("nextSpeed", () => {
  it("steps to the next option, saturating at the fastest", () => {
    expect(nextSpeed(1)).toBe(2);
    expect(nextSpeed(2)).toBe(4);
    expect(nextSpeed(4)).toBe(8);
    expect(nextSpeed(8)).toBe(8);
  });
});
