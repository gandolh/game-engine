/**
 * CPU-side data packing for the WebGPU 3D scene renderer — the entire
 * testable core of 08b. WebGPU cannot run headless in CI/dev sandboxes, so
 * every byte of layout logic that CAN be pure lives here as plain functions
 * over typed arrays, with no GPUDevice/GPUBuffer involved. `device3d.ts` /
 * `pipeline-cache.ts` / `renderer3d.ts` are thin GPU orchestration that calls
 * into this file — they stay typecheck-only, this file is unit-tested.
 *
 * Ordering contract (material-key -> index): a game builds an ORDERED list of
 * material-key strings, uploads the matching `Material[]` (same order) via
 * `SceneRenderer3D.setMaterials`, and derives a resolver with
 * `materialIndexMap(keys)` to pass into `packMesh`. Index `i` in the uploaded
 * material buffer == `keys[i]` == the i-th element of the `Material[]` passed
 * to `setMaterials`. There is no other synchronization between key strings
 * and GPU-side indices — get the two lists out of sync and materials render
 * wrong (not a crash), so keep them built from the same array.
 */
import type { Mat4 } from "../mat4";
import { transformPoint } from "../mat4";
import { boundsOf } from "../geometry";
import type { Mesh, Vec3 } from "../types";

/** A generic material: flat RGB color (0..1 floats) + an emissive flag (for
 *  unlit "glowing window at night" style surfaces). No texture, no PBR terms
 *  — this is a cozy flat/toon-shaded renderer, not a PBR one. */
export interface Material {
  readonly color: Vec3;
  readonly emissive?: boolean;
}

/** Floats packed per mesh vertex: position.xyz (3) + materialIndex (1). */
export const FLOATS_PER_VERTEX = 4;

/** Floats packed per instance: a 4x4 model matrix (16, column-major, matches
 *  {@link Mat4}) + an rgba tint (4). */
export const FLOATS_PER_INSTANCE = 20;

/** Floats packed per material entry. A `{color: vec3, emissive: f32}` struct
 *  is only 4 floats wide, but WGSL's std140-style array-of-struct layout
 *  rounds each element's stride up to a 16-byte (4-float) multiple of the
 *  struct's own base alignment; padding to 8 floats (32 bytes) here mirrors
 *  the `array<Material>` stride used by `scene3d.wgsl` and leaves headroom
 *  for a future field (e.g. roughness/rim) without a stride change. */
export const FLOATS_PER_MATERIAL = 8;

/**
 * Resolve an ORDERED list of material-key strings into a `(key) => index`
 * function — the piece that lets a game's string-keyed `Tri.material` map
 * onto the GPU-side material table uploaded via `setMaterials`. Duplicate
 * keys keep their FIRST index (a later duplicate is a caller bug, not fatal).
 * Throws on an unknown key rather than silently defaulting to material 0,
 * since a wrong-but-valid-looking material index is a much harder bug to spot
 * than a thrown error at mesh-build time.
 */
export function materialIndexMap(keys: readonly string[]): (key: string) => number {
  const map = new Map<string, number>();
  keys.forEach((key, i) => {
    if (!map.has(key)) map.set(key, i);
  });
  return (key: string): number => {
    const idx = map.get(key);
    if (idx === undefined) {
      throw new Error(
        `render3d: unknown material key "${key}" — not present in the ordered key list ` +
          `passed to materialIndexMap (must match the array given to setMaterials)`,
      );
    }
    return idx;
  };
}

/**
 * Pack a {@link Mesh} into GPU-upload-ready vertex/index typed arrays.
 *
 * Vertex layout (per vertex, 4 floats): `position.xyz, materialIndex`.
 * Indices reuse `mesh.positions`' order directly (no vertex splitting), so
 * `indices.length == tris.length * 3` and every index `< vertexCount`.
 *
 * INVARIANT this relies on: a `merge()`d mesh built from disjoint primitives
 * never shares a vertex index across two different materials (true because
 * every primitive generator in `geometry.ts` emits its own private vertex
 * set — merging only offsets indices, it never welds vertices). If some
 * future mesh-building step DOES share a vertex between differently
 * materialed triangles, this function does not crash: it assigns that
 * vertex the material of the LOWEST-INDEX triangle that references it (the
 * first tri touching a vertex wins; later tris referencing the same vertex
 * do not override it) and moves on — a visibly-wrong seam is preferable to a
 * throw in a renderer.
 */
export function packMesh(
  mesh: Mesh,
  materialIndexOf: (key: string) => number,
): { vertices: Float32Array; indices: Uint32Array; vertexCount: number; indexCount: number } {
  const vertexCount = mesh.positions.length;
  const vertices = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
  for (let i = 0; i < vertexCount; i++) {
    const p = mesh.positions[i]!;
    const base = i * FLOATS_PER_VERTEX;
    vertices[base + 0] = p[0];
    vertices[base + 1] = p[1];
    vertices[base + 2] = p[2];
    // vertices[base + 3] (materialIndex) defaults to 0; overwritten below the
    // first time a triangle claims this vertex.
  }

  const assigned = new Uint8Array(vertexCount);
  const indices = new Uint32Array(mesh.tris.length * 3);
  let cursor = 0;
  for (const tri of mesh.tris) {
    const matIndex = materialIndexOf(tri.material);
    for (const vi of [tri.a, tri.b, tri.c]) {
      if (assigned[vi] === 0) {
        vertices[vi * FLOATS_PER_VERTEX + 3] = matIndex;
        assigned[vi] = 1;
      }
      indices[cursor++] = vi;
    }
  }

  return { vertices, indices, vertexCount, indexCount: indices.length };
}

/** Pack one instance's model matrix + tint into a 20-float row (16 model +
 *  4 tint, matching {@link FLOATS_PER_INSTANCE}). */
export function packInstance(model: Mat4, tint: readonly [number, number, number, number]): Float32Array {
  const out = new Float32Array(FLOATS_PER_INSTANCE);
  out.set(model, 0);
  out[16] = tint[0];
  out[17] = tint[1];
  out[18] = tint[2];
  out[19] = tint[3];
  return out;
}

/** One instance's model matrix + tint, as consumed by {@link packInstances}. */
export interface InstanceInput {
  readonly model: Mat4;
  readonly tint: readonly [number, number, number, number];
}

/** Concatenate `packInstance` rows for a list of instances into one buffer,
 *  ready to upload as the per-instance vertex buffer. */
export function packInstances(list: readonly InstanceInput[]): Float32Array {
  const out = new Float32Array(list.length * FLOATS_PER_INSTANCE);
  list.forEach((inst, i) => {
    out.set(packInstance(inst.model, inst.tint), i * FLOATS_PER_INSTANCE);
  });
  return out;
}

/** Pack an ordered material list into the GPU-side material table (see
 *  {@link FLOATS_PER_MATERIAL} for the padding rationale). Index `i` in the
 *  returned array's rows == `materials[i]` == the material any `packMesh`
 *  caller's `materialIndexOf(key) === i` resolves to (see the module-level
 *  ordering-contract doc comment). */
export function packMaterials(materials: readonly Material[]): Float32Array {
  const out = new Float32Array(materials.length * FLOATS_PER_MATERIAL);
  materials.forEach((mat, i) => {
    const base = i * FLOATS_PER_MATERIAL;
    out[base + 0] = mat.color[0];
    out[base + 1] = mat.color[1];
    out[base + 2] = mat.color[2];
    out[base + 3] = mat.emissive ? 1 : 0;
    // out[base + 4..7] left as zero padding — see FLOATS_PER_MATERIAL.
  });
  return out;
}

/**
 * World-space AABB of a mesh instance: transform `boundsOf(mesh)`'s 8 corners
 * by `model` and re-bound. This is what the demo feeds `pickNearest` (from
 * `../pick`) for click-to-inspect — the pure per-instance bounding box that
 * screen-ray picking tests against, entirely independent of any GPU state.
 */
export function instanceAABB(mesh: Mesh, model: Mat4): { min: Vec3; max: Vec3 } {
  const { min, max } = boundsOf(mesh);
  const corners: Vec3[] = [
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    [min[0], max[1], min[2]],
    [max[0], max[1], min[2]],
    [min[0], min[1], max[2]],
    [max[0], min[1], max[2]],
    [min[0], max[1], max[2]],
    [max[0], max[1], max[2]],
  ];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const c of corners) {
    const p = transformPoint(model, c);
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[2] < minZ) minZ = p[2];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
    if (p[2] > maxZ) maxZ = p[2];
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}
