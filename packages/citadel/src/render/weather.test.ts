/**
 * Pure-function tests for the season→weather mapping (brief 16) + a guard that
 * Citadel's weather code introduces no `Math.random` of its own.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EDG, RainField } from "@engine/core";
import { seasonToWeather, CitadelWeather } from "./weather";

describe("seasonToWeather", () => {
  it("winter is always snow (white)", () => {
    for (const d of [0, 1, 2, 3, 5, 7, 10]) {
      const w = seasonToWeather("winter", d);
      expect(w.kind).toBe("snow");
      expect(w.color).toBe(EDG.white);
      expect(w.intensity).toBeGreaterThan(0);
    }
  });

  it("winter cadence days are flurries (higher intensity)", () => {
    const flurry = seasonToWeather("winter", 0); // 0 % 5 === 0
    const calm = seasonToWeather("winter", 1);
    expect(flurry.intensity).toBeGreaterThan(calm.intensity);
  });

  it("non-winter rainy-cadence days produce rain (sky blue)", () => {
    const w = seasonToWeather("summer", 5); // 5 % 5 === 0
    expect(w.kind).toBe("rain");
    expect(w.color).toBe(EDG.skyBlue);
    expect(w.intensity).toBeGreaterThan(0);
  });

  it("non-winter, non-cadence days are clear", () => {
    const w = seasonToWeather("spring", 3); // 3 % 5 !== 0
    expect(w.kind).toBe("none");
    expect(w.intensity).toBe(0);
  });

  it("is deterministic / pure (no day mutation, same in/out)", () => {
    expect(seasonToWeather("autumn", 10)).toEqual(seasonToWeather("autumn", 10));
  });
});

describe("CitadelWeather", () => {
  it("owns an engine RainField seeded as render-side state", () => {
    const cw = new CitadelWeather();
    expect(cw.field).toBeInstanceOf(RainField);
    expect(cw.count).toBe(0); // nothing spawned until update
  });

  it("clear weather keeps the drop count at zero", () => {
    const cw = new CitadelWeather();
    cw.update(0.016, "spring", 3, { left: 0, right: 100, top: 0, bottom: 100 });
    expect(cw.count).toBe(0);
  });

  it("snow in winter spawns capped drops", () => {
    const cw = new CitadelWeather();
    cw.update(0.016, "winter", 0, { left: 0, right: 200, top: 0, bottom: 200 });
    expect(cw.count).toBeGreaterThan(0);
    expect(cw.count).toBeLessThanOrEqual(900); // RainField hard cap
  });
});

describe("no Math.random in citadel weather source", () => {
  it("weather.ts contains no Math.random call", () => {
    const src = readFileSync(resolve(process.cwd(), "src/render/weather.ts"), "utf8");
    // The RainField (engine) uses Math.random internally; OUR file must not.
    expect(src).not.toMatch(/Math\s*\.\s*random/);
    expect(src).not.toMatch(/Date\s*\.\s*now/);
  });
});
