/**
 * Collision-aware home placement (chunk hollow-09 fix) — the "hitbox" layer
 * that stops houses from overlapping. `householdLayout` only gives each home a
 * DESIRED anchor (its community's territory centroid + a small per-id offset),
 * which piles several homes of one community on top of each other. This module
 * treats every home as an axis-aligned footprint rectangle ("hitbox") and, when
 * a new home is first placed, nudges it outward from its desired anchor until
 * its hitbox clears every already-placed home's hitbox.
 *
 * Pure + deterministic (no RNG, no wall-clock): given the same desired anchor,
 * footprint, and set of already-placed rects, `findFreePlacement` always
 * returns the same spot — so a home lands in the same place every run, and the
 * app can freeze it there for the life of the run (no teleport). Corner-anchored
 * to match `@engine/core/render3d`'s `box()` (a home at `(x,y)` spans
 * `[x, x+w] x [y, y+d]`).
 */

/** An axis-aligned footprint rectangle in tile-space (a home's "hitbox"). */
export interface Rect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Default spacing (tiles) kept BETWEEN home footprints — applied as a margin
 *  on every side of each hitbox, so two homes end up at least `2 * HOME_MARGIN`
 *  apart. Kept small so a community still reads as a cluster, not a sprawl. */
export const HOME_MARGIN = 0.8;

/** True iff two rects overlap (touching edges do NOT count as overlap). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/** The hitbox of a home whose min-corner is at `(x, y)` with footprint `w x d`,
 *  inflated by `margin` on every side. */
export function footprintRect(x: number, y: number, w: number, d: number, margin = 0): Rect {
  return { minX: x - margin, minY: y - margin, maxX: x + w + margin, maxY: y + d + margin };
}

export interface PlacementOptions {
  /** Radial step (tiles) between search rings; defaults to the footprint's
   *  larger dimension so each ring clears a whole home. */
  readonly step?: number;
  /** Max rings to search before giving up (and returning the desired anchor,
   *  allowing overlap rather than looping forever). */
  readonly maxRings?: number;
}

/**
 * Find a position (min-corner) for a `w x d` home near `desired` whose hitbox
 * (footprint + `margin`) overlaps none of `placed`. Tries `desired` first, then
 * spirals outward in rings of increasing radius, sampling more angles per ring
 * so density stays even. Deterministic: same inputs -> same output. Falls back
 * to `desired` if no free spot is found within `maxRings` (degrades to the old
 * overlapping behaviour rather than hanging).
 */
export function findFreePlacement(
  desired: { readonly x: number; readonly y: number },
  w: number,
  d: number,
  margin: number,
  placed: readonly Rect[],
  opts: PlacementOptions = {},
): { x: number; y: number } {
  const step = opts.step ?? Math.max(w, d);
  const maxRings = opts.maxRings ?? 48;

  const isFree = (x: number, y: number): boolean => {
    const rect = footprintRect(x, y, w, d, margin);
    for (const r of placed) {
      if (rectsOverlap(r, rect)) return false;
    }
    return true;
  };

  if (isFree(desired.x, desired.y)) return { x: desired.x, y: desired.y };

  for (let ring = 1; ring <= maxRings; ring++) {
    const radius = ring * step;
    const samples = ring * 8;
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const x = desired.x + Math.cos(angle) * radius;
      const y = desired.y + Math.sin(angle) * radius;
      if (isFree(x, y)) return { x, y };
    }
  }
  return { x: desired.x, y: desired.y };
}
