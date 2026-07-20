/**
 * Screen → world ray casting + intersection tests, for click-to-inspect style
 * picking against a 3D scene. Pure math; no DOM (the caller supplies pixel
 * coordinates + viewport size already resolved from whatever input event).
 */
import type { Vec3 } from "./types";
import { cross, dot, normalize, sub } from "./geometry";
import { invert, transformPoint, type Mat4 } from "./mat4";

/** A world-space ray: `origin` + `dir` (normalized). */
export interface Ray {
  origin: Vec3;
  dir: Vec3;
}

/**
 * Unproject a screen pixel `(sx, sy)` (origin top-left, y-down, as from a DOM
 * pointer event) through the inverse of `viewProj` (the combined view*proj
 * matrix) to build a world-space ray. WebGPU NDC: x,y ∈ [-1,1] with +y up
 * (hence the y-flip from screen space), z ∈ [0 (near), 1 (far)].
 */
export function rayFromScreen(
  sx: number,
  sy: number,
  viewportW: number,
  viewportH: number,
  viewProj: Mat4,
): Ray {
  const ndcX = (sx / viewportW) * 2 - 1;
  const ndcY = 1 - (sy / viewportH) * 2;
  const invVP = invert(viewProj);
  const near = transformPoint(invVP, [ndcX, ndcY, 0]);
  const far = transformPoint(invVP, [ndcX, ndcY, 1]);
  return { origin: near, dir: normalize(sub(far, near)) };
}

/**
 * Slab-method ray/AABB intersection. Returns the nearest hit distance `t ≥ 0`
 * along `ray.dir`, or `null` if the ray misses (or the AABB is entirely
 * behind the ray origin).
 */
export function rayIntersectAABB(ray: Ray, min: Vec3, max: Vec3): number | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const o = ray.origin[axis] as number;
    const d = ray.dir[axis] as number;
    const lo = min[axis] as number;
    const hi = max[axis] as number;
    if (Math.abs(d) < 1e-12) {
      // Ray parallel to this slab: miss unless origin is within it.
      if (o < lo || o > hi) return null;
      continue;
    }
    const invD = 1 / d;
    let t0 = (lo - o) * invD;
    let t1 = (hi - o) * invD;
    if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMin > tMax) return null;
  }
  if (tMax < 0) return null;
  return tMin >= 0 ? tMin : tMax;
}

/**
 * Möller–Trumbore ray/triangle intersection. Returns hit distance `t ≥ 0`
 * along `ray.dir`, or `null` if the ray misses the triangle (including
 * grazing/parallel and behind-origin cases).
 */
export function rayIntersectTriangle(ray: Ray, a: Vec3, b: Vec3, c: Vec3): number | null {
  const EPS = 1e-9;
  const edge1 = sub(b, a);
  const edge2 = sub(c, a);
  const pvec = cross(ray.dir, edge2);
  const det = dot(edge1, pvec);
  if (Math.abs(det) < EPS) return null;
  const invDet = 1 / det;
  const tvec = sub(ray.origin, a);
  const u = dot(tvec, pvec) * invDet;
  if (u < 0 || u > 1) return null;
  const qvec = cross(tvec, edge1);
  const v = dot(ray.dir, qvec) * invDet;
  if (v < 0 || u + v > 1) return null;
  const t = dot(edge2, qvec) * invDet;
  if (t < 0) return null;
  return t;
}

/**
 * Resolve a ray against a set of AABB-bounded items and return the nearest
 * hit's `value`, or `null` if the ray misses all of them. Ties (equal `t`,
 * e.g. coincident bounds) break to the lowest index.
 */
export function pickNearest<T>(
  ray: Ray,
  items: readonly { readonly bounds: { min: Vec3; max: Vec3 }; readonly value: T }[],
): T | null {
  let bestT = Infinity;
  let best: T | null = null;
  for (const item of items) {
    const t = rayIntersectAABB(ray, item.bounds.min, item.bounds.max);
    if (t !== null && t < bestT) {
      bestT = t;
      best = item.value;
    }
  }
  return best;
}
