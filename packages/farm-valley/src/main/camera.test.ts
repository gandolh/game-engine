import { describe, it, expect } from "vitest";
import { Camera2D } from "@engine/core";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@farm/sim-core/world/regions";
import { stepFocusGlide } from "./camera";
import { CAMERA_CONFIG, DEFAULT_ZOOM, TILE } from "./config";

// Convenience: produce a mutable glide state object.
function makeState(gliding = false, elapsedSec = 0): { gliding: boolean; elapsedSec: number } {
  return { gliding, elapsedSec };
}

describe("default zoom activates viewport culling (brief 84)", () => {
  // Mirror of the renderer's CULL_MARGIN (WebGpuRenderer / Canvas2dRenderer).
  const CULL_MARGIN = 32;
  const worldPxW = WORLD_WIDTH * TILE;
  const worldPxH = WORLD_HEIGHT * TILE;

  // Replicates renderer `_inView`: a sprite is culled when outside the camera
  // viewport (+ margin). The viewport half-extent is worldUnitsX/2.
  function inView(cam: Camera2D, x: number, y: number): boolean {
    const halfX = cam.worldUnitsX / 2;
    const halfY = cam.worldUnitsY / 2;
    return (
      x >= cam.centerX - halfX - CULL_MARGIN &&
      x <= cam.centerX + halfX + CULL_MARGIN &&
      y >= cam.centerY - halfY - CULL_MARGIN &&
      y <= cam.centerY + halfY + CULL_MARGIN
    );
  }

  it("DEFAULT_ZOOM is > 1 so the viewport is smaller than the whole world", () => {
    // Regression guard: resetting the default to 1 (whole-world view) makes the
    // cull a no-op and reintroduces the Tier-0 raster cost.
    expect(DEFAULT_ZOOM).toBeGreaterThan(1);
    const cam = new Camera2D(CAMERA_CONFIG);
    cam.setZoom(DEFAULT_ZOOM);
    expect(cam.worldUnitsX).toBeLessThan(worldPxW);
    expect(cam.worldUnitsY).toBeLessThan(worldPxH);
  });

  it("a far-corner sprite is culled at DEFAULT_ZOOM but NOT at zoom 1", () => {
    const cam = new Camera2D(CAMERA_CONFIG);
    cam.setCenter(worldPxW / 2, worldPxH / 2);

    // zoom 1 (whole world in view): the cull is a no-op — corner stays in view.
    cam.setZoom(1);
    expect(inView(cam, 0, 0)).toBe(true);

    // DEFAULT_ZOOM (framed in): the same corner now falls outside → culled.
    cam.setZoom(DEFAULT_ZOOM);
    expect(inView(cam, 0, 0)).toBe(false);
  });
});

describe("stepFocusGlide", () => {
  it("(a) not focusChanged + tiny target move → locks to rawTarget, gliding=false", () => {
    const prev = { x: 100, y: 100 };
    const raw = { x: 100.1, y: 100.05 };
    const state = makeState(false, 0);
    const result = stepFocusGlide(prev, raw, false, 0.016, 2, state);
    expect(result.gliding).toBe(false);
    expect(result.center.x).toBe(raw.x);
    expect(result.center.y).toBe(raw.y);
  });

  it("(b) focusChanged with a far target → gliding=true, center between prev and target, converges", () => {
    const prev = { x: 0, y: 0 };
    const raw = { x: 200, y: 200 };
    const sx = 2; // world→screen scale

    // First frame with focusChanged: should start gliding.
    const state = makeState(false, 0);
    const r0 = stepFocusGlide(prev, raw, true, 0.016, sx, state);
    expect(r0.gliding).toBe(true);
    // Center should be between prev and raw.
    expect(r0.center.x).toBeGreaterThan(prev.x);
    expect(r0.center.x).toBeLessThan(raw.x);

    // Continue stepping until convergence.
    let cx = r0.center.x;
    let cy = r0.center.y;
    let gliding = r0.gliding;
    let elapsedSec = r0.elapsedSec;
    let steps = 0;
    while (gliding && steps < 500) {
      const s = makeState(gliding, elapsedSec);
      const res = stepFocusGlide({ x: cx, y: cy }, raw, false, 0.016, sx, s);
      cx = res.center.x;
      cy = res.center.y;
      gliding = res.gliding;
      elapsedSec = res.elapsedSec;
      steps += 1;
    }
    expect(gliding).toBe(false);
    // After convergence the center must be snapped to rawTarget.
    expect(cx).toBe(raw.x);
    expect(cy).toBe(raw.y);
  });

  it("(c) force-lock after 0.6s even if target keeps moving (elapsedSec cap)", () => {
    // Start gliding.
    const state = makeState(true, 0);
    const prev = { x: 0, y: 0 };
    // Simulate many frames; rawTarget shifts each frame (always far).
    let cx = 0;
    let cy = 0;
    let gliding = true;
    let elapsedSec = 0;
    let steps = 0;

    while (gliding && steps < 1000) {
      // Target keeps jumping ahead so screen-dist never drops below threshold.
      const raw = { x: cx + 300, y: cy + 300 };
      const s = makeState(gliding, elapsedSec);
      const res = stepFocusGlide({ x: cx, y: cy }, raw, false, 0.016, 1, s);
      cx = res.center.x;
      cy = res.center.y;
      gliding = res.gliding;
      elapsedSec = res.elapsedSec;
      steps += 1;
      void prev; // suppress unused-var lint
    }

    // Must have locked before 1000 steps (0.6 / 0.016 ≈ 38 frames).
    expect(steps).toBeLessThan(100);
    expect(gliding).toBe(false);
  });

  it("(d) pan-drag analog: repeated calls with focusChanged=false always lock 1:1", () => {
    const raw = { x: 55, y: 77 };
    for (let i = 0; i < 10; i += 1) {
      // Simulate the drag path: dtSec=0 is handled in applyFocusAndPan, but
      // stepFocusGlide itself with focusChanged=false and not-gliding → locks.
      const state = makeState(false, 0);
      const result = stepFocusGlide({ x: 10, y: 20 }, raw, false, 0.016, 2, state);
      expect(result.center.x).toBe(raw.x);
      expect(result.center.y).toBe(raw.y);
      expect(result.gliding).toBe(false);
    }
  });
});
