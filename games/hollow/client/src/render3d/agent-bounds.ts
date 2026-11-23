/**
 * World-space AABB of an agent's mesh instance, without the per-frame cost of `instanceAABB` (corpus brief
 * 24): that function walks every vertex of the mesh (`boundsOf`) and allocates its 8 corners on each call, and
 * the profile ranked `boundsOf` first, at about a quarter of a frame's bytes. A mesh never changes, so its
 * local bounds are found once. The corner arithmetic below is `transformPoint`'s, term for term, so the
 * result equals `instanceAABB`'s exactly (the test compares them).
 */
import { boundsOf, type Mat4, type Mesh, type Vec3 } from "@engine/core/render3d";

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

const boundsByMesh = new WeakMap<Mesh, Aabb>();

/** A mesh's local bounds, computed on the first call and kept. */
export function localBoundsOf(mesh: Mesh): Aabb {
  let bounds = boundsByMesh.get(mesh);
  if (!bounds) {
    bounds = boundsOf(mesh);
    boundsByMesh.set(mesh, bounds);
  }
  return bounds;
}

/** `instanceAABB(mesh, model)` with the mesh's bounds cached and no corner arrays. */
export function cachedInstanceAABB(mesh: Mesh, model: Mat4): Aabb {
  const { min, max } = localBoundsOf(mesh);
  const m = model as ArrayLike<number>;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? max[0] : min[0];
    const y = i & 2 ? max[1] : min[1];
    const z = i & 4 ? max[2] : min[2];
    const rx = (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number);
    const ry = (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number);
    const rz = (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number);
    const rw = (m[3] as number) * x + (m[7] as number) * y + (m[11] as number) * z + (m[15] as number);
    let px = rx,
      py = ry,
      pz = rz;
    if (rw !== 0) {
      const invW = 1 / rw;
      px = rx * invW;
      py = ry * invW;
      pz = rz * invW;
    }
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (pz < minZ) minZ = pz;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    if (pz > maxZ) maxZ = pz;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}
