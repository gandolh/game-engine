/**
 * Phase 1 building renderer.
 *
 * Draws placed buildings as solid EDG-palette colored rectangles overlaid
 * on the terrain. All colors are EDG.* references — no off-palette literals.
 */
import { EDG } from "@engine/core";
import { TILE_SIZE } from "@citadel/sim-core";
import type { BuildingSnapshot } from "@citadel/sim-core";
import type { Camera } from "./terrain-renderer";

/** EDG color per building type (extend for Phase 2 types). */
const BUILDING_COLORS: Record<string, string> = {
  house: EDG.clay,
};

const BUILDING_BORDER: Record<string, string> = {
  house: EDG.wood,
};

const FALLBACK_COLOR = EDG.steel;
const FALLBACK_BORDER = EDG.slate;

/**
 * Draw all placed buildings on top of the terrain.
 * Must be called after `drawTerrain` within the same animation frame,
 * while the camera transform is still set on `ctx`.
 *
 * @param ctx      2D context (transform already applied by drawTerrain)
 * @param buildings  Buildings from the latest RenderSnapshot
 * @param canvas   The main canvas (used to compute camera transform)
 * @param camera   Current camera state
 */
export function drawBuildings(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  buildings: readonly BuildingSnapshot[],
  camera: Camera,
): void {
  if (buildings.length === 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const ch = Math.max(1, Math.floor(canvas.clientHeight * dpr));

  // Recompute the same transform that drawTerrain uses
  // (WORLD_WIDTH * TILE_SIZE and WORLD_HEIGHT * TILE_SIZE → computed from imports)
  const WORLD_PX_W = 96 * TILE_SIZE;
  const WORLD_PX_H = 96 * TILE_SIZE;
  const baseSx = cw / WORLD_PX_W;
  const baseSy = ch / WORLD_PX_H;
  const baseS = Math.min(baseSx, baseSy);
  const s = baseS * camera.zoom;
  const originX = cw / 2 - camera.centerX * s;
  const originY = ch / 2 - camera.centerY * s;

  ctx.setTransform(s, 0, 0, s, originX, originY);

  for (const b of buildings) {
    const px = b.x * TILE_SIZE;
    const py = b.y * TILE_SIZE;
    const pw = b.w * TILE_SIZE;
    const ph = b.h * TILE_SIZE;

    ctx.fillStyle = BUILDING_COLORS[b.type] ?? FALLBACK_COLOR;
    ctx.fillRect(px, py, pw, ph);

    ctx.strokeStyle = BUILDING_BORDER[b.type] ?? FALLBACK_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  }
}

/**
 * Draw the placement ghost (follows cursor, tinted green=valid / red=invalid).
 *
 * @param ctx       2D context (raw — will set its own transform)
 * @param canvas    The main canvas
 * @param camera    Current camera
 * @param tileX     Ghost top-left tile column
 * @param tileY     Ghost top-left tile row
 * @param w         Ghost footprint width in tiles
 * @param h         Ghost footprint height in tiles
 * @param valid     Whether placement is valid at this position
 */
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  tileX: number,
  tileY: number,
  w: number,
  h: number,
  valid: boolean,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const ch = Math.max(1, Math.floor(canvas.clientHeight * dpr));

  const WORLD_PX_W = 96 * TILE_SIZE;
  const WORLD_PX_H = 96 * TILE_SIZE;
  const baseSx = cw / WORLD_PX_W;
  const baseSy = ch / WORLD_PX_H;
  const baseS = Math.min(baseSx, baseSy);
  const s = baseS * camera.zoom;
  const originX = cw / 2 - camera.centerX * s;
  const originY = ch / 2 - camera.centerY * s;

  ctx.setTransform(s, 0, 0, s, originX, originY);

  const px = tileX * TILE_SIZE;
  const py = tileY * TILE_SIZE;
  const pw = w * TILE_SIZE;
  const ph = h * TILE_SIZE;

  // Semi-transparent fill: green (valid) or red (invalid) — EDG palette only
  // We achieve translucency by drawing with globalAlpha, colors from EDG.*
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = valid ? EDG.green : EDG.red;
  ctx.fillRect(px, py, pw, ph);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = valid ? EDG.greenMid : EDG.crimson;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
  ctx.globalAlpha = prevAlpha;
}
