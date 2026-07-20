/**
 * Indexed triangle mesh — the core data model for the engine's pure 3D layer.
 * Generic and game-agnostic: no palette, no material enum. A game maps its own
 * material-key strings to colors/textures at render time (see 08b, the WebGPU
 * layer that consumes this).
 *
 * Coordinate convention: x/y is the ground plane, z is up. Triangles are wound
 * CCW as seen from OUTSIDE the mesh, so `cross(b-a, c-a)` is the outward
 * normal (consumers rely on this for back-face culling / lighting).
 */

/** A point / vector: `[x, y, z]`. */
export type Vec3 = readonly [number, number, number];

/** One triangle: three vertex INDICES into the mesh's `positions`, wound CCW
 *  as seen from outside (so the face normal points outward), plus a generic
 *  material key. The engine ships no palette — the material string is purely
 *  a game-defined lookup key. */
export interface Tri {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly material: string;
}

/** An indexed triangle mesh: vertices stored once, referenced by index. */
export interface Mesh {
  readonly positions: readonly Vec3[];
  readonly tris: readonly Tri[];
}
