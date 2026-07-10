/**
 * Brief 110 — the static-layer bake must fail LOUDLY when a world's baked texture
 * exceeds the adapter's `maxTextureDimension2D` (WebGPU's default is 8192 px).
 *
 * Without the guard, `createTexture` raises a validation error on the device's
 * error scope, returns an invalid texture, and the frame paints black with nothing
 * in the console tying the failure to the world size. Citadel's 256×256 world lands
 * its iso texture at exactly 8192 px wide — on the limit, with zero margin.
 */
import { describe, it, expect } from "vitest";
import { assertTextureWithinLimits } from "./static-layer-pass";

/** A device stub carrying only the limit the guard reads. */
function deviceWithLimit(maxTextureDimension2D: number): GPUDevice {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test stub: the guard touches `limits` only.
  return { limits: { maxTextureDimension2D } } as unknown as GPUDevice;
}

describe("assertTextureWithinLimits", () => {
  const device = deviceWithLimit(8192);

  it("passes a texture inside the limit", () => {
    expect(() => assertTextureWithinLimits(device, 6144, 3088)).not.toThrow();
  });

  it("passes a texture exactly ON the limit (8192 is valid, not one past it)", () => {
    expect(() => assertTextureWithinLimits(device, 8192, 4112)).not.toThrow();
  });

  it("throws when the width exceeds the limit", () => {
    expect(() => assertTextureWithinLimits(device, 8193, 100)).toThrow(RangeError);
  });

  it("throws when the height exceeds the limit", () => {
    expect(() => assertTextureWithinLimits(device, 100, 9000)).toThrow(RangeError);
  });

  it("names the offending size, the limit, and the way out", () => {
    expect(() => assertTextureWithinLimits(device, 12000, 6000, "static-layer bake")).toThrow(
      /static-layer bake is 12000×6000px.*maxTextureDimension2D is 8192px.*window the bake/s,
    );
  });

  it("respects a device that reports a larger limit", () => {
    expect(() => assertTextureWithinLimits(deviceWithLimit(16384), 12000, 6000)).not.toThrow();
  });

  // The sizes that motivated the guard, as arithmetic. Iso world-px for an N×N tile
  // world is (N+N)·16 wide by (N+N)·8 + 16 tall.
  it("Citadel's world sizes, measured against the default 8192 limit", () => {
    const iso = (n: number): [number, number] => [(n + n) * 16, (n + n) * 8 + 16];
    expect(() => assertTextureWithinLimits(device, ...iso(96))).not.toThrow(); // 3072×1552
    expect(() => assertTextureWithinLimits(device, ...iso(192))).not.toThrow(); // 6144×3088
    expect(() => assertTextureWithinLimits(device, ...iso(256))).not.toThrow(); // 8192×4112 — exactly on it
    expect(() => assertTextureWithinLimits(device, ...iso(257))).toThrow(RangeError); // 8224 — over
  });
});
