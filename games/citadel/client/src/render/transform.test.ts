import { describe, it, expect, afterEach } from "vitest";
import { Camera2D } from "@engine/core";
import { effectiveDpr } from "@engine/core/render";
import { makeIso } from "./iso";
import { eventToDevicePx, fitCameraToCanvas, screenToTile, transformOf } from "./transform";

// sweep-06 regression guard: the CSS-pixel click event, the DPR-scaled device-pixel
// canvas backing store, and the pointer→tile inverse all now derive their DPR from
// the SAME shared `effectiveDpr()` (engine/core/src/render/dpr.ts) instead of three
// independent `Math.min(devicePixelRatio, 2)` copies. This proves that refactor
// didn't change WHICH tile a click resolves to: the same CSS-space click must hit
// the same tile whether the display reports DPR 1 or a (clamped) DPR 2 — because
// `eventToDevicePx`'s CSS→device scale-up and `screenToTile`'s device→world scale-down
// (via `canvasW`/`canvasH`, sized by the same `effectiveDpr()`-driven backing store)
// must cancel out identically at every DPR.

function setDpr(value: number): void {
  Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });
}

afterEach(() => {
  setDpr(1);
});

describe("Citadel pointer mapping is DPR-invariant (sweep-06)", () => {
  it("maps a known screen point to the same tile at DPR 1 and a simulated DPR 2", () => {
    const iso = makeIso(16, 16);
    const cssWidth = 800;
    const cssHeight = 600;

    // clientX/clientY relative to a canvas whose top-left sits at the viewport
    // origin (rect.left = rect.top = 0), so `eventToDevicePx`'s subtraction is a
    // no-op and this isolates exactly the DPR scaling this refactor touched.
    const fakeCanvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }) } as unknown as HTMLCanvasElement;
    const clickEvent = { clientX: 480, clientY: 360 };

    function resolveTile(dpr: number): { tx: number; ty: number } {
      setDpr(dpr);
      const camera = new Camera2D({ worldUnitsX: 1, worldUnitsY: 1, centerX: 0, centerY: 0 });
      // Mirrors GlContext.resize: the canvas backing store is CSS size * effectiveDpr().
      // Calls the real helper rather than restating `Math.min(dpr, 2)` — a test that hardcodes
      // the cap would drift from production the moment MAX_DEVICE_PIXEL_RATIO is retuned, and
      // would be one more copy of the literal this spec exists to remove.
      const canvasW = Math.floor(cssWidth * effectiveDpr());
      const canvasH = Math.floor(cssHeight * effectiveDpr());
      fitCameraToCanvas(camera, canvasW, canvasH, iso);
      const transform = transformOf(camera, canvasW, canvasH);
      const { sx, sy } = eventToDevicePx(clickEvent, fakeCanvas);
      return screenToTile(iso, transform, sx, sy);
    }

    const tileAtDpr1 = resolveTile(1);
    const tileAtDpr2 = resolveTile(2);

    expect(tileAtDpr2).toEqual(tileAtDpr1);
  });

  it("stays DPR-invariant even above the MAX_DEVICE_PIXEL_RATIO clamp (DPR 3 behaves like DPR 2)", () => {
    const iso = makeIso(16, 16);
    const cssWidth = 800;
    const cssHeight = 600;
    const fakeCanvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }) } as unknown as HTMLCanvasElement;
    const clickEvent = { clientX: 200, clientY: 550 };

    function resolveTile(dpr: number): { tx: number; ty: number } {
      setDpr(dpr);
      const camera = new Camera2D({ worldUnitsX: 1, worldUnitsY: 1, centerX: 0, centerY: 0 });
      const canvasW = Math.floor(cssWidth * effectiveDpr());
      const canvasH = Math.floor(cssHeight * effectiveDpr());
      fitCameraToCanvas(camera, canvasW, canvasH, iso);
      const transform = transformOf(camera, canvasW, canvasH);
      const { sx, sy } = eventToDevicePx(clickEvent, fakeCanvas);
      return screenToTile(iso, transform, sx, sy);
    }

    expect(resolveTile(3)).toEqual(resolveTile(2));
  });
});
