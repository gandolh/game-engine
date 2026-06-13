export { Camera2D, MIN_ZOOM, MAX_ZOOM, expSmooth } from "./camera";
export type { CameraConfig } from "./camera";
export { Canvas2dRenderer } from "./canvas2d";
export type { Canvas2dSprite } from "./canvas2d";
export { ParticleSystem } from "./particles";
export type { ParticleEmitOptions, ParticleShape } from "./particles";
export { RainField } from "./rain-field";
export type { RainFieldConfig, RainViewRect, WeatherKind } from "./rain-field";
export {
  EDG32,
  EDG,
  EDG32_SET,
  isEdg32,
  normalizeHex,
  rgbOf,
  nearestEdg32,
} from "./palette";
export type { Edg32Color } from "./palette";
// WebGPU renderer interface, factory, and associated types (Wave 0)
// NOTE: WebGpuRenderer is NOT exported here — it stays behind a dynamic import in
// create-renderer.ts so it is never pulled into the Canvas2D/test bundle.
// NOTE: `Sprite` is intentionally NOT re-exported here because the root barrel
// (src/index.ts) does `export * from "./render"` and `export * from "./ecs"`, and
// the ECS module already exports a different `Sprite` component type — re-exporting
// both would cause a TS2308 ambiguity error. Consumers that need the render Sprite
// type should import from "@engine/core/render" or from the renderer module directly.
export type { RendererLike, WashOptions, WeatherLike, DecorateFn, CloudOptions, OverlayFn } from "./renderer";
export type { Ctx2D } from "./canvas2d/types";
export { createRenderer } from "./create-renderer";
export type { CreateRendererOptions } from "./create-renderer";
