/**
 * Camera2D transform — screen ↔ world ↔ tile (pure, tested).
 *
 * Owns the CameraTransform snapshot type, the screen→world/tile inverses, the
 * dpr-aware event→device-px helper, and camera fitting / zoom clamping.
 *
 * Citadel renders ISOMETRIC: the engine's linear Camera2D pans/zooms the *iso
 * world-px* space (a diamond), so the world dims the camera frames are the iso
 * world dims, not the axis-aligned tile grid. `screenToWorld` therefore returns
 * iso world-px, and `screenToTile` inverts the iso projection (see iso.ts).
 *
 * Brief 110: the iso world extents depend on the world size, so they arrive as an
 * {@link IsoProjection} rather than the module constants `WORLD_PX_W`/`WORLD_PX_H`
 * this file used to export — those were derived from the compile-time 96×96 and
 * silently mis-framed the 256×256 MP world. Use `iso.worldPxW` / `iso.worldPxH`.
 */
import { Camera2D, MIN_ZOOM, MAX_ZOOM } from "@engine/core";
import type { IsoProjection } from "./iso";

// ---------------------------------------------------------------------------
// Camera transform snapshot
// ---------------------------------------------------------------------------

/**
 * The pieces of Camera2D + canvas needed to reproduce the WebGPU renderer's
 * world→screen transform exactly. The GPU renderer (see webgpu/renderer.ts
 * `endFrame`) computes, in DEVICE pixels:
 *   sx = canvasW / worldUnitsX
 *   left = centerX - worldUnitsX / 2
 *   screenPx = worldX * sx - left * sx
 * Inverting: worldX = screenPx / sx + left.
 */
export interface CameraTransform {
  centerX: number;
  centerY: number;
  worldUnitsX: number;
  worldUnitsY: number;
  /** Canvas backing-store width in device px (canvas.width). */
  canvasW: number;
  /** Canvas backing-store height in device px (canvas.height). */
  canvasH: number;
}

/** Snapshot the transform inputs from a live Camera2D + canvas. */
export function transformOf(camera: Camera2D, canvasW: number, canvasH: number): CameraTransform {
  return {
    centerX: camera.centerX,
    centerY: camera.centerY,
    worldUnitsX: camera.worldUnitsX,
    worldUnitsY: camera.worldUnitsY,
    canvasW,
    canvasH,
  };
}

/**
 * Convert a screen-space point (DEVICE px, i.e. already multiplied by dpr and
 * relative to the canvas top-left) to world px. Pure inverse of the GPU
 * renderer's world→screen transform.
 */
export function screenToWorld(t: CameraTransform, screenX: number, screenY: number): { worldX: number; worldY: number } {
  const sx = t.canvasW / t.worldUnitsX;
  const sy = t.canvasH / t.worldUnitsY;
  const left = t.centerX - t.worldUnitsX / 2;
  const top = t.centerY - t.worldUnitsY / 2;
  return {
    worldX: screenX / sx + left,
    worldY: screenY / sy + top,
  };
}

/**
 * Convert a screen-space point (device px) to integer tile coords. `screenToWorld`
 * yields ISO world-px (the space the camera frames); `isoToTile` inverts the
 * diamond projection to the tile under the cursor. This is the placement /
 * ghost / drag-paint / click-select pick path.
 */
export function screenToTile(iso: IsoProjection, t: CameraTransform, screenX: number, screenY: number): { tx: number; ty: number } {
  const { worldX, worldY } = screenToWorld(t, screenX, screenY);
  return iso.isoToTile(worldX, worldY);
}

/**
 * Resolve a mouse event to device-px coordinates relative to the canvas
 * top-left, using the same dpr clamp the GPU renderer uses for its backing
 * store (min(devicePixelRatio, 2)). Lives here so placement-state and the
 * renderer agree on the transform.
 */
export function eventToDevicePx(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): { sx: number; sy: number } {
  const dpr = Math.min((typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1), 2);
  const rect = canvas.getBoundingClientRect();
  return {
    sx: (e.clientX - rect.left) * dpr,
    sy: (e.clientY - rect.top) * dpr,
  };
}

// ---------------------------------------------------------------------------
// Camera fitting + zoom
// ---------------------------------------------------------------------------

export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/**
 * Keep the camera's visible world units matched to the canvas aspect ratio so
 * the (independent x/y) GPU scale doesn't stretch sprites, while fitting the
 * whole world at zoom=1. Re-derives the base world-units from the canvas and
 * applies the current zoom. Call each frame before draw (canvas may resize).
 */
export function fitCameraToCanvas(camera: Camera2D, canvasW: number, canvasH: number, iso: IsoProjection): void {
  if (canvasW <= 0 || canvasH <= 0) return;
  const canvasAspect = canvasW / canvasH;
  const worldAspect = iso.worldPxW / iso.worldPxH;
  // Base units cover the whole world (letterbox-fit), aspect-corrected.
  let baseX: number;
  let baseY: number;
  if (canvasAspect >= worldAspect) {
    baseY = iso.worldPxH;
    baseX = iso.worldPxH * canvasAspect;
  } else {
    baseX = iso.worldPxW;
    baseY = iso.worldPxW / canvasAspect;
  }
  const z = camera.zoom;
  camera.worldUnitsX = baseX / z;
  camera.worldUnitsY = baseY / z;
}
