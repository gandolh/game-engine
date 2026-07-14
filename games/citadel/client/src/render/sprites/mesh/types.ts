/**
 * Indexed triangle mesh — the core representation for the box-model art pipeline
 * (Phase 1). A building is composed from parametric primitive generators
 * ({@link ./geometry}) into ONE indexed mesh, then projected + z-buffered +
 * flat-shaded to a sprite ({@link ./render}).
 *
 * Coordinates are in TILE UNITS: x = east footprint, y = south footprint, z =
 * up. The near / camera-facing side is +x/+y. Everything here is data only;
 * behaviour lives in the geometry + render modules. Deterministic (no RNG / no
 * Date) so the atlas stays byte-identical every boot.
 */

/** A point / vector in tile units: `[x, y, z]`. */
export type Vec3 = readonly [number, number, number];

/** Material key → a flat-shading Apollo ramp (see {@link ./materials}). */
export type MaterialKey =
  | "plaster"
  | "timber"
  | "darkwood"
  | "tile"
  | "stone"
  | "oven"
  | "greenroof"
  | "signal"
  | "pit"
  | "window"
  | "lampGlow"
  | "hotEmber";

/** One triangle: three vertex INDICES into the mesh's `positions`, wound CCW as
 *  seen from outside (so the face normal points outward), plus its material. */
export interface Tri {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly material: MaterialKey;
}

/** An indexed triangle mesh: vertices stored once, referenced by index. */
export interface Mesh {
  readonly positions: readonly Vec3[];
  readonly tris: readonly Tri[];
}

/** A named building: a footprint envelope + its composed mesh. */
export interface MeshModel {
  /** Atlas frame name it overrides, e.g. `bld/house`. */
  readonly name: string;
  /** Footprint width in tiles (x extent the quad is sized to). */
  readonly footprintW: number;
  /** Footprint depth in tiles (y extent). */
  readonly footprintD: number;
  /** Art height in tiles — MUST match the renderer's per-type `heightTiles`. */
  readonly heightTiles: number;
  /** The composed mesh (all primitives merged into one indexed face set). */
  readonly mesh: Mesh;
}
