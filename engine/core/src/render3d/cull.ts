/**
 * Frustum culling for the 3D scene renderer (corpus brief 19). Pure functions over typed arrays, no GPU
 * handle, so every line is unit-tested. The renderer calls {@link cullInstances} on each draw call's packed
 * instance rows (see `packInstances` in `buffers.ts`) and uploads only the rows that survive.
 *
 * Conservative by design: a sphere is dropped only when it lies fully behind one plane. Anything uncertain
 * (a degenerate matrix, a NaN) is kept, because an instance popping at the frame's edge is worse than one
 * wasted draw.
 */
import type { Mat4 } from "./mat4";
import type { Mesh } from "./types";
import { FLOATS_PER_INSTANCE } from "./buffers";

/** A bounding sphere in a mesh's own space. */
export interface BoundingSphere {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly radius: number;
}

/** Six planes, 4 floats each (`a, b, c, d`, normal pointing into the frustum): left, right, bottom, top, near, far. */
export type FrustumPlanes = Float32Array;

export const FRUSTUM_PLANE_FLOATS = 24;

/** Slack added to every sphere radius so float error at a plane never drops a visible instance. */
const RADIUS_SLACK = 1e-3;

/** The centre of the mesh's bounding box and the distance to its farthest vertex: a sphere that holds every vertex. */
export function boundingSphereOf(mesh: Mesh): BoundingSphere {
  const ps = mesh.positions;
  if (ps.length === 0) return { cx: 0, cy: 0, cz: 0, radius: 0 };
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const [x, y, z] of ps) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  let r2 = 0;
  for (const [x, y, z] of ps) {
    const d2 = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
    if (d2 > r2) r2 = d2;
  }
  return { cx, cy, cz, radius: Math.sqrt(r2) };
}

/**
 * The six frustum planes of a view-projection matrix (Gribb-Hartmann), normalised, into `out`.
 * `mat4.ts`'s `perspective()` maps depth to [0, 1] (WebGPU/D3D convention), so the near plane is row 2 alone,
 * not row 3 + row 2.
 */
export function extractFrustumPlanes(
  viewProj: Mat4,
  out: FrustumPlanes = new Float32Array(FRUSTUM_PLANE_FLOATS),
): FrustumPlanes {
  const m = viewProj;
  // Column-major: row r is (m[r], m[4 + r], m[8 + r], m[12 + r]).
  const row = (r: number, k: number): number => m[k * 4 + r] ?? 0;
  const write = (plane: number, sign: number, r: number): void => {
    // plane = row3 + sign * row r   (sign 0 means row r alone, used by the near plane)
    let a: number, b: number, c: number, d: number;
    if (sign === 0) {
      a = row(r, 0);
      b = row(r, 1);
      c = row(r, 2);
      d = row(r, 3);
    } else {
      a = row(3, 0) + sign * row(r, 0);
      b = row(3, 1) + sign * row(r, 1);
      c = row(3, 2) + sign * row(r, 2);
      d = row(3, 3) + sign * row(r, 3);
    }
    const len = Math.hypot(a, b, c);
    const inv = len > 0 ? 1 / len : 1;
    const o = plane * 4;
    out[o] = a * inv;
    out[o + 1] = b * inv;
    out[o + 2] = c * inv;
    out[o + 3] = d * inv;
  };
  write(0, 1, 0); // left:   w + x >= 0
  write(1, -1, 0); // right:  w - x >= 0
  write(2, 1, 1); // bottom: w + y >= 0
  write(3, -1, 1); // top:    w - y >= 0
  write(4, 0, 2); // near:   z >= 0
  write(5, -1, 2); // far:    w - z >= 0
  return out;
}

/** Whether a sphere (world centre, radius) is inside or crossing the frustum. */
export function sphereInFrustum(planes: FrustumPlanes, x: number, y: number, z: number, radius: number): boolean {
  const r = radius + RADIUS_SLACK;
  for (let i = 0; i < FRUSTUM_PLANE_FLOATS; i += 4) {
    const dist = (planes[i] ?? 0) * x + (planes[i + 1] ?? 0) * y + (planes[i + 2] ?? 0) * z + (planes[i + 3] ?? 0);
    if (dist < -r) return false;
  }
  return true;
}

/**
 * Copies the rows of `src` (`count` packed instances) whose transformed bounding sphere is inside or crossing the
 * frustum into `out`, in order, and returns how many it kept. The sphere centre is the mesh sphere's centre
 * through the instance's model matrix; the radius is multiplied by the matrix's largest axis scale, so a scaled
 * instance (a resource node shrunk by stock, an agent grown by its genes) keeps its true reach.
 * `out` must hold at least `count * FLOATS_PER_INSTANCE` floats.
 */
export function cullInstances(
  src: Float32Array,
  count: number,
  sphere: BoundingSphere,
  planes: FrustumPlanes,
  out: Float32Array,
): number {
  let kept = 0;
  for (let i = 0; i < count; i++) {
    const o = i * FLOATS_PER_INSTANCE;
    // Model matrix, column-major: columns at o, o+4, o+8, translation at o+12.
    const m0 = src[o] ?? 0,
      m1 = src[o + 1] ?? 0,
      m2 = src[o + 2] ?? 0;
    const m4 = src[o + 4] ?? 0,
      m5 = src[o + 5] ?? 0,
      m6 = src[o + 6] ?? 0;
    const m8 = src[o + 8] ?? 0,
      m9 = src[o + 9] ?? 0,
      m10 = src[o + 10] ?? 0;
    const x = m0 * sphere.cx + m4 * sphere.cy + m8 * sphere.cz + (src[o + 12] ?? 0);
    const y = m1 * sphere.cx + m5 * sphere.cy + m9 * sphere.cz + (src[o + 13] ?? 0);
    const z = m2 * sphere.cx + m6 * sphere.cy + m10 * sphere.cz + (src[o + 14] ?? 0);
    const scale = Math.sqrt(
      Math.max(m0 * m0 + m1 * m1 + m2 * m2, m4 * m4 + m5 * m5 + m6 * m6, m8 * m8 + m9 * m9 + m10 * m10),
    );
    if (sphereInFrustum(planes, x, y, z, sphere.radius * scale)) {
      out.set(src.subarray(o, o + FLOATS_PER_INSTANCE), kept * FLOATS_PER_INSTANCE);
      kept += 1;
    }
  }
  return kept;
}
