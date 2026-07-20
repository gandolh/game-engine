import { describe, it, expect } from "vitest";
import { selectedTint } from "./selection";

describe("selectedTint", () => {
  it("brightens a base tint (every channel scales up from white)", () => {
    const base: readonly [number, number, number, number] = [1, 1, 1, 1];
    const [r, g, b, a] = selectedTint(base);
    expect(r).toBeGreaterThan(0);
    expect(g).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(a).toBe(1);
  });

  it("preserves alpha unchanged", () => {
    const [, , , a] = selectedTint([0.5, 0.6, 0.7, 0.42]);
    expect(a).toBe(0.42);
  });

  it("is pure and deterministic", () => {
    const base: readonly [number, number, number, number] = [0.95, 1.02, 0.98, 1];
    expect(selectedTint(base)).toEqual(selectedTint(base));
  });

  it("scales proportionally with the base tint (brighter base -> brighter highlight)", () => {
    const dim = selectedTint([0.9, 0.9, 0.9, 1]);
    const bright = selectedTint([1.1, 1.1, 1.1, 1]);
    expect(bright[0]).toBeGreaterThan(dim[0]);
  });
});
