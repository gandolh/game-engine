import type { Transform } from "@engine/core";

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
