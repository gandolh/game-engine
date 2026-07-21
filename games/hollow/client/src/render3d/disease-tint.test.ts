import { describe, it, expect } from "vitest";
import { sicklyTint } from "./disease-tint";

describe("sicklyTint", () => {
  it("darkens a near-white base tint toward a desaturated green", () => {
    const [r, g, b, a] = sicklyTint([1, 1, 1, 1]);
    // Green channel should read the strongest (a "sickly green" cast), and
    // every channel should be dimmer than the untinted base (darkens, not
    // brightens — the opposite of selection.ts's gold highlight).
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(r).toBeLessThan(1);
    expect(g).toBeLessThan(1);
    expect(b).toBeLessThan(1);
    expect(a).toBe(1);
  });

  it("preserves alpha unchanged", () => {
    const [, , , a] = sicklyTint([0.5, 0.6, 0.7, 0.42]);
    expect(a).toBe(0.42);
  });

  it("is pure and deterministic", () => {
    const base: readonly [number, number, number, number] = [0.95, 1.02, 0.98, 1];
    expect(sicklyTint(base)).toEqual(sicklyTint(base));
  });

  it("scales proportionally with the base tint (brighter base -> brighter sick tint)", () => {
    const dim = sicklyTint([0.9, 0.9, 0.9, 1]);
    const bright = sicklyTint([1.1, 1.1, 1.1, 1]);
    expect(bright[1]).toBeGreaterThan(dim[1]);
  });

  it("composes with selectedTint (both can apply to the same instance)", () => {
    const composed = sicklyTint([1, 1, 1, 1]);
    expect(composed.length).toBe(4);
    expect(composed.every((v) => Number.isFinite(v))).toBe(true);
  });
});
