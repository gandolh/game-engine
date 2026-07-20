/**
 * Public surface of the engine's generic DYNAMIC-collision module — the
 * moving-body complement to `placement/index.ts`'s static footprint grid.
 * Pure math, game-agnostic, deterministic (no RNG, no wall-clock reads).
 */
export { SpatialHash } from "./spatial-hash";

export type { AABB, SeparateBody, SeparateOptions } from "./separate";
export { circlesOverlap, aabbOverlap, separateCircles } from "./separate";
