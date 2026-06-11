import type { Transform } from "@engine/core";

/**
 * Tile-targeted actions require Chebyshev distance ≤ 1 (target tile or any of its 8 neighbours).
 * Transforms hold integer tile coordinates; round defensively for any sub-tile value.
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
