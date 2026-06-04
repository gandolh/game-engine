import type { Transform } from "@engine/core";

/**
 * brief (proximity) — a farmer may only perform a tile-targeted action (till,
 * water, refill-can, chop-tree, mine-stone, plant) when standing on the target
 * tile or one of its 8 neighbours. "1 cell distance" = Chebyshev distance ≤ 1.
 *
 * Farmer transforms hold integer TILE coordinates (TravelSystem advances them
 * waypoint-by-waypoint), but we round defensively in case of any sub-tile value.
 */
export function isWithinReach(
  transform: Transform | undefined,
  tileX: number,
  tileY: number,
): boolean {
  if (!transform) return false;
  const fx = Math.round(transform.x);
  const fy = Math.round(transform.y);
  return Math.max(Math.abs(fx - tileX), Math.abs(fy - tileY)) <= 1;
}
