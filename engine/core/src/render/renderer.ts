import type { Camera2D } from "./camera";
import type { LoadedAtlasImage } from "../assets/loader";
import type { ParticleSystem } from "./particles";
import type { Canvas2dSprite, Ctx2D } from "./canvas2d/types";
import type { StaticRegion } from "./static-region";

export type Sprite = Canvas2dSprite;

export interface WashOptions { color: string; alpha: number; }
export interface WeatherLike { count: number; draw(ctx: Ctx2D): void; }
export type DecorateFn = (ctx: Ctx2D, widthPx: number, heightPx: number) => void;

export type OverlayFn = (
  ctx: Ctx2D,
  transform: { sx: number; sy: number; ox: number; oy: number },
) => void;

export interface CloudOptions {
  color: string;
  coverage: number;
  driftSpeed: number;
  timeSec: number;
}

/**
 * A single screen-space UI draw primitive.
 *
 * Coordinates are **CSS screen pixels** with the origin at the top-left of the
 * canvas client box, y growing downward. They are NOT transformed by the world
 * `Camera2D` — a quad at `{x:0,y:0}` always lands in the canvas's top-left corner
 * regardless of camera pan/zoom. Backends scale by device-pixel-ratio internally,
 * so callers always author in logical (CSS) pixels.
 *
 * A quad is either:
 *   - a **textured** quad — supply `atlasId` + `frame`; the atlas frame is blitted
 *     into the destination rect and multiplied by `tint`/`alpha`, or
 *   - a **solid color** quad — omit `atlasId`/`frame`; the rect is filled with `color`.
 *
 * Exactly one of (`atlasId` + `frame`) or `color` should be provided. If both are
 * absent the quad is a no-op; if `color` is given alongside a texture it is ignored.
 */
export interface UIQuad {
  /** Left edge in CSS screen pixels (origin top-left). */
  x: number;
  /** Top edge in CSS screen pixels (origin top-left). */
  y: number;
  /** Width in CSS screen pixels. */
  width: number;
  /** Height in CSS screen pixels. */
  height: number;

  /** Atlas id for a textured quad. Omit for a solid-color quad. */
  atlasId?: string;
  /** Atlas frame name for a textured quad. Omit for a solid-color quad. */
  frame?: string;

  /**
   * Fill color for a solid-color quad, OR multiplicative tint for a textured quad.
   * Must be an EDG32 palette hex (`EDG.*`). Defaults to white (no tint) for textured
   * quads when omitted; required for solid quads to draw anything.
   */
  color?: string;

  /** Opacity in [0,1]. Defaults to 1. */
  alpha?: number;
}

export interface RendererLike {
  readonly camera: Camera2D;
  clearColor: string;
  pixelSnap: boolean;

  addAtlas(atlas: LoadedAtlasImage): void;
  setAtlas(atlas: LoadedAtlasImage): void;
  getAtlas(id: string): LoadedAtlasImage | undefined;

  bakeStaticLayer(
    sprites: readonly Sprite[],
    worldWidth: number,
    worldHeight: number,
    decorate?: DecorateFn,
    region?: StaticRegion,
  ): void;
  bakeWaterPattern(frame: string, atlasId: string, tileSize: number, pixelScale?: number): void;
  setWaterScroll(offsetX: number, offsetY: number): void;
  setWaterSwell(alpha: number, offsetX: number, offsetY: number): void;

  setWaterDepthMask(
    data: Uint8Array,
    tilesX: number,
    tilesY: number,
    worldWidthPx: number,
    worldHeightPx: number,
    tilePxSize: number,
  ): void;
  clearStaticLayer(): void;

  beginFrame(): void;
  push(sprite: Sprite): void;
  pushShadow(x: number, y: number, rx: number, ry: number, alpha: number): void;

  /**
   * Screen-space UI draw seam.
   *
   * Lifecycle: call `beginUI()` once per frame (after `beginFrame()`), submit any
   * number of `pushUI(quad)` primitives, then `endUI()`. The accumulated draw-list is
   * flushed inside `endFrame()` and rendered ON TOP of the world scene + day/night wash,
   * in submission order (no sorting), in **screen pixels** unaffected by `Camera2D`.
   *
   * If `beginUI()` is never called the UI layer is inert (zero overhead) — Farm's
   * existing render path is unchanged. Submitting via `pushUI` without a `beginUI()`
   * is a no-op. The list is reset at the start of each `beginUI()`.
   *
   * Both backends honour device-pixel-ratio: callers always pass CSS pixels.
   */
  beginUI(): void;
  pushUI(quad: UIQuad): void;
  endUI(): void;

  endFrame(
    wash?: WashOptions,
    particles?: ParticleSystem,
    weather?: WeatherLike,
    overlay?: OverlayFn,
  ): void;
}
