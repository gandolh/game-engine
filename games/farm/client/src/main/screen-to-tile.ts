

import type { Camera2D } from "@engine/core";
import { TILE } from "./config";

// World↔screen scale in CSS-logical px per world unit. The renderer draws the world into a
// backing store of `clientWidth * dpr` device px (`sx = canvas.width / worldUnitsX`), and the
// browser scales that backing DOWN by the same dpr to the element's CSS size — so a world point's
// CSS position is `(w − left) / (worldUnitsX / clientWidth)`, with the dpr cancelling out entirely.
// (An earlier `* dpr` here was a latent bug: harmless at dpr = 1, but on a hi-DPI display it pushed
// every world-anchored panel toward the top-left by a factor of 1/dpr — the "inspect card not
// centred on the farmer" report. Mouse events, the UISurface, and computeLayout are all CSS px too,
// so this matches them.)
function worldPerCssX(camera: Camera2D, canvas: HTMLCanvasElement): number {
  return camera.worldUnitsX / canvas.clientWidth;
}
function worldPerCssY(camera: Camera2D, canvas: HTMLCanvasElement): number {
  return camera.worldUnitsY / canvas.clientHeight;
}

export function screenToWorld(
  camera: Camera2D,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { wx: number; wy: number } {
  const scaleX = worldPerCssX(camera, canvas);
  const scaleY = worldPerCssY(camera, canvas);
  const wx = clientX * scaleX + (camera.centerX - camera.worldUnitsX / 2);
  const wy = clientY * scaleY + (camera.centerY - camera.worldUnitsY / 2);
  return { wx, wy };
}

export function screenToTile(
  camera: Camera2D,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const { wx, wy } = screenToWorld(camera, canvas, clientX, clientY);
  return {
    x: Math.floor(wx / TILE),
    y: Math.floor(wy / TILE),
  };
}

/**
 * Inverse of {@link screenToWorld}: a world point → canvas-relative CSS-logical px (top-left origin,
 * the coordinate space `@engine/ui`'s UISurface + `computeLayout` use). This is the anchor for
 * world-anchored UI panels — they compute their screen slot from a tracked entity's world position
 * each frame so they follow it as the camera pans/zooms. Derived by inverting `screenToWorld`
 * exactly, so anchoring matches the input hit-mapping.
 */
export function worldToCanvasCss(
  camera: Camera2D,
  canvas: HTMLCanvasElement,
  wx: number,
  wy: number,
): { x: number; y: number } {
  const scaleX = worldPerCssX(camera, canvas);
  const scaleY = worldPerCssY(camera, canvas);
  const x = (wx - (camera.centerX - camera.worldUnitsX / 2)) / scaleX;
  const y = (wy - (camera.centerY - camera.worldUnitsY / 2)) / scaleY;
  return { x, y };
}
