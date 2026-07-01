

import type { Camera2D } from "@engine/core";
import { TILE } from "./config";

export function screenToWorld(
  camera: Camera2D,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { wx: number; wy: number } {

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scaleX = (camera.worldUnitsX / canvas.clientWidth) * dpr;
  const scaleY = (camera.worldUnitsY / canvas.clientHeight) * dpr;
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
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scaleX = (camera.worldUnitsX / canvas.clientWidth) * dpr;
  const scaleY = (camera.worldUnitsY / canvas.clientHeight) * dpr;
  const x = (wx - (camera.centerX - camera.worldUnitsX / 2)) / scaleX;
  const y = (wy - (camera.centerY - camera.worldUnitsY / 2)) / scaleY;
  return { x, y };
}
