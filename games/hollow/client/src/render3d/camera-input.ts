/**
 * Free orbit/pan/zoom "god-cam" pointer wiring (chunk hollow-09a) — extracted
 * from `render3d-demo.ts`'s inline event handlers so `app.ts` doesn't repeat
 * them. Drag = orbit, shift-drag or right-drag = pan, wheel = zoom. Pure DOM
 * plumbing over the engine's `OrbitCamera` (camera3d.ts) — no sim coupling,
 * nothing here is unit-testable beyond what `OrbitCamera` itself already
 * covers, so this module intentionally has no colocated test file.
 */
import type { OrbitCamera } from "@engine/core/render3d";

export interface CameraInputHandle {
  /** Removes every listener this call added — call on teardown/hot-reload. */
  dispose(): void;
}

export function wireOrbitCameraInput(canvas: HTMLCanvasElement, camera: OrbitCamera): CameraInputHandle {
  let dragButton: number | null = null;
  let lastX = 0;
  let lastY = 0;

  const onContextMenu = (e: MouseEvent): void => e.preventDefault();

  const onPointerDown = (e: PointerEvent): void => {
    dragButton = e.button;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (dragButton === null) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    const isPan = dragButton === 2 || e.shiftKey;
    if (isPan) {
      const panScale = camera.distance * 0.0015;
      camera.pan(-dx * panScale, dy * panScale);
    } else {
      camera.orbit(-dx * 0.005, dy * 0.005);
    }
  };

  const onPointerUp = (e: PointerEvent): void => {
    dragButton = null;
    canvas.releasePointerCapture(e.pointerId);
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
