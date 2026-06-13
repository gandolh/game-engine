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
  // 0xffffffff/0 are the renderer's no-tint / grounded defaults, so this never alters
  // appearance — it just stops a reused pool slot carrying a stale tint or height.
  dst.tintRgba = src.tintRgba ?? 0xffffffff;
  dst.z = src.z ?? 0;
  dst.interpolate = src.interpolate;
  dst.action = src.action;
  dst.moving = src.moving ?? false;
  dst.label = src.label;
  dst.description = src.description ?? null;
  dst.facing = src.facing ?? null;
  dst.flipX = src.flipX ?? false;
  dst.bubble = src.bubble ?? null;
  // exactOptionalPropertyTypes: carry the key only when present; clear a stale pool slot otherwise.
  if (src.healthFrac !== undefined) dst.healthFrac = src.healthFrac;
  else delete dst.healthFrac;
}
