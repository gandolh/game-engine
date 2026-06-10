/**
 * camera.test.ts — brief 60: Camera2D.setZoom clamping + worldUnits derivation.
 *
 * Tests:
 *  1. setZoom at 1 sets zoom=1 and derives worldUnitsX/Y = baseUnits exactly.
 *  2. setZoom below MIN_ZOOM clamps to MIN_ZOOM.
 *  3. setZoom above MAX_ZOOM clamps to MAX_ZOOM.
 *  4. setZoom in the valid interior sets zoom exactly and derives correct worldUnits.
 *  5. worldUnitsX/Y = baseUnits / zoom after a valid setZoom.
 *  6. setZoom at MAX_ZOOM (6) — at 6× a 16px tile = 96 canvas px (regression guard).
 */
import { describe, it, expect } from "vitest";
import { Camera2D, MIN_ZOOM, MAX_ZOOM } from "./camera";

function makeCamera(unitsX = 640, unitsY = 480): Camera2D {
  return new Camera2D({ worldUnitsX: unitsX, worldUnitsY: unitsY, centerX: 0, centerY: 0 });
}

describe("Camera2D.setZoom (brief 60)", () => {
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
    // This is the brief-60 acceptance regression: no-clamp at 6.
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
