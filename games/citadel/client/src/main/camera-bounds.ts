import type { IsoProjection } from "../render/iso";

/**
 * Keep a camera centre (iso world-px) on the map. The map is a diamond in screen space, so the
 * centre is turned into continuous tile coordinates, clamped to `0..worldTiles` and turned back.
 * A centre already on the map comes back unchanged. Pure.
 */
export function clampCenterToMap(iso: IsoProjection, x: number, y: number): { x: number; y: number } {
  const { tileX, tileY } = iso.isoToTileContinuous(x, y);
  const cx = Math.max(0, Math.min(iso.worldTilesW, tileX));
  const cy = Math.max(0, Math.min(iso.worldTilesH, tileY));
  if (cx === tileX && cy === tileY) return { x, y };
  return iso.tileToIso(cx, cy);
}
