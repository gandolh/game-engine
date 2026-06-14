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

  // Dock anchor tiles — functional boarding tiles that ports.ts (sidePort/
  // northPort) and coral.ts (reefOffIsle) derive from this region's bounds.
  // They MUST stay land or boats dock on ocean. Formulas mirror those modules
  // exactly (pure bounds math — no circularity with the mask).
  const midY = Math.floor((bounds.minY + bounds.maxY) / 2);
  if (region.id === "fishing-isle") {
    tiles.push({ x: bounds.minX, y: midY }); // port (W side)
    tiles.push({ x: bounds.minX + 3, y: bounds.maxY }); // coral reef dock
  } else if (region.id === "fishing-isle-2") {
    tiles.push({ x: bounds.maxX, y: midY }); // port (E side)
    tiles.push({ x: bounds.minX + 3, y: bounds.maxY }); // coral reef dock
  } else if (region.id === "casino") {
    tiles.push({ x: 110, y: bounds.minY }); // north port dock column
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
