import { fitCameraToCanvas } from "../render/citadel-renderer";
import { camera, iso } from "./renderer-state";
import { canvas } from "./dom";

/**
 * Project an iso TILE point (fractional tile coords) to a CSS-px point relative
 * to the viewport, using the live camera + canvas transform. Mirrors the
 * renderer's world→screen mapping. Used only by the dev-hook test harness
 * (`__citadel.tileToScreenCss`, boot.ts); in-canvas world-anchoring (occupancy chips)
 * uses `tileToCanvasCss` (canvas-relative). Render-only.
 */
export function tileToScreenCss(tileX: number, tileY: number): { x: number; y: number } {
  const c = iso.tileToIso(tileX, tileY);
  fitCameraToCanvas(camera, canvas.width, canvas.height, iso);
  const sx = canvas.width / camera.worldUnitsX;
  const sy = canvas.height / camera.worldUnitsY;
  const left = camera.centerX - camera.worldUnitsX / 2;
  const top = camera.centerY - camera.worldUnitsY / 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + ((c.x - left) * sx) / dpr, y: rect.top + ((c.y - top) * sy) / dpr };
}

/**
 * Project an iso TILE point to CANVAS-relative CSS-logical px (top-left origin) — the same
 * coordinate space the in-canvas @engine/ui surface draws in. Identical to
 * {@link tileToScreenCss} but WITHOUT the viewport offset (`rect.left/top`), since the UI
 * surface is canvas-relative, not viewport-relative. Used to anchor the in-canvas occupancy
 * chips over their buildings (render-loop.ts). Render-only.
 */
export function tileToCanvasCss(tileX: number, tileY: number): { x: number; y: number } {
  const c = iso.tileToIso(tileX, tileY);
  fitCameraToCanvas(camera, canvas.width, canvas.height, iso);
  const sx = canvas.width / camera.worldUnitsX;
  const sy = canvas.height / camera.worldUnitsY;
  const left = camera.centerX - camera.worldUnitsX / 2;
  const top = camera.centerY - camera.worldUnitsY / 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return { x: ((c.x - left) * sx) / dpr, y: ((c.y - top) * sy) / dpr };
}
