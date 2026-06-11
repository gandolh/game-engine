import { describe, it, expect } from "vitest";
import { Camera2D, MIN_ZOOM, MAX_ZOOM, expSmooth } from "./camera";

function makeCamera(unitsX = 640, unitsY = 480): Camera2D {
  return new Camera2D({ worldUnitsX: unitsX, worldUnitsY: unitsY, centerX: 0, centerY: 0 });
}

describe("Camera2D.setZoom", () => {
  it("zoom=1 leaves worldUnits equal to base units", () => {
    const cam = makeCamera(640, 480);
    cam.setZoom(1);
    expect(cam.zoom).toBe(1);
    expect(cam.worldUnitsX).toBe(640);
    expect(cam.worldUnitsY).toBe(480);
  });

  it("clamps below MIN_ZOOM to MIN_ZOOM", () => {
    const cam = makeCamera();
    cam.setZoom(0);
    expect(cam.zoom).toBe(MIN_ZOOM);
    cam.setZoom(-10);
    expect(cam.zoom).toBe(MIN_ZOOM);
  });

  it("clamps above MAX_ZOOM to MAX_ZOOM", () => {
    const cam = makeCamera();
    cam.setZoom(100);
    expect(cam.zoom).toBe(MAX_ZOOM);
    cam.setZoom(MAX_ZOOM + 0.001);
    expect(cam.zoom).toBe(MAX_ZOOM);
  });

  it("accepts values in the valid interior [MIN_ZOOM, MAX_ZOOM] unchanged", () => {
    const cam = makeCamera();
    cam.setZoom(2);
    expect(cam.zoom).toBe(2);
    cam.setZoom(MIN_ZOOM);
    expect(cam.zoom).toBe(MIN_ZOOM);
    cam.setZoom(MAX_ZOOM);
    expect(cam.zoom).toBe(MAX_ZOOM);
  });

  it("derives worldUnitsX/Y = baseUnits / zoom", () => {
    const cam = makeCamera(640, 480);
    cam.setZoom(2);
    expect(cam.worldUnitsX).toBeCloseTo(320, 6);
    expect(cam.worldUnitsY).toBeCloseTo(240, 6);
  });

  it("at MAX_ZOOM (6) worldUnits = baseUnits / 6 — a 16px tile maps to 96 canvas px", () => {
    const cam = makeCamera(640, 480);
    cam.setZoom(MAX_ZOOM);
    expect(cam.zoom).toBe(6);
    expect(cam.worldUnitsX).toBeCloseTo(640 / 6, 6);
    expect(cam.worldUnitsY).toBeCloseTo(480 / 6, 6);
  });

  it("MIN_ZOOM is 0.5 and MAX_ZOOM is 6 (contract guard)", () => {
    expect(MIN_ZOOM).toBe(0.5);
    expect(MAX_ZOOM).toBe(6);
  });
});

describe("expSmooth", () => {
  it("converges toward target over time", () => {
    let val = 0;
    const target = 100;
    for (let i = 0; i < 100; i++) {
      val = expSmooth(val, target, 10, 0.016);
    }
    // After 100 frames at ~16ms, must be very close to target
    expect(val).toBeCloseTo(target, 1);
  });

  it("never overshoots — result is always between current and target for positive k and dt", () => {
    const current = 0;
    const target = 50;
    const result = expSmooth(current, target, 10, 0.016);
    expect(result).toBeGreaterThan(current);
    expect(result).toBeLessThan(target);
  });

  it("never overshoots in the negative direction", () => {
    const current = 100;
    const target = 0;
    const result = expSmooth(current, target, 10, 0.016);
    expect(result).toBeLessThan(current);
    expect(result).toBeGreaterThan(target);
  });

  it("frame-rate independence — one 32ms step ≈ two 16ms steps (within ~1e-3 of gap)", () => {
    const current = 0;
    const target = 100;
    // One 32ms step
    const oneStep = expSmooth(current, target, 10, 0.032);
    // Two 16ms steps
    const twoSteps = expSmooth(expSmooth(current, target, 10, 0.016), target, 10, 0.016);
    // The gap between them should be small
    expect(Math.abs(oneStep - twoSteps)).toBeLessThan(1e-3 * (target - current));
  });

  it("identity when current === target", () => {
    const result = expSmooth(42, 42, 10, 0.016);
    expect(result).toBe(42);
  });
});
