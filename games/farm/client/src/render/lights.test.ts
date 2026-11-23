import { describe, it, expect } from "vitest";
import { LIGHT_EMITTERS } from "@farm/sim-core/render-systems";
import { makeLightOverlay, _LIGHT_COUNT, _NIGHT_GATE } from "./lights";
import { rgbOf } from "@engine/core/render";

describe("local light overlay", () => {
  it("emitter table is non-empty and on the EDG palette", () => {
    expect(LIGHT_EMITTERS.length).toBeGreaterThan(0);
    expect(_LIGHT_COUNT).toBe(LIGHT_EMITTERS.length);
    for (const e of LIGHT_EMITTERS) {
      expect(() => rgbOf(e.color)).not.toThrow();
      expect(e.radiusTiles).toBeGreaterThan(0);
      expect(e.intensity).toBeGreaterThan(0);
      expect(e.intensity).toBeLessThanOrEqual(1);
    }
  });

  it("returns no overlay during the day (nightness at/below the gate)", () => {
    expect(makeLightOverlay(_NIGHT_GATE)).toBeUndefined();
    expect(makeLightOverlay(0)).toBeUndefined();
  });

  it("lists one pool per emitter at night, with palette colours and the intensity-scaled peak", () => {
    const o = makeLightOverlay(1);
    expect(o?.count).toBe(LIGHT_EMITTERS.length);
    const first = LIGHT_EMITTERS[0];
    const p = o?.pools[0];
    expect(first).toBeDefined();
    expect(p).toBeDefined();
    const [r, g, b] = rgbOf(first?.color ?? "");
    expect([p?.r, p?.g, p?.b]).toEqual([r / 255, g / 255, b / 255]);
    expect(p?.peak).toBeCloseTo(first?.intensity ?? -1, 12);
    for (const pool of o?.pools.slice(0, o.count) ?? []) {
      expect(pool.radius).toBeGreaterThan(0);
      expect(pool.peak).toBeGreaterThan(0);
      expect(pool.peak).toBeLessThanOrEqual(1);
    }
  });

  it("scales the peak by how deep the night is", () => {
    const deep = makeLightOverlay(1)?.pools[0]?.peak ?? 0;
    const dusk = makeLightOverlay(0.56)?.pools[0]?.peak ?? -1;
    expect(deep).toBeGreaterThan(0);
    expect(dusk).toBeCloseTo(deep * 0.5, 12);
  });

  it("culls pools outside the view rect", () => {
    const o = makeLightOverlay(1, { left: -10000, right: -9000, top: -10000, bottom: -9000 });
    expect(o?.count).toBe(0);
  });
});
