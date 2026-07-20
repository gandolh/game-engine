/**
 * Free orbit/pan/zoom "god-cam" pointer wiring (chunk hollow-09a) — extracted
 * from `render3d-demo.ts`'s inline event handlers so `app.ts` doesn't repeat
 * them. Drag = orbit, shift-drag or right-drag = pan, wheel = zoom. Pure DOM
 * plumbing over the engine's `OrbitCamera` (camera3d.ts) — no sim coupling,
 * nothing here is unit-testable beyond what `OrbitCamera` itself already
 * covers, so this module intentionally has no colocated test file.
 *
 * Chunk hollow-09c additions: `onClick` (click-to-inspect's ray-pick trigger)
 * and `onPan` (cancels follow-cam — see `app.ts`'s `setFollow` doc). Both
 * are natural extensions of the pointer bookkeeping this module already
 * does, not new concerns — `onClick` reuses `render3d-demo.ts`'s own
 * drag-distance-below-threshold "was this a click, not a drag" heuristic.
 */
import type { OrbitCamera } from "@engine/core/render3d";

export interface CameraInputCallbacks {
  /** Fired on pointerup when the drag distance stayed below the
   *  click-vs-drag threshold — `sx`/`sy` are canvas-local CSS pixel
   *  coordinates (relative to `canvas.getBoundingClientRect()`), the same
   *  space `rayFromScreen` expects when paired with the CSS-pixel rect
   *  width/height. */
  onClick?(sx: number, sy: number): void;
  /** Fired whenever a pan (shift-drag or right-drag) actually moves the
   *  camera target — the signal `app.ts` uses to cancel an active
   *  follow-cam (a manual pan means the player wants to look somewhere
   *  else, per the brief). Not fired for orbit/zoom (those stay usable
   *  while following). */
  onPan?(): void;
}

export interface CameraInputHandle {
  /** Removes every listener this call added — call on teardown/hot-reload. */
  dispose(): void;
}

/** Pixel drag distance below which a pointerdown->pointerup is treated as a
 *  click rather than a drag — same threshold `render3d-demo.ts` uses. */
const CLICK_DRAG_THRESHOLD = 4;

export function wireOrbitCameraInput(
  canvas: HTMLCanvasElement,
  camera: OrbitCamera,
  callbacks: CameraInputCallbacks = {},
): CameraInputHandle {
  let dragButton: number | null = null;
  let lastX = 0;
  let lastY = 0;
  let dragDistance = 0;

  const onContextMenu = (e: MouseEvent): void => e.preventDefault();

  const onPointerDown = (e: PointerEvent): void => {
    dragButton = e.button;
    lastX = e.clientX;
    lastY = e.clientY;
    dragDistance = 0;
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (dragButton === null) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    dragDistance += Math.abs(dx) + Math.abs(dy);

    const isPan = dragButton === 2 || e.shiftKey;
    if (isPan) {
      const panScale = camera.distance * 0.0015;
      camera.pan(-dx * panScale, dy * panScale);
      callbacks.onPan?.();
    } else {
      camera.orbit(-dx * 0.005, dy * 0.005);
    }
  };

  const onPointerUp = (e: PointerEvent): void => {
    const wasClick = dragButton !== null && dragDistance < CLICK_DRAG_THRESHOLD;
    dragButton = null;
    canvas.releasePointerCapture(e.pointerId);
    if (wasClick && callbacks.onClick) {
      const rect = canvas.getBoundingClientRect();
      callbacks.onClick(e.clientX - rect.left, e.clientY - rect.top);
    }
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    camera.zoom(Math.exp(e.deltaY * 0.001));
  };

  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    dispose(): void {
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    },
  };
}
