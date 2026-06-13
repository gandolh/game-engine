import { EDG } from "@engine/core/render";
import {
  CAMPFIRE_TILE,
  getRegion,
  CASINO_REGION_ID,
  RING_REGION_ID,
  REGIONS,
  type RegionId,
} from "../world/regions";
import { FORGE_OVEN_TILE } from "./frames";

/**
 * A static warm light emitter. Render-only, deterministic: position is a fixed tile (forge,
 * campfire, casino, ring, lit farmhouse windows), color is an EDG32 anchor, and the per-frame
 * brightness is scaled by the in-game-clock nightness (never wall-clock). The renderer draws an
 * additive radial glow at the tile so the spot punches warm light back through the night wash.
 */
export interface LightEmitter {
  /** Tile-center anchor (world tiles). */
  tx: number;
  ty: number;
  /** Glow radius in tiles. */
  radiusTiles: number;
  /** EDG32 hex anchor color, e.g. EDG.gold. */
  color: string;
  /** Peak glow strength at deep night, [0,1]. Scaled down by nightness each frame. */
  intensity: number;
}

const TILE = 16;

/** Bottom-anchored SE corner of each farm cottage (matches BIG_STRUCTURES placement): one lit window. */
function farmhouseWindows(): LightEmitter[] {
  return REGIONS.filter((r) => r.kind === "farm").map((r) => ({
    // Cottage is bottom-anchored at (maxX-2, maxY-1), 2 tiles wide; window sits center-upper.
    tx: r.bounds.maxX - 1,
    ty: r.bounds.maxY - 2,
    radiusTiles: 2.2,
    color: EDG.gold,
    intensity: 0.5,
  }));
}

function centerOf(id: RegionId): { x: number; y: number } {
  return getRegion(id).center;
}

/**
 * The static emitter table, resolved once from region/anchor geometry. Pure (no RNG, no clock):
 * positions ride the grown world via the already-scaled anchors (CAMPFIRE_TILE / region centers).
 */
export const LIGHT_EMITTERS: readonly LightEmitter[] = (() => {
  const casino = centerOf(CASINO_REGION_ID);
  const ring = centerOf(RING_REGION_ID);
  return [
    // Forge — the hot blue-white edge of an ember bed reads warmest; gold core.
    { tx: FORGE_OVEN_TILE.x, ty: FORGE_OVEN_TILE.y, radiusTiles: 3.0, color: EDG.orange, intensity: 0.78 },
    // Campfire — classic warm point light.
    { tx: CAMPFIRE_TILE.x, ty: CAMPFIRE_TILE.y, radiusTiles: 3.2, color: EDG.gold, intensity: 0.72 },
    // Casino neon — cool cyan + a mauve fleck for variety.
    { tx: casino.x, ty: casino.y, radiusTiles: 4.0, color: EDG.cyan, intensity: 0.6 },
    { tx: casino.x + 2, ty: casino.y + 1, radiusTiles: 2.6, color: EDG.mauve, intensity: 0.5 },
    // Ring — lit arena, warm gold.
    { tx: ring.x, ty: ring.y, radiusTiles: 3.4, color: EDG.yellow, intensity: 0.58 },
    // Lit farmhouse windows — one per farm.
    ...farmhouseWindows(),
  ];
})();

/** World-pixel center for an emitter (helper for the renderer). */
export function emitterPx(e: LightEmitter): { x: number; y: number; radiusPx: number } {
  return {
    x: e.tx * TILE + TILE / 2,
    y: e.ty * TILE + TILE / 2,
    radiusPx: e.radiusTiles * TILE,
  };
}
