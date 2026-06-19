/**
 * Phase 1 building renderer.
 *
 * Draws placed buildings as solid EDG-palette colored rectangles overlaid
 * on the terrain. All colors are EDG.* references — no off-palette literals.
 */
import { EDG } from "@engine/core";
import { TILE_SIZE } from "@citadel/sim-core";
import type { BuildingSnapshot, VillagerSnapshot } from "@citadel/sim-core";
import type { Camera } from "./terrain-renderer";

/** EDG color per building type. */
const BUILDING_COLORS: Record<string, string> = {
  house: EDG.clay,
  farm: EDG.greenMid,
  mill: EDG.cream,
  bakery: EDG.tan,
  woodcutter: EDG.wood,
  storehouse: EDG.steel,
  road: EDG.navy,
};

const BUILDING_BORDER: Record<string, string> = {
  house: EDG.wood,
  farm: EDG.greenDark,
  mill: EDG.tan,
  bakery: EDG.woodDark,
  woodcutter: EDG.bark,
  storehouse: EDG.slate,
  road: EDG.ink,
};

/** EDG color per villager FSM state. */
const VILLAGER_COLORS: Record<string, string> = {
  idle: EDG.silver,
  walkToWork: EDG.yellow,
  work: EDG.orange,
  haulToStore: EDG.cyan,
  walkHome: EDG.salmon,
};

const FALLBACK_COLOR = EDG.steel;
const FALLBACK_BORDER = EDG.slate;
const DISCONNECTED_BORDER = EDG.red;

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

    if (b.type === "road") {
      // Draw roads as a thin centered band.
      ctx.fillStyle = BUILDING_COLORS.road ?? FALLBACK_COLOR;
      const inset = TILE_SIZE * 0.25;
      ctx.fillRect(px + inset, py + inset, pw - inset * 2, ph - inset * 2);
      continue;
    }

    ctx.fillStyle = BUILDING_COLORS[b.type] ?? FALLBACK_COLOR;
    ctx.fillRect(px, py, pw, ph);

    // Disconnected buildings get a red border to flag they are not on the network.
    ctx.strokeStyle = b.connected
      ? BUILDING_BORDER[b.type] ?? FALLBACK_BORDER
      : DISCONNECTED_BORDER;
    ctx.lineWidth = b.connected ? 1 : 2;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  }
}

/**
 * Draw all villagers as small dots, colored by FSM state.
 * Sets its own camera transform (call after drawBuildings).
 */
export function drawVillagers(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  villagers: readonly VillagerSnapshot[],
  camera: Camera,
): void {
  if (villagers.length === 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const ch = Math.max(1, Math.floor(canvas.clientHeight * dpr));

  const WORLD_PX_W = 96 * TILE_SIZE;
  const WORLD_PX_H = 96 * TILE_SIZE;
  const baseS = Math.min(cw / WORLD_PX_W, ch / WORLD_PX_H);
  const s = baseS * camera.zoom;
  const originX = cw / 2 - camera.centerX * s;
  const originY = ch / 2 - camera.centerY * s;

  ctx.setTransform(s, 0, 0, s, originX, originY);

  const radius = TILE_SIZE * 0.35;
  for (const v of villagers) {
    const px = v.x * TILE_SIZE + TILE_SIZE / 2;
    const py = v.y * TILE_SIZE + TILE_SIZE / 2;
    ctx.fillStyle = VILLAGER_COLORS[v.fsm] ?? EDG.white;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = EDG.black;
    ctx.lineWidth = 0.5;
    ctx.stroke();
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
