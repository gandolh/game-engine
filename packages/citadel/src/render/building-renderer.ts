/**
 * Phase 1 building renderer.
 *
 * Draws placed buildings as solid EDG-palette colored rectangles overlaid
 * on the terrain. All colors are EDG.* references — no off-palette literals.
 */
import { EDG } from "@engine/core";
import { TILE_SIZE } from "@citadel/sim-core";
import type { BuildingSnapshot, VillagerSnapshot, RaiderSnapshot } from "@citadel/sim-core";
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
  // Phase 3 service buildings
  chapel: EDG.white,
  market: EDG.gold,
  watchpost: EDG.silver,
  tradingpost: EDG.mauve,
  // Phase 4 refining + siege
  quarry: EDG.slate,
  sawmill: EDG.greenDark,
  smith: EDG.crimson,
  mine: EDG.ink,
  wall: EDG.steel,
  gate: EDG.gold,
  tower: EDG.navy,
  garrison: EDG.blue,
  keep: EDG.plum,
  // Phase 4.5 hazard mitigation
  well: EDG.skyBlue,
  healer: EDG.green,
};

const BUILDING_BORDER: Record<string, string> = {
  house: EDG.wood,
  farm: EDG.greenDark,
  mill: EDG.tan,
  bakery: EDG.woodDark,
  woodcutter: EDG.bark,
  storehouse: EDG.slate,
  road: EDG.ink,
  // Phase 4
  quarry: EDG.ink,
  sawmill: EDG.teal,
  smith: EDG.woodDark,
  mine: EDG.black,
  wall: EDG.slate,
  gate: EDG.orange,
  tower: EDG.ink,
  garrison: EDG.navy,
  keep: EDG.bark,
  // Phase 4.5 hazard mitigation
  well: EDG.cyan,
  healer: EDG.teal,
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

/** Compute the shared camera→pixel transform and apply it to ctx. */
function applyCameraTransform(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, camera: Camera): void {
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
}

/**
 * Draw all placed buildings on top of the terrain.
 * Must be called after `drawTerrain` within the same animation frame,
 * while the camera transform is still set on `ctx`.
 *
 * Phase 4.5: burning buildings get an orange tint overlay.
 */
export function drawBuildings(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  buildings: readonly BuildingSnapshot[],
  camera: Camera,
  outbreakActive = false,
): void {
  if (buildings.length === 0) return;

  applyCameraTransform(ctx, canvas, camera);

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

    if (b.type === "wall") {
      // Solid stone block, full tile, slate border.
      ctx.fillStyle = BUILDING_COLORS.wall ?? FALLBACK_COLOR;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = BUILDING_BORDER.wall ?? FALLBACK_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      continue;
    }

    if (b.type === "gate") {
      // Gold opening flanked by darker posts to read as "passable".
      ctx.fillStyle = BUILDING_COLORS.gate ?? FALLBACK_COLOR;
      const inset = TILE_SIZE * 0.15;
      ctx.fillRect(px + inset, py + inset, pw - inset * 2, ph - inset * 2);
      ctx.strokeStyle = BUILDING_BORDER.gate ?? FALLBACK_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      continue;
    }

    // Phase 4.5: burning buildings override fill color with orange.
    const baseColor = b.burning ? EDG.orange : (BUILDING_COLORS[b.type] ?? FALLBACK_COLOR);
    ctx.fillStyle = baseColor;
    ctx.fillRect(px, py, pw, ph);

    // Phase 4.5: disease tint — mauve semi-transparent overlay on non-burning buildings
    // when an outbreak is active (only for buildings that can house people).
    if (outbreakActive && !b.burning) {
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = EDG.mauve;
      ctx.fillRect(px, py, pw, ph);
      ctx.globalAlpha = prevAlpha;
    }

    // Burning buildings get an orange border; disconnected get red; else normal.
    if (b.burning) {
      ctx.strokeStyle = EDG.red;
      ctx.lineWidth = 2;
    } else if (!b.connected) {
      ctx.strokeStyle = DISCONNECTED_BORDER;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = BUILDING_BORDER[b.type] ?? FALLBACK_BORDER;
      ctx.lineWidth = 1;
    }
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

  applyCameraTransform(ctx, canvas, camera);

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
 * Phase 4: draw raider groups as red dots scaled by strength.
 * Sets its own camera transform (call after drawVillagers).
 */
export function drawRaiders(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  raiders: readonly RaiderSnapshot[],
  camera: Camera,
): void {
  if (raiders.length === 0) return;

  applyCameraTransform(ctx, canvas, camera);

  for (const r of raiders) {
    const px = r.x * TILE_SIZE + TILE_SIZE / 2;
    const py = r.y * TILE_SIZE + TILE_SIZE / 2;
    // Radius grows with strength (10 → small, 40 → ~1 tile).
    const radius = TILE_SIZE * (0.4 + Math.min(0.6, r.strength / 60));
    ctx.fillStyle = EDG.red;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = EDG.crimson;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Strength label.
    ctx.fillStyle = EDG.white;
    ctx.font = `${TILE_SIZE * 0.8}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(r.strength), px, py);
  }
}

/**
 * Draw the placement ghost (follows cursor, tinted green=valid / red=invalid).
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
  applyCameraTransform(ctx, canvas, camera);

  const px = tileX * TILE_SIZE;
  const py = tileY * TILE_SIZE;
  const pw = w * TILE_SIZE;
  const ph = h * TILE_SIZE;

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
