export { Camera2D, MIN_ZOOM, MAX_ZOOM, expSmooth } from "./camera";
export type { CameraConfig } from "./camera";
export type { Sprite, Ctx2D } from "./sprite-types";
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

export type { RendererLike, WashOptions, WeatherLike, DecorateFn, CloudOptions, OverlayFn, UIQuad } from "./renderer";
export type { ViewUniform } from "./view-uniform";
export { drawUIQuad } from "./ui-draw";
export { showUnsupportedNotice, WEBGL2_UNAVAILABLE_MESSAGE } from "./unsupported-notice";
export type { UnsupportedNoticeColors } from "./unsupported-notice";
export { resolveStaticRegion, staticBlitRect } from "./static-region";
export type { StaticRegion, StaticBlit } from "./static-region";
// TYPE-ONLY on purpose: a value export would statically pull the WebGL2 passes — and
// their `*.glsl?raw` imports — into every consumer of this barrel, including the Node
// servers and headless tools, which crash on `.glsl`. Renderers are constructed
// through `createRenderer`, which imports the module dynamically.
export type { WebGl2Renderer } from "./webgl2/renderer";
export { createRenderer } from "./create-renderer";
export type { CreateRendererOptions } from "./create-renderer";
