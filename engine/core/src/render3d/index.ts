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
  rotationZ,
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

// --- 3D buffer packing (pure, backend-agnostic) -------------------------
// CPU-side packing shared by both the WebGPU and WebGL2 3D backends — no
// GPU calls, fully unit-tested (buffers.test.ts). See its module doc for the
// material-key -> index ordering contract.
export type { Material, InstanceInput } from "./buffers";
export {
  FLOATS_PER_VERTEX,
  FLOATS_PER_INSTANCE,
  FLOATS_PER_MATERIAL,
  materialIndexMap,
  packMesh,
  packInstance,
  packInstances,
  packMaterials,
  instanceAABB,
} from "./buffers";

// --- WebGPU 3D render layer (08b) ---------------------------------------
// GPU orchestration (device3d.ts, pipeline-cache.ts, renderer3d.ts) is
// thin/typecheck-only — WebGPU cannot run headless here.

export { Device3d, createDevice3d } from "./webgpu/device3d";

export { PipelineCache } from "./webgpu/pipeline-cache";
export type { Pipeline3d } from "./webgpu/pipeline-cache";

export { SceneRenderer3D, MeshHandle } from "./webgpu/renderer3d";
export type { DrawCall3d, Frame3d, SceneRendererOptions } from "./webgpu/renderer3d";
