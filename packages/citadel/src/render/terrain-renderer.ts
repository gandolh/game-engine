/**
 * Phase 0 terrain renderer.
 *
 * Draws the 96×96 terrain grid as colored rectangles directly onto a Canvas2D
 * context. Colors use EDG palette constants only — no off-palette literals.
 *
 * Layout: each tile is TILE_SIZE px; camera pans and zooms the viewport.
 */
import { EDG } from "@engine/core";
import { TerrainType, TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT } from "@citadel/sim-core";
import type { TerrainGrid } from "@citadel/sim-core";

// EDG palette colors by terrain type — must all be EDG.* references
const TERRAIN_COLORS: Record<number, string> = {
  [TerrainType.Grass]: EDG.greenMid,
  [TerrainType.Water]: EDG.skyBlue,
  [TerrainType.Forest]: EDG.greenDark,
  [TerrainType.Stone]: EDG.slate,
  [TerrainType.Rough]: EDG.wood,
};

export interface Camera {
  /** World-space X of the viewport center */
  centerX: number;
  /** World-space Y of the viewport center */
  centerY: number;
  /** Zoom multiplier (0.5–6) */
  zoom: number;
}

export function clampZoom(z: number): number {
  return Math.max(0.5, Math.min(6, z));
}

/**
 * Bake the terrain into an OffscreenCanvas so we don't re-draw every tile
 * every frame. Call once after terrain is generated; reuse the result each frame.
 */
export function bakeTerrainLayer(grid: TerrainGrid): OffscreenCanvas {
  const w = WORLD_WIDTH * TILE_SIZE;
  const h = WORLD_HEIGHT * TILE_SIZE;
  const surface = new OffscreenCanvas(w, h);
  const ctx = surface.getContext("2d");
  if (!ctx) throw new Error("bakeTerrainLayer: failed to acquire 2d context");

  for (let ty = 0; ty < grid.height; ty++) {
    for (let tx = 0; tx < grid.width; tx++) {
      const t = grid.cells[ty * grid.width + tx] as TerrainType;
      ctx.fillStyle = TERRAIN_COLORS[t] ?? EDG.green;
      ctx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  return surface;
}

/**
 * Draw a pre-baked terrain layer to the main canvas, applying camera transform.
 * Call every animation frame.
 */
export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  bakedTerrain: OffscreenCanvas,
  camera: Camera,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const ch = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }

  // Clear background
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = EDG.black;
  ctx.fillRect(0, 0, cw, ch);

  // World dimensions in pixels
  const worldPxW = WORLD_WIDTH * TILE_SIZE;
  const worldPxH = WORLD_HEIGHT * TILE_SIZE;

  // Scale: how many screen pixels per world pixel, accounting for zoom
  const baseSx = cw / worldPxW;
  const baseSy = ch / worldPxH;
  const baseS = Math.min(baseSx, baseSy); // fit the world in the viewport
  const s = baseS * camera.zoom;

  // World origin on screen
  const originX = cw / 2 - camera.centerX * s;
  const originY = ch / 2 - camera.centerY * s;

  ctx.setTransform(s, 0, 0, s, originX, originY);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bakedTerrain, 0, 0);
}
