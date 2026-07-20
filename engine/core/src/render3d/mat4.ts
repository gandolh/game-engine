/**
 * Column-major 4x4 matrix math (WebGPU/WGSL convention: a `mat4x4<f32>` is
 * four columns; a `Float32Array` of length 16 lays them out column-by-column,
 * i.e. `data[col*4 + row]`). This is the layout 08b (the WebGPU render layer)
 * uploads directly as a uniform, so no transpose is needed at the GPU boundary.
 *
 * Right-handed view space (camera looks down -z), WebGPU/D3D clip-space depth
 * range z ∈ [0, 1] (NOT OpenGL's [-1, 1] — see {@link perspective}).
 *
 * Pure + deterministic: no RNG, no clock, no globals.
 */
import type { Vec3 } from "./types";
import { cross, dot, normalize, sub } from "./geometry";

/** A 4x4 matrix, column-major, 16 floats: `data[col*4 + row]`. */
export type Mat4 = Float32Array;

/** The 4x4 identity matrix. */
export function identity(): Mat4 {
  // prettier-ignore
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

/** `a * b` (apply `b` first, then `a` — standard column-vector convention:
 *  `(a*b) * v == a * (b * v)`). Column-major: `out[col*4+row] = Σ_k a[k*4+row] * b[col*4+k]`. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += (a[k * 4 + row] as number) * (b[col * 4 + k] as number);
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/**
 * Right-handed perspective projection with WebGPU/D3D clip-space depth range
 * z ∈ [0, 1] (the "zero-to-one" convention — NOT OpenGL's [-1, 1]). At the
 * near plane, view-space z=-near maps to NDC z=0; at the far plane,
 * view-space z=-far maps to NDC z=1. This is the #1 correctness trap when
 * porting OpenGL-style perspective formulas — verified by a dedicated test.
 *
 * Standard "perspectiveZO" derivation (e.g. gl-matrix `perspectiveZO`):
 *   f = cot(fovy/2)
 *   [ f/aspect  0   0              0            ]
 *   [ 0         f   0              0            ]
 *   [ 0         0   far/(near-far) far*near/(near-far) ]
 *   [ 0         0  -1              0            ]
 */
export function perspective(fovyRadians: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovyRadians / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = far * nf;
  out[11] = -1;
  out[14] = far * near * nf;
  return out;
}

/**
 * Right-handed view matrix looking from `eye` toward `target`, with `up` as
 * the world up-hint. The camera's local -z axis points toward `target`.
 * Standard gl-matrix-style `lookAt` derivation:
 *   zAxis = normalize(eye - target)         // points away from target
 *   xAxis = normalize(cross(up, zAxis))
 *   yAxis = cross(zAxis, xAxis)
 *   R = [xAxis yAxis zAxis]^T (rows), translation = -R·eye
 */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const zAxis = normalize(sub(eye, target));
  let xAxis = normalize(cross(up, zAxis));
  // Degenerate guard: up parallel to zAxis (looking straight along `up`).
  if (xAxis[0] === 0 && xAxis[1] === 0 && xAxis[2] === 0) {
    xAxis = normalize(cross([0, 0, 1], zAxis));
  }
  const yAxis = cross(zAxis, xAxis);
  const out = new Float32Array(16);
  out[0] = xAxis[0]; out[1] = yAxis[0]; out[2] = zAxis[0]; out[3] = 0;
  out[4] = xAxis[1]; out[5] = yAxis[1]; out[6] = zAxis[1]; out[7] = 0;
  out[8] = xAxis[2]; out[9] = yAxis[2]; out[10] = zAxis[2]; out[11] = 0;
  out[12] = -dot(xAxis, eye);
  out[13] = -dot(yAxis, eye);
  out[14] = -dot(zAxis, eye);
  out[15] = 1;
  return out;
}

/** Build a translation matrix for `v`. */
export function translation(v: Vec3): Mat4 {
  const out = identity();
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  return out;
}

/** Build a (possibly non-uniform) scaling matrix for `v`. */
export function scaling(v: Vec3): Mat4 {
  const out = identity();
  out[0] = v[0];
  out[5] = v[1];
  out[10] = v[2];
  return out;
}

/** Build a rotation matrix about the world +z axis (through the origin) by
 *  `rad`, for the z-up world convention this module assumes throughout
 *  (matches `geometry.ts#rotateZ`'s per-mesh rotation, but as a composable
 *  `Mat4` for building instance MODEL matrices instead of baking the
 *  rotation into vertex positions). */
export function rotationZ(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const out = identity();
  out[0] = c;
  out[1] = s;
  out[4] = -s;
  out[5] = c;
  return out;
}

/**
 * Full 4x4 inverse via cofactor expansion (classic adjugate/determinant
 * method — the standard approach used by gl-matrix's `mat4.invert`). Needed
 * to unproject screen-space rays in {@link ./pick}. Returns the identity if
 * `m` is singular (determinant ≈ 0) rather than dividing by zero, since a
 * silent NaN matrix is a worse failure mode for a headless-tested library.
 */
export function invert(m: Mat4): Mat4 {
  const m00 = m[0] as number, m01 = m[1] as number, m02 = m[2] as number, m03 = m[3] as number;
  const m10 = m[4] as number, m11 = m[5] as number, m12 = m[6] as number, m13 = m[7] as number;
  const m20 = m[8] as number, m21 = m[9] as number, m22 = m[10] as number, m23 = m[11] as number;
  const m30 = m[12] as number, m31 = m[13] as number, m32 = m[14] as number, m33 = m[15] as number;

  const b00 = m00 * m11 - m01 * m10;
  const b01 = m00 * m12 - m02 * m10;
  const b02 = m00 * m13 - m03 * m10;
  const b03 = m01 * m12 - m02 * m11;
  const b04 = m01 * m13 - m03 * m11;
  const b05 = m02 * m13 - m03 * m12;
  const b06 = m20 * m31 - m21 * m30;
  const b07 = m20 * m32 - m22 * m30;
  const b08 = m20 * m33 - m23 * m30;
  const b09 = m21 * m32 - m22 * m31;
  const b10 = m21 * m33 - m23 * m31;
  const b11 = m22 * m33 - m23 * m32;

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 1e-12) return identity();
  const invDet = 1 / det;

  const out = new Float32Array(16);
  out[0] = (m11 * b11 - m12 * b10 + m13 * b09) * invDet;
  out[1] = (m02 * b10 - m01 * b11 - m03 * b09) * invDet;
  out[2] = (m31 * b05 - m32 * b04 + m33 * b03) * invDet;
  out[3] = (m22 * b04 - m21 * b05 - m23 * b03) * invDet;
  out[4] = (m12 * b08 - m10 * b11 - m13 * b07) * invDet;
  out[5] = (m00 * b11 - m02 * b08 + m03 * b07) * invDet;
  out[6] = (m32 * b02 - m30 * b05 - m33 * b01) * invDet;
  out[7] = (m20 * b05 - m22 * b02 + m23 * b01) * invDet;
  out[8] = (m10 * b10 - m11 * b08 + m13 * b06) * invDet;
  out[9] = (m01 * b08 - m00 * b10 - m03 * b06) * invDet;
  out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * invDet;
  out[11] = (m21 * b02 - m20 * b04 - m23 * b00) * invDet;
  out[12] = (m11 * b07 - m10 * b09 - m12 * b06) * invDet;
  out[13] = (m00 * b09 - m01 * b07 + m02 * b06) * invDet;
  out[14] = (m31 * b01 - m30 * b03 - m32 * b00) * invDet;
  out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * invDet;
  return out;
}

/** Transform a point `p` (implicit w=1) by `m`, then perspective-divide by the
 *  resulting w. */
export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const x = p[0], y = p[1], z = p[2];
  const rx = (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number);
  const ry = (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number);
  const rz = (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number);
  const rw = (m[3] as number) * x + (m[7] as number) * y + (m[11] as number) * z + (m[15] as number);
  if (rw === 0) return [rx, ry, rz];
  const invW = 1 / rw;
  return [rx * invW, ry * invW, rz * invW];
}
