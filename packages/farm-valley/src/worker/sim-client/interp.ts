import type { SnapshotSprite } from "@farm/sim-core/snapshot";

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Smoothstep easing (3t² − 2t³): zero slope at t=0 and t=1, so a farmer eases
 * out of a tile and eases into the next instead of snapping between constant-
 * velocity segments. Render-only — the sim still steps one tile per STEP_TICKS.
 */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Copy all SnapshotSprite fields (including optionals) so a reused pool slot never carries stale data. */
export function copySprite(dst: SnapshotSprite, src: SnapshotSprite): void {
  dst.id = src.id;
  dst.x = src.x;
  dst.y = src.y;
  dst.rotation = src.rotation;
  dst.layer = src.layer;
  dst.frame = src.frame;
  dst.alpha = src.alpha;
  dst.interpolate = src.interpolate;
  dst.action = src.action;
  dst.label = src.label;
  dst.description = src.description ?? null;
  dst.facing = src.facing ?? null;
  dst.flipX = src.flipX ?? false;
  dst.bubble = src.bubble ?? null;
}
