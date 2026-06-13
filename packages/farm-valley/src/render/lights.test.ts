import { describe, it, expect } from "vitest";
import { LIGHT_EMITTERS } from "@farm/sim-core/render-systems";
import { makeLightOverlay, _LIGHT_COUNT, _NIGHT_GATE } from "./lights";
import { rgbOf } from "@engine/core/render";

/** Minimal Ctx2D spy: records composite-op transitions, fill count, and gradient stops. */
function spyCtx() {
  const ops: string[] = [];
  const stops: Array<[number, string]> = [];
  let fills = 0;
  let _op = "source-over";
  const grad = {
    addColorStop(o: number, c: string) {
      stops.push([o, c]);
    },
  };
  const ctx = {
    get globalCompositeOperation() {
      return _op;
    },
    set globalCompositeOperation(v: string) {
      _op = v;
      ops.push(v);
    },
    globalAlpha: 1,
    fillStyle: null as unknown,
    createRadialGradient: () => grad,
    beginPath() {},
    arc() {},
    fill() {
      fills += 1;
    },
  };
  return { ctx, ops, stops, get fills() {
    return fills;
  } };
}

describe("local light overlay", () => {
  it("emitter table is non-empty and on the EDG palette", () => {
    expect(LIGHT_EMITTERS.length).toBeGreaterThan(0);
    expect(_LIGHT_COUNT).toBe(LIGHT_EMITTERS.length);
    for (const e of LIGHT_EMITTERS) {
      expect(() => rgbOf(e.color)).not.toThrow(); // EDG hex
      expect(e.radiusTiles).toBeGreaterThan(0);
      expect(e.intensity).toBeGreaterThan(0);
      expect(e.intensity).toBeLessThanOrEqual(1);
    }
  });

  it("draws nothing during the day (nightness at/below the gate)", () => {
    const s = spyCtx();
    makeLightOverlay(_NIGHT_GATE)(s.ctx as never);
    expect(s.fills).toBe(0);
    expect(s.ops).toEqual([]); // composite op never touched → no work
  });

  it("draws additive warm glows at night and restores composite", () => {
    const s = spyCtx();
    makeLightOverlay(1)(s.ctx as never); // deep night
    expect(s.fills).toBe(LIGHT_EMITTERS.length);
    expect(s.ops).toContain("lighter"); // additive
    expect(s.ops[s.ops.length - 1]).toBe("source-over"); // restored
    // Each glow has a fully-opaque-at-color center stop and a transparent rim.
    expect(s.stops.some(([o]) => o === 0)).toBe(true);
    expect(s.stops.some(([, c]) => c.endsWith(",0)"))).toBe(true);
  });

  it("culls glows outside the view rect", () => {
    const s = spyCtx();
    // A view far off-world (negative) should cull every emitter (all at positive tiles).
    makeLightOverlay(1, { left: -10000, right: -9000, top: -10000, bottom: -9000 })(s.ctx as never);
    expect(s.fills).toBe(0);
  });
});
