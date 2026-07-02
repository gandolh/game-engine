/**
 * Pure-function tests for the day/night wash + night light pool (brief 15).
 * No GPU — these exercise the pure helpers headlessly.
 */
import { describe, it, expect } from "vitest";
import { EDG } from "@engine/core";
import {
  dayFractionOf,
  nightFactorOf,
  computeWash,
  emittersOf,
  lightPoolQuads,
  LIGHT_EMITTERS,
} from "./atmosphere";
import type { BuildingSnapshot } from "@citadel/sim-core";

function mkBuilding(type: string, x = 0, y = 0, w = 1, h = 1): BuildingSnapshot {
  return {
    type, x, y, w, h,
    connected: true, outputBuffer: 0, workerCount: 0, occupancy: 0, ownerId: 0,
    onFire: false, burning: false, level: 1,
    lacksFaith: true, lacksSafety: true, lacksGoods: true, mood: 40,
  };
}

describe("dayFractionOf", () => {
  it("is 0 at the start of a day and wraps", () => {
    expect(dayFractionOf(0, 20)).toBe(0);
    expect(dayFractionOf(20, 20)).toBe(0);
    expect(dayFractionOf(10, 20)).toBe(0.5);
    expect(dayFractionOf(25, 20)).toBe(0.25);
  });
  it("guards zero ticksPerDay", () => {
    expect(dayFractionOf(5, 0)).toBe(0);
  });
});

describe("nightFactorOf", () => {
  it("is 1 at midnight (fraction 0/1) and 0 at noon (0.5)", () => {
    expect(nightFactorOf(0)).toBeCloseTo(1, 5);
    expect(nightFactorOf(1)).toBeCloseTo(1, 5);
    expect(nightFactorOf(0.5)).toBeCloseTo(0, 5);
  });
  it("is mid at the quarter points", () => {
    expect(nightFactorOf(0.25)).toBeCloseTo(0.5, 5);
    expect(nightFactorOf(0.75)).toBeCloseTo(0.5, 5);
  });
});

describe("computeWash", () => {
  it("midnight is a gentle navy night tint (never a hard blue-black)", () => {
    const w = computeWash("summer", 0);
    expect(w.color).toBe(EDG.navy);
    expect(w.alpha).toBeGreaterThan(0.3);
    expect(w.alpha).toBeLessThanOrEqual(0.42);
  });
  it("noon in winter is a faint cool seasonal grade (not night navy)", () => {
    const w = computeWash("winter", 0.5);
    expect(w.color).toBe(EDG.skyBlue);
    expect(w.alpha).toBeLessThan(0.2);
    expect(w.alpha).toBeGreaterThan(0);
  });
  it("noon in summer is a near-clear warm grade", () => {
    const w = computeWash("summer", 0.5);
    expect(w.color).toBe(EDG.gold);
    expect(w.alpha).toBeLessThan(0.1);
  });
  it("dusk band yields a warm golden-hour accent", () => {
    const w = computeWash("autumn", 0.78);
    expect(w.color).toBe(EDG.gold);
    expect(w.alpha).toBeGreaterThan(0);
  });
  it("unknown season falls back without throwing", () => {
    const w = computeWash("eternal-night", 0.5);
    expect(w.color).toBe(EDG.skyBlue);
  });
});

describe("emittersOf + lightPoolQuads", () => {
  const buildings = [
    mkBuilding("bakery", 5, 5),
    mkBuilding("smith", 10, 10),
    mkBuilding("house", 1, 1),
    mkBuilding("farm", 2, 2),
    mkBuilding("market", 20, 20, 2, 2),
    mkBuilding("chapel", 30, 30),
  ];

  it("extracts only emitter types", () => {
    const e = emittersOf(buildings);
    const types = e.map((x) => x.type).sort();
    expect(types).toEqual(["bakery", "chapel", "market", "smith"]);
  });

  it("every emitter type has a registered intensity", () => {
    for (const e of emittersOf(buildings)) {
      expect(LIGHT_EMITTERS[e.type]).toBeGreaterThan(0);
    }
  });

  it("emits NO glow quads at midday (nightFactor 0)", () => {
    expect(lightPoolQuads(emittersOf(buildings), 0)).toHaveLength(0);
  });

  it("emits glow quads only at night, only for emitters", () => {
    const quads = lightPoolQuads(emittersOf(buildings), 1);
    // 4 emitters × 3 rings = 12 quads (all alpha > 0 at full night).
    expect(quads.length).toBe(4 * 3);
    // All quads are translucent (alpha byte < 0xff packed in the low byte).
    for (const q of quads) {
      expect(q.tintRgba & 0xff).toBeLessThan(0xff);
      expect(q.tintRgba & 0xff).toBeGreaterThan(0);
    }
  });

  it("glow alpha scales down with the night factor", () => {
    const full = lightPoolQuads(emittersOf([mkBuilding("bakery")]), 1);
    const half = lightPoolQuads(emittersOf([mkBuilding("bakery")]), 0.5);
    // Compare the brightest (core) ring alpha byte.
    const fullCore = Math.max(...full.map((q) => q.tintRgba & 0xff));
    const halfCore = Math.max(...half.map((q) => q.tintRgba & 0xff));
    expect(halfCore).toBeLessThan(fullCore);
  });

  it("non-emitter buildings never produce glow", () => {
    const quads = lightPoolQuads(emittersOf([mkBuilding("house"), mkBuilding("farm")]), 1);
    expect(quads).toHaveLength(0);
  });
});
