/**
 * art-07 fire FX — pure-piece tests (no GPU). Fire is render-only + deterministic:
 * the flame frame, the glow-breath flicker, and the glow-quad geometry are all
 * pure functions of (render clock, snapshot) with no RNG / wall-clock, so they
 * unit-test headlessly. Covers the asset-critique rubric F1–F6 logic.
 */
import { describe, it, expect } from "vitest";
import { fireGlowQuads, fireFlicker } from "./citadel-fx";
import { flameFrameAt, FLAME_FRAME_COUNT, flameFrameName, ALL_RECIPES } from "./sprites/recipes";
import type { BuildingSnapshot } from "@citadel/sim-core";

function building(over: Partial<BuildingSnapshot> = {}): BuildingSnapshot {
  return {
    type: "house", x: 4, y: 4, w: 2, h: 2,
    connected: true, outputBuffer: 0, workerCount: 1, occupancy: 0, ownerId: 0,
    onFire: false, burning: false, level: 1,
    lacksFaith: false, lacksSafety: false, lacksGoods: false, mood: 50, wellServed: false,
    ...over,
  };
}

describe("flame frame cycling (render-clock, deterministic)", () => {
  it("cycles through exactly the baked flame frames, incl. the base", () => {
    const baked = new Set(ALL_RECIPES.map((r) => r.name));
    for (let i = 0; i < FLAME_FRAME_COUNT; i++) {
      expect(baked.has(flameFrameName(i)), `${flameFrameName(i)} is a real recipe`).toBe(true);
    }
    const seen = new Set<string>();
    for (let t = 0; t < 2000; t += 30) seen.add(flameFrameAt(t));
    expect(seen.has("fx/flame"), "cycles through the base frame").toBe(true);
    for (const f of seen) expect(baked.has(f), `${f} baked`).toBe(true);
  });

  it("is deterministic + negative-modulo-safe", () => {
    expect(flameFrameAt(1234)).toBe(flameFrameAt(1234));
    // A negative phase must not throw / produce an out-of-range frame.
    const f = flameFrameAt(100, 360, -5000);
    expect(new Set(ALL_RECIPES.map((r) => r.name)).has(f)).toBe(true);
  });
});

describe("fireFlicker", () => {
  it("stays in [0,1] and is deterministic", () => {
    for (let t = 0; t < 5000; t += 37) {
      const v = fireFlicker(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(fireFlicker(999)).toBe(fireFlicker(999));
  });
  it("phase offset de-syncs two fires", () => {
    // Different phases generally give different values (not a hard guarantee at
    // every t, but at a representative sample they must differ somewhere).
    let differed = false;
    for (let t = 0; t < 2000; t += 50) if (fireFlicker(t, 0) !== fireFlicker(t, 500)) { differed = true; break; }
    expect(differed).toBe(true);
  });
});

describe("fireGlowQuads", () => {
  it("emits nothing for a healthy building", () => {
    expect(fireGlowQuads([building()], 0.5, 0.5)).toEqual([]);
  });

  it("emits warm glow rings for a burning building", () => {
    const q = fireGlowQuads([building({ burning: true })], 0.5, 0.5);
    expect(q.length).toBeGreaterThan(0);
    for (const g of q) {
      expect(g.width).toBeGreaterThan(0);
      expect(g.height).toBeGreaterThan(0);
      // alpha byte packed in the low 8 bits — present but translucent.
      const alpha = g.tintRgba & 0xff;
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(0xff);
    }
  });

  it("glows brighter at night than at midday (nightFactor boost)", () => {
    const day = fireGlowQuads([building({ burning: true })], 1, 0);
    const night = fireGlowQuads([building({ burning: true })], 1, 1);
    const aDay = day[0]!.tintRgba & 0xff;
    const aNight = night[0]!.tintRgba & 0xff;
    expect(aNight).toBeGreaterThan(aDay);
  });

  it("also glows for an onFire (not-yet-burning) building", () => {
    expect(fireGlowQuads([building({ onFire: true })], 0.5, 0.5).length).toBeGreaterThan(0);
  });
});
