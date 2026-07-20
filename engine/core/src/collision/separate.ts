/**
 * Narrow-phase overlap tests + the deterministic dynamic-body separation
 * solver — the moving-body complement to `placement/occupancy.ts`'s static
 * footprint grid. Everything here is pure math: no game import, no WebGPU,
 * no nondeterministic time-of-day or entropy source of any kind. Safe to
 * call from render code today and from sim code later (a future,
 * DELIBERATE gameplay change — not this one).
 */
import type { Vec3 } from "../render3d/types";
import { SpatialHash } from "./spatial-hash";

/** A world-space axis-aligned bounding box, matching the shape
 *  `render3d`'s `instanceAABB` produces (`{ min: Vec3; max: Vec3 }`) —
 *  defined locally (not imported) so this module has zero WebGPU
 *  dependency; the shape is structurally identical, so either can be
 *  passed here directly. */
export interface AABB {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Exact circle/circle overlap test: true if two circles (center + radius)
 *  intersect or touch. */
export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

/** Exact AABB/AABB overlap test (separating-axis on all three axes). */
export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] &&
    a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}

/**
 * Deterministic fan-out constant for the degenerate (coincident-center)
 * tie-break below. The golden angle (`π(3 - √5)`) is the classic
 * irrational-turn constant used for phyllotaxis-style even fan-out — it's
 * used purely as a fixed, well-distributed angular step keyed off an id,
 * NOT as a source of randomness (it's a compile-time constant; the "input"
 * is always the same agent id, so the output angle is always the same).
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Below this center-to-center distance, the separation axis can't be
 *  normalized reliably (division by ~0) — treated as the degenerate
 *  coincident-position case. */
const DEGENERATE_EPS = 1e-9;

export interface SeparateBody {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface SeparateOptions {
  /** Relaxation passes. Each overlapping pair is fully resolved (to exactly
   *  touching) within a single pass, but with 3+ mutually-overlapping
   *  bodies, resolving one pair can reintroduce a small overlap with a
   *  third — more iterations converge that toward zero. Default 4. */
  readonly iterations?: number;
}

/**
 * Push apart every pair of overlapping circles among `bodies` by iterative
 * relaxation, and return the adjusted `(x, y)` for every input id. Does NOT
 * mutate `bodies`.
 *
 * Algorithm (per iteration):
 *   1. Rebuild a `SpatialHash` broad-phase index from the CURRENT working
 *      positions (not the original input — positions shift each pass).
 *   2. For each body, in ascending-id order, query its neighborhood and
 *      resolve every overlapping pair with a higher id (so each unordered
 *      pair is processed exactly once, lower id first — a fixed,
 *      deterministic order that does not depend on the caller's array
 *      order).
 *   3. Resolution pushes both centers apart along the center-to-center axis
 *      by half the penetration depth each — symmetric, so neither body is
 *      privileged.
 *
 * Degenerate case (the exact bug this module exists to fix — two agents
 * landing on the same tile have IDENTICAL positions): when the center-to-
 * center distance is ~0, the axis can't be normalized. Instead of picking
 * an arbitrary or random direction, the axis angle is derived from the
 * lower-id body's id (`(id * GOLDEN_ANGLE) mod 2π`) — a fixed function of
 * data already in the input, so the SAME pair of ids always fans out along
 * the SAME axis, on every run, regardless of when in the game the collision
 * happens.
 *
 * Determinism: bodies are sorted by id internally before any processing,
 * so the CALLER's array order never affects the result — shuffling the
 * input array yields byte-identical output (proven in this module's test).
 * No RNG, no wall-clock reads anywhere in this function.
 */
export function separateCircles(
  bodies: readonly SeparateBody[],
  opts: SeparateOptions = {},
): Map<number, { x: number; y: number }> {
  const iterations = opts.iterations ?? 4;

  // Sort a working copy by id ascending so caller order never matters.
  const sorted = [...bodies].sort((a, b) => a.id - b.id);

  const pos = new Map<number, { x: number; y: number }>();
  const radiusById = new Map<number, number>();
  let maxRadius = 0;
  for (const b of sorted) {
    pos.set(b.id, { x: b.x, y: b.y });
    radiusById.set(b.id, b.radius);
    if (b.radius > maxRadius) maxRadius = b.radius;
  }

  if (sorted.length < 2) return pos; // nothing to separate against

  // Broad-phase cell size: 2x the largest radius keeps each body's overlap
  // neighborhood within a small, bounded set of cells regardless of body
  // count or world scale.
  const cellSize = Math.max(maxRadius * 2, 1e-6);

  for (let iter = 0; iter < iterations; iter++) {
    const hash = new SpatialHash(cellSize);
    for (const b of sorted) {
      const p = pos.get(b.id);
      if (p) hash.insert(b.id, p.x, p.y);
    }

    for (const a of sorted) {
      const ap = pos.get(a.id);
      const ar = radiusById.get(a.id);
      if (!ap || ar === undefined) continue;
      const neighborIds = hash.queryRadius(ap.x, ap.y, ar + maxRadius);
      for (const bId of neighborIds) {
        if (bId <= a.id) continue; // each unordered pair resolved once, lower id first
        const bp = pos.get(bId);
        const br = radiusById.get(bId);
        if (!bp || br === undefined) continue;
        resolvePair(a.id, ap, ar, bp, br);
      }
    }
  }

  return pos;
}

/** Resolve one overlapping pair in place: mutates `a` and `b` (the objects
 *  stored in `separateCircles`'s working `pos` map) symmetrically. No-op if
 *  the pair isn't actually overlapping. */
function resolvePair(
  idA: number,
  a: { x: number; y: number },
  ra: number,
  b: { x: number; y: number },
  rb: number,
): void {
  const desired = ra + rb;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distSq = dx * dx + dy * dy;
  if (distSq >= desired * desired) return; // not overlapping

  const dist = Math.sqrt(distSq);
  let nx: number;
  let ny: number;
  if (dist < DEGENERATE_EPS) {
    // Coincident centers: derive a deterministic axis from the lower id
    // (idA — this pair is always visited lower-id-first, see the caller)
    // instead of normalizing a zero vector or reaching for RNG.
    const angle = (idA * GOLDEN_ANGLE) % (Math.PI * 2);
    nx = Math.cos(angle);
    ny = Math.sin(angle);
  } else {
    nx = dx / dist;
    ny = dy / dist;
  }

  const penetration = desired - dist;
  const push = penetration / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
}
