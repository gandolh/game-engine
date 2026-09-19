import { describe, it, expect, afterEach } from "vitest";
import { MAX_DEVICE_PIXEL_RATIO, effectiveDpr } from "./dpr";

// node's vitest env has no `window` — same pattern as gl-context.test.ts's
// resize tests (which this module's formula was extracted from).
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("effectiveDpr", () => {
  it("returns 1 when window is undefined (node env / headless tools)", () => {
    expect(typeof window).toBe("undefined");
    expect(effectiveDpr()).toBe(1);
  });

  it("clamps at MAX_DEVICE_PIXEL_RATIO (2) on a high-DPI display", () => {
    (globalThis as unknown as { window: { devicePixelRatio: number } }).window = {
      devicePixelRatio: 3,
    };
    expect(effectiveDpr()).toBe(MAX_DEVICE_PIXEL_RATIO);
    expect(effectiveDpr()).toBe(2);
  });

  it("passes through a sub-cap ratio unchanged", () => {
    (globalThis as unknown as { window: { devicePixelRatio: number } }).window = {
      devicePixelRatio: 1.5,
    };
    expect(effectiveDpr()).toBe(1.5);
  });

  it("falls back to 1 when devicePixelRatio is 0/undefined", () => {
    (globalThis as unknown as { window: { devicePixelRatio: number | undefined } }).window = {
      devicePixelRatio: undefined,
    };
    expect(effectiveDpr()).toBe(1);
  });
});
