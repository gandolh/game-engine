/**
 * Parametric primitive GENERATORS + transform/merge helpers for building
 * meshes. Promoted from the game-agnostic subset of a per-game box-model
 * pipeline; building-specific generators (windows, banners, crenellation,
 * sails, …) stay in the game that needs them.
 *
 * Every generator returns an indexed {@link Mesh} whose triangles are wound CCW
 * as seen from OUTSIDE (so `cross(b-a, c-a)` is the outward normal — consumers
 * rely on this for back-face culling / lighting). Primitives are emitted at a
 * canonical origin; compose a larger shape by `translate`/`scale`/`rotate*`-ing
 * them and `merge`-ing into one mesh. Pure + deterministic (no RNG, no clock).
 */
import type { Mesh, Tri, Vec3 } from "./types";

// ---------------------------------------------------------------------------
// Vector + transform helpers
// ---------------------------------------------------------------------------

export function add(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function sub(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function normalize(a: Vec3): Vec3 {
  const m = Math.hypot(a[0], a[1], a[2]);
  return m === 0 ? [0, 0, 0] : [a[0] / m, a[1] / m, a[2] / m];
}

/** Translate every vertex by `v`; topology (tris) unchanged. Returns a new mesh. */
export function translate(m: Mesh, v: Vec3): Mesh {
  return { positions: m.positions.map((p) => add(p, v)), tris: m.tris };
}

/** Scale every vertex componentwise by `s` (scalar or per-axis). New mesh. */
export function scale(m: Mesh, s: Vec3 | number): Mesh {
  const sv: Vec3 = typeof s === "number" ? [s, s, s] : s;
  return { positions: m.positions.map((p) => [p[0] * sv[0], p[1] * sv[1], p[2] * sv[2]] as Vec3), tris: m.tris };
}

/** Rotate about the +z axis (through the origin) by `rad`. New mesh. */
export function rotateZ(m: Mesh, rad: number): Mesh {
  const c = Math.cos(rad), s = Math.sin(rad);
  return {
    positions: m.positions.map((p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]] as Vec3),
    tris: m.tris,
  };
}

/** Rotate about the +x axis (through the origin) by `rad`. New mesh (winding preserved). */
export function rotateX(m: Mesh, rad: number): Mesh {
  const c = Math.cos(rad), s = Math.sin(rad);
  return {
    positions: m.positions.map((p) => [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c] as Vec3),
    tris: m.tris,
  };
}

/** Rotate about the +y axis (through the origin) by `rad`. New mesh (winding preserved). */
export function rotateY(m: Mesh, rad: number): Mesh {
  const c = Math.cos(rad), s = Math.sin(rad);
  return {
    positions: m.positions.map((p) => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c] as Vec3),
    tris: m.tris,
  };
}

/** Concatenate meshes into one, offsetting each mesh's triangle indices. */
export function merge(...meshes: readonly Mesh[]): Mesh {
  const positions: Vec3[] = [];
  const tris: Tri[] = [];
  for (const mesh of meshes) {
    const base = positions.length;
    for (const p of mesh.positions) positions.push(p);
    for (const t of mesh.tris) tris.push({ a: t.a + base, b: t.b + base, c: t.c + base, material: t.material });
  }
  return { positions, tris };
}

/** Axis-aligned bounds of a mesh: `{min, max}`. An empty mesh (no positions)
 *  returns degenerate zero bounds `{min:[0,0,0], max:[0,0,0]}`. */
export function boundsOf(mesh: Mesh): { min: Vec3; max: Vec3 } {
  if (mesh.positions.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [x, y, z] of mesh.positions) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

// ---------------------------------------------------------------------------
// Primitive generators
// ---------------------------------------------------------------------------

/** A single quad `a→b→c→d` (CCW from outside) as two triangles. */
export function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, material: string): Mesh {
  return { positions: [a, b, c, d], tris: [{ a: 0, b: 1, c: 2, material }, { a: 0, b: 2, c: 3, material }] };
}

/**
 * Axis-aligned box with its MIN corner at the origin and extent `size = [w,d,h]`.
 * All six faces, each wound outward.
 */
export function box(size: Vec3, material: string): Mesh {
  const [w, d, h] = size;
  const p: Vec3[] = [
    [0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], // 0..3 bottom
    [0, 0, h], [w, 0, h], [w, d, h], [0, d, h], // 4..7 top
  ];
  const f = (a: number, b: number, c: number, dd: number): Tri[] => [
    { a, b, c, material }, { a, b: c, c: dd, material },
  ];
  const tris: Tri[] = [
    ...f(4, 5, 6, 7), // top   (+z)
    ...f(0, 3, 2, 1), // bottom(-z)
    ...f(1, 2, 6, 5), // +x
    ...f(0, 4, 7, 3), // -x
    ...f(3, 7, 6, 2), // +y
    ...f(0, 1, 5, 4), // -y
  ];
  return { positions: p, tris };
}

/** A ring of `segs` points of radius `r` at height `z`, centred on the origin. */
function ring(r: number, z: number, segs: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    out.push([Math.cos(a) * r, Math.sin(a) * r, z]);
  }
  return out;
}

/**
 * Cylinder centred on the z-axis: base ring at z=0, top ring at z=`height`,
 * `segs` radial segments, with top + bottom caps. Outward-wound sides + caps.
 */
export function cylinder(radius: number, height: number, segs: number, material: string): Mesh {
  const bot = ring(radius, 0, segs);
  const top = ring(radius, height, segs);
  const positions: Vec3[] = [...bot, ...top];
  const cTop = positions.push([0, 0, height]) - 1;
  const cBot = positions.push([0, 0, 0]) - 1;
  const tris: Tri[] = [];
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    const b0 = i, b1 = j, t0 = segs + i, t1 = segs + j;
    // Side quad, outward CCW (b0 → b1 → t1 → t0).
    tris.push({ a: b0, b: b1, c: t1, material });
    tris.push({ a: b0, b: t1, c: t0, material });
    // Top cap fan (outward +z): centre → t0 → t1.
    tris.push({ a: cTop, b: t0, c: t1, material });
    // Bottom cap fan (outward -z): centre → b1 → b0.
    tris.push({ a: cBot, b: b1, c: b0, material });
  }
  return { positions, tris };
}

/**
 * Cone / pyramid-of-`segs`: base ring at z=0 of `radius`, apex at z=`height`.
 * With `segs=4` (and a rotation) it is a square pyramid. Outward-wound sides +
 * base cap.
 */
export function cone(radius: number, height: number, segs: number, material: string): Mesh {
  const bot = ring(radius, 0, segs);
  const positions: Vec3[] = [...bot];
  const apex = positions.push([0, 0, height]) - 1;
  const cBot = positions.push([0, 0, 0]) - 1;
  const tris: Tri[] = [];
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    tris.push({ a: i, b: j, c: apex, material }); // side, outward
    tris.push({ a: cBot, b: j, c: i, material }); // base cap, outward -z
  }
  return { positions, tris };
}

/**
 * Square pyramid: rectangular base `[w,d]` (min corner at origin) rising to a
 * single apex centred at height `h`. Four triangular sides + base.
 */
export function pyramid(base: readonly [number, number], h: number, material: string): Mesh {
  const [w, d] = base;
  const positions: Vec3[] = [
    [0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], // base 0..3 (CCW from below)
    [w / 2, d / 2, h], // apex 4
  ];
  const tris: Tri[] = [
    { a: 1, b: 2, c: 4, material }, // +x side
    { a: 3, b: 0, c: 4, material }, // -x side
    { a: 2, b: 3, c: 4, material }, // +y side
    { a: 0, b: 1, c: 4, material }, // -y side
    { a: 0, b: 3, c: 2, material }, { a: 0, b: 2, c: 1, material }, // base (-z)
  ];
  return { positions, tris };
}

/**
 * Gable roof prism: rectangular footprint `[w,d]` (min corner at origin), eaves
 * at z=0, ridge at z=`h`. With `ridge="x"` the ridge runs east-west at y=d/2
 * (slopes face ±y, triangular gable ends at ±x); `"y"` swaps the axes. All faces
 * (both slopes + both ends + bottom) wound outward.
 */
export function gable(size: Vec3, ridge: "x" | "y", material: string): Mesh {
  const [w, d, h] = size;
  if (ridge === "x") {
    const ym = d / 2;
    const positions: Vec3[] = [
      [0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], // eaves 0..3
      [0, ym, h], [w, ym, h], // ridge 4,5
    ];
    const tris: Tri[] = [
      { a: 3, b: 4, c: 5, material }, { a: 3, b: 5, c: 2, material }, // south slope (+y,+z)
      { a: 1, b: 5, c: 4, material }, { a: 1, b: 4, c: 0, material }, // north slope (-y,+z)
      { a: 1, b: 2, c: 5, material }, // east gable end (+x)
      { a: 0, b: 4, c: 3, material }, // west gable end (-x)
      { a: 0, b: 3, c: 2, material }, { a: 0, b: 2, c: 1, material }, // bottom (-z)
    ];
    return { positions, tris };
  }
  const xm = w / 2;
  const positions: Vec3[] = [
    [0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], // eaves 0..3
    [xm, 0, h], [xm, d, h], // ridge 4,5
  ];
  const tris: Tri[] = [
    { a: 1, b: 2, c: 5, material }, { a: 1, b: 5, c: 4, material }, // east slope (+x,+z)
    { a: 0, b: 4, c: 5, material }, { a: 0, b: 5, c: 3, material }, // west slope (-x,+z)
    { a: 2, b: 3, c: 5, material }, // south gable end (+y)
    { a: 0, b: 1, c: 4, material }, // north gable end (-y)
    { a: 0, b: 3, c: 2, material }, { a: 0, b: 2, c: 1, material }, // bottom (-z)
  ];
  return { positions, tris };
}

/**
 * A thin vertical DISC (a short cylinder rotated to stand on edge) of `radius`
 * and axial `thickness`, its axis along +x. Centred on the origin; translate
 * into place.
 */
export function disc(radius: number, thickness: number, segs: number, material: string): Mesh {
  // cylinder runs along +z (0..thickness); rotate about +y so the axis lies
  // along x, then centre the thickness on the origin.
  const c = rotateY(cylinder(radius, thickness, segs, material), Math.PI / 2);
  return translate(c, [thickness / 2, 0, 0]);
}
