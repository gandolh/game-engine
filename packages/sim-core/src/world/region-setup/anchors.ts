/**
 * anchors.ts — Shared forced-core tile set for a region.
 *
 * This module is the SINGLE SOURCE OF TRUTH for which tiles must be land within
 * a region. It is consumed in two places:
 *   1. organic-mask.ts: to PIN core tiles so CA+floodfill always retains them.
 *   2. setup.ts / placement.ts: to spawn entities on guaranteed land tiles.
 *
 * Keeping both sides in sync via forcedCoreTiles() ensures the mask never
 * carves out a tile that an entity will later be placed on.
 *
 * All derivations are pure (region.bounds / region.center only, no mask).
 */

import type { RegionDef } from "../regions";

/** The two offsets applied to center.x / center.y to derive farm plot positions. */
export const PLOT_OFFSETS = [-2, 1] as const;

/**
 * Returns all tile positions that MUST be land for the given region.
 * These tiles are pinned by the organic mask generator and are used
 * as reference positions for entity spawning.
 */
export function forcedCoreTiles(
  region: RegionDef,
): { x: number; y: number }[] {
  const { bounds, center } = region;
  const tiles: { x: number; y: number }[] = [];

  // Every region: center is a baseline core tile.
  tiles.push({ x: center.x, y: center.y });

  if (region.kind === "farm") {
    // 4 plot tiles (all combinations of PLOT_OFFSETS).
    for (const dy of PLOT_OFFSETS) {
      for (const dx of PLOT_OFFSETS) {
        tiles.push({ x: center.x + dx, y: center.y + dy });
      }
    }

    // Fountain tile: bounds.minX+1, bounds.minY+1 (matches placement.ts fountainTile).
    tiles.push({ x: bounds.minX + 1, y: bounds.minY + 1 });

    // Home tile: bounds.maxX-1, bounds.maxY-1 (matches setup.ts hx/hy).
    tiles.push({ x: bounds.maxX - 1, y: bounds.maxY - 1 });

    // Farmer spawn: center (already added above) AND player-spawn offset.
    // Player spawn uses center + PLOT_OFFSETS[0] in both axes.
    tiles.push({ x: center.x + PLOT_OFFSETS[0], y: center.y + PLOT_OFFSETS[0] });

    // Cottage base tile (geometry.ts BIG_STRUCTURES: maxX-2, maxY-1).
    tiles.push({ x: bounds.maxX - 2, y: bounds.maxY - 1 });
  }

  // Coral-reef dock anchor (brief 93): coral.ts hangs the reef off the south
  // edge at x = min(maxX, minX+3). Pin that edge tile so the carve never removes
  // the boarding tile. Port docks pick the island's most-open side at runtime
  // (always a bounds-edge tile, kept land away from carved corners), so they do
  // not need a pin here.
  if (region.id === "fishing-isle" || region.id === "fishing-isle-2") {
    tiles.push({ x: Math.min(bounds.maxX, bounds.minX + 3), y: bounds.maxY });
  }

  // Deduplicate (same tile may appear multiple times for small regions).
  const seen = new Set<string>();
  const unique: { x: number; y: number }[] = [];
  for (const t of tiles) {
    const key = `${t.x},${t.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(t);
    }
  }
  return unique;
}
