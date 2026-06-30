/**
 * Building selection for the Citadel inspect panel (Chunk 2).
 *
 * Buildings have NO stable id in the snapshot, so we key a selection by its footprint ORIGIN
 * (top-left tile x,y) and re-find the live snapshot each frame. Origin is stable for a placed
 * building's lifetime (footprints don't move); a demolish/replace at the same origin is a rare
 * edge the host handles by closing on a miss (`findSelected` returns null).
 *
 * Pure + deterministic: no DOM, no time, no RNG.
 */
import type { BuildingSnapshot } from "@citadel/sim-core";

/** A selection key: the footprint origin of the selected building. */
export interface BuildingSelection {
  readonly x: number;
  readonly y: number;
}

/**
 * The building whose footprint CONTAINS tile (tx,ty), or `null` if the tile is empty ground.
 * If footprints overlap (they shouldn't, but bridges/roads can co-locate), the first match in
 * snapshot order wins — deterministic given a stable snapshot order.
 */
export function buildingAtTile(
  buildings: readonly BuildingSnapshot[],
  tx: number,
  ty: number,
): BuildingSnapshot | null {
  for (const b of buildings) {
    if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return b;
  }
  return null;
}

/**
 * Re-find the live snapshot for a selection by its footprint origin, or `null` if no building
 * now has that origin (it was demolished / replaced). The host calls this each frame to bind
 * the panel to fresh data and to auto-close a vanished selection.
 */
export function findSelected(
  buildings: readonly BuildingSnapshot[],
  selection: BuildingSelection,
): BuildingSnapshot | null {
  for (const b of buildings) {
    if (b.x === selection.x && b.y === selection.y) return b;
  }
  return null;
}
