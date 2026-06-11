import { describe, it, expect } from "vitest";
import { stepFocusGlide } from "./camera";

// Convenience: produce a mutable glide state object.
function makeState(gliding = false, elapsedSec = 0): { gliding: boolean; elapsedSec: number } {
  return { gliding, elapsedSec };
}

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
