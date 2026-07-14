/**
 * Parametric primitive GENERATORS + transform/merge helpers for building meshes.
 *
 * Every generator returns an indexed {@link Mesh} whose triangles are wound CCW
 * as seen from OUTSIDE (so `cross(b-a, c-a)` is the outward normal — the renderer
 * relies on this for back-face culling). Primitives are emitted at a canonical
 * origin; compose a building by `translate`/`scale`/`rotateZ`-ing them and
 * `merge`-ing into one mesh. Pure + deterministic.
 */
import type { Mesh, Tri, Vec3, MaterialKey } from "./types";

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

// ---------------------------------------------------------------------------
// Primitive generators
// ---------------------------------------------------------------------------

/** A single quad `a→b→c→d` (CCW from outside) as two triangles. */
export function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, material: MaterialKey): Mesh {
  return { positions: [a, b, c, d], tris: [{ a: 0, b: 1, c: 2, material }, { a: 0, b: 2, c: 3, material }] };
}

/**
 * Axis-aligned box with its MIN corner at the origin and extent `size = [w,d,h]`.
 * All six faces, each wound outward.
 */
export function box(size: Vec3, material: MaterialKey): Mesh {
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
export function cylinder(radius: number, height: number, segs: number, material: MaterialKey): Mesh {
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
export function cone(radius: number, height: number, segs: number, material: MaterialKey): Mesh {
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
export function pyramid(base: readonly [number, number], h: number, material: MaterialKey): Mesh {
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
export function gable(size: Vec3, ridge: "x" | "y", material: MaterialKey): Mesh {
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

// ---------------------------------------------------------------------------
// Composite helpers (built from the primitives above)
// ---------------------------------------------------------------------------

/**
 * A thin vertical DISC (a short cylinder rotated to stand on edge) of `radius`
 * and axial `thickness`, its axis along +x so it faces east/west — e.g. a
 * sawmill water wheel. Centred on the origin; translate into place.
 */
export function disc(radius: number, thickness: number, segs: number, material: MaterialKey): Mesh {
  // cylinder runs along +z (0..thickness); rotate about +y so the axis lies
  // along x, then centre the thickness on the origin.
  const c = rotateY(cylinder(radius, thickness, segs, material), Math.PI / 2);
  return translate(c, [thickness / 2, 0, 0]);
}

/** Nudge (tile units) a window pane's outward face sits proud of its wall
 *  plane by, so the z-buffer resolves it cleanly instead of z-fighting the
 *  wall behind it. */
const WINDOW_PROUD = 0.015;

/**
 * A small window PANE set into a camera-facing wall: a thin box whose outward
 * face sits `WINDOW_PROUD` beyond the wall plane. `axis` is the wall's
 * outward-normal axis ("x" for a wall at `wallAt` facing +x, "y" for one
 * facing +y — the two camera-facing walls in this projection); `u0..u1` spans
 * the wall's OTHER horizontal axis, `z0..z1` the vertical extent. Shared by
 * every window-bearing building so the day model and its `@lit` companion
 * (which only remaps the material) can never disagree on window placement.
 */
export function windowPane(
  axis: "x" | "y",
  wallAt: number,
  u0: number,
  u1: number,
  z0: number,
  z1: number,
  material: MaterialKey,
): Mesh {
  const depth = 0.03;
  const size: Vec3 = axis === "x" ? [depth, u1 - u0, z1 - z0] : [u1 - u0, depth, z1 - z0];
  const origin: Vec3 =
    axis === "x" ? [wallAt - depth + WINDOW_PROUD, u0, z0] : [u0, wallAt - depth + WINDOW_PROUD, z0];
  return translate(box(size, material), origin);
}

/**
 * A banner: a thin timber pole rising to `poleH` with a rectangular cloth flag
 * (a thin box, so both sides shade) hanging from the top. Anchored at the pole
 * base on the origin; translate into place.
 */
export function banner(poleH: number, flagMat: MaterialKey): Mesh {
  const pole = translate(box([0.06, 0.06, poleH], "darkwood"), [-0.03, -0.03, 0]);
  const flag = translate(box([0.34, 0.04, 0.26], flagMat), [0.03, -0.02, poleH - 0.3]);
  return merge(pole, flag);
}

/**
 * A crenellated rim: a row of merlon boxes (`mw` square, `mh` tall) spaced with
 * gaps around the top perimeter of a `w×d` footprint at height `z`. Corners are
 * always placed; the classic castle battlement read.
 */
export function merlonRim(w: number, d: number, z: number, mw: number, mh: number, material: MaterialKey): Mesh {
  const parts: Mesh[] = [];
  const merlon = (x: number, y: number): void => { parts.push(translate(box([mw, mw, mh], material), [x, y, z])); };
  const step = mw * 2;
  for (let x = 0; x <= w - mw + 1e-6; x += step) { merlon(x, 0); merlon(x, d - mw); }
  for (let y = step; y <= d - mw - step + 1e-6; y += step) { merlon(0, y); merlon(w - mw, y); }
  return parts.length ? merge(...parts) : { positions: [], tris: [] };
}

/**
 * A crenellated RING: merlon boxes spaced evenly around a circle of `radius` at
 * height `z` — the battlement for a round tower. `count` merlons, each `mw`
 * square and `mh` tall, oriented tangentially.
 */
export function merlonRing(radius: number, z: number, count: number, mw: number, mh: number, material: MaterialKey): Mesh {
  const parts: Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const m = rotateZ(translate(box([mw, mw, mh], material), [-mw / 2, -mw / 2, 0]), a);
    parts.push(translate(m, [Math.cos(a) * radius, Math.sin(a) * radius, z]));
  }
  return merge(...parts);
}

/**
 * Four windmill SAILS as flat blade plates arranged as an X **in the view
 * plane**, so from the fixed dimetric camera all four arms read undistorted (not
 * foreshortened to a line). The two in-plane axes are the world directions that
 * project to pure screen-horizontal (`u`) and pure screen-vertical (`v`); each
 * blade lies in the u–v plane, whose normal is the view direction (1,1,1) — so
 * the whole cross faces the camera flat. Hub at the origin; translate onto the
 * mill's front (proud of the tower so no arm tucks behind the cap). `phase`
 * spins the cross; the base frame uses phase 0 (a 45° X).
 */
export function windmillSails(len: number, phase: number, material: MaterialKey): Mesh {
  const u = normalize([1, -1, 0]);       // → pure screen +x
  const v = normalize([1, 1, -2]);       // → pure screen +y (down)
  const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
  const lin = (s: number, t: number): Vec3 => add(mul(u, s), mul(v, t)); // s·u + t·v
  const inner = 0.14, halfW = 0.15;
  const parts: Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const th = phase + Math.PI / 4 + i * (Math.PI / 2);
    const dc = Math.cos(th), ds = Math.sin(th);
    // arm direction d and in-plane perpendicular p (both in the u–v view plane)
    const a = add(lin(dc * inner, ds * inner), lin(-ds * halfW, dc * halfW));
    const b = add(lin(dc * len, ds * len), lin(-ds * halfW, dc * halfW));
    const c = add(lin(dc * len, ds * len), lin(ds * halfW, -dc * halfW));
    const e = add(lin(dc * inner, ds * inner), lin(ds * halfW, -dc * halfW));
    // wound a→e→c→b so the face normal points toward the camera (+view)
    parts.push(quad(a, e, c, b, material));
  }
  return merge(...parts);
}
