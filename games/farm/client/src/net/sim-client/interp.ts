import type { SnapshotSprite } from "@farm/sim-core/snapshot";

// audit-18: the alpha-clamp and numeric lerp that used to live here are now
// `@engine/core/render`'s generic `computeSnapshotAlpha`/`lerp` — see
// client.ts, the one consumer of this module. `smoothstep` (the easing
// curve applied to that raw alpha) and `copySprite` (SnapshotSprite-specific
// field copying) stay here: neither is part of the generic snapshot-interp
// primitive's contract.

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function copySprite(dst: SnapshotSprite, src: SnapshotSprite): void {
  dst.id = src.id;
  dst.x = src.x;
  dst.y = src.y;
  dst.rotation = src.rotation;
  dst.layer = src.layer;
  dst.frame = src.frame;
  dst.alpha = src.alpha;

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

  if (src.healthFrac !== undefined) dst.healthFrac = src.healthFrac;
  else delete dst.healthFrac;
}
