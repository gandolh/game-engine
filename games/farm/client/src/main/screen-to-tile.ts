

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
