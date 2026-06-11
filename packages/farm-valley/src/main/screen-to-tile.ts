/**
 * Shared screen-to-world / screen-to-tile conversion helpers.
 * Used by tooltip, click-to-act, and cursor logic so they all agree on the
 * pointer's world position and which tile it is hovering.
 *
 * The math mirrors the Canvas2dRenderer: devicePixelRatio is capped at 2.
 */

import type { Camera2D } from "@engine/core";
import { TILE } from "./config";

/**
 * Convert a CSS-pixel pointer position (relative to the canvas top-left) to
 * world-pixel coordinates.
 *
 * @param camera  The current Camera2D instance.
 * @param canvas  The game canvas element.
 * @param clientX CSS-pixel X relative to the canvas (e.g. mousePos.x).
 * @param clientY CSS-pixel Y relative to the canvas.
 * @returns       World-pixel position `{ wx, wy }`.
 */
export function screenToWorld(
  camera: Camera2D,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { wx: number; wy: number } {
  // Cap dpr at 2 to match Canvas2dRenderer's backing-store resolution.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scaleX = (camera.worldUnitsX / canvas.clientWidth) * dpr;
  const scaleY = (camera.worldUnitsY / canvas.clientHeight) * dpr;
  const wx = clientX * scaleX + (camera.centerX - camera.worldUnitsX / 2);
  const wy = clientY * scaleY + (camera.centerY - camera.worldUnitsY / 2);
  return { wx, wy };
}

/**
 * Convert a CSS-pixel pointer position to the world tile coordinate under it.
 *
 * Tile N's sprite covers world pixels [N*TILE, (N+1)*TILE) (its center is drawn at
 * N*TILE + TILE/2), so the tile under a pixel is `Math.floor(wx / TILE)`. Using
 * Math.round here would bias the right/bottom half of every tile one cell over, so a
 * click on an object's visual square would register on its neighbour (the "hitbox" bug).
 *
 * @param camera  The current Camera2D instance.
 * @param canvas  The game canvas element.
 * @param clientX CSS-pixel X relative to the canvas.
 * @param clientY CSS-pixel Y relative to the canvas.
 * @returns       Integer tile coordinates `{ x, y }`.
 */
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
