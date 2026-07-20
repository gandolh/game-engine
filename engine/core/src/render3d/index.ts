/**
 * Public surface of the engine's pure 3D layer: mesh geometry, column-major
 * mat4 math, an orbit camera, and screen-ray picking. Entirely headless/pure
 * — no GPU/WebGPU code lives here (that's a separate subsystem that consumes
 * these types).
 */
export type { Vec3, Tri, Mesh } from "./types";

export {
  add,
  sub,
  cross,
  dot,
  normalize,
  translate,
  scale,
  rotateX,
  rotateY,
  rotateZ,
  merge,
  boundsOf,
  quad,
  box,
  cylinder,
  cone,
  pyramid,
  gable,
  disc,
} from "./geometry";

export type { Mat4 } from "./mat4";
export {
  identity,
  multiply,
  perspective,
  lookAt,
  invert,
  transformPoint,
  translation,
  scaling,
} from "./mat4";

export { OrbitCamera } from "./camera3d";
export type { OrbitCameraConfig } from "./camera3d";

export type { Ray } from "./pick";
export {
  rayFromScreen,
  rayIntersectAABB,
  rayIntersectTriangle,
  pickNearest,
} from "./pick";
