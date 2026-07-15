import type { SnapshotSprite } from "@farm/sim-core/snapshot";

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

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
