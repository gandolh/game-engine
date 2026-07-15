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
  /** EDG hex color of the overlay (parsed to RGB floats on the CPU). */
  color: string;
  coverage: number;
  driftSpeed: number;
  timeSec: number;
  /**
   * Overlay mode. `"shadow"` (default) draws dark cloud-shadow blobs (premultiplied
   * source-over darkening). `"haze"` draws a light, warm low-alpha veil that LIFTS
   * toward `color` (cozy morning mist) — same fBm/quantization, opposite polarity.
   */
  mode?: "shadow" | "haze";
  /**
   * Optional soft radial vignette strength in [0..1] (0 = off). Darkens the screen
   * corners toward `color` for cozy framing. Folded into the same pass so it costs
   * no extra draw. Quantized to keep the pixel-art read.
   */
  vignette?: number;
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
   * Set the fBm cloud-shadow / warm-haze overlay for the NEXT `endFrame`. The
   * overlay is drawn (world-anchored, below the wash) only when `coverage > 0.001`,
   * and the options are consumed each frame (re-set per frame to keep it on).
   * Optional: only the WebGPU backend implements it — Canvas2D omits it, so
   * callers should invoke it via optional-call (`renderer.setCloudOptions?.(…)`).
   */
  setCloudOptions?(opts: CloudOptions): void;

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

  /**
   * Dev-only profiling seam for the screen-space UI flush. When `profileUi` is set
   * true by the host, `endFrame()` records the wall-clock ms spent rasterizing the
   * UI quad list plus the quad count into `lastUiFlush`. Optional: backends may omit
   * it (zero overhead when unset or false); it must never affect rendered output.
   */
  profileUi?: boolean;
  lastUiFlush?: { ms: number; quads: number };

  endFrame(
    wash?: WashOptions,
    particles?: ParticleSystem,
    weather?: WeatherLike,
    overlay?: OverlayFn,
  ): void;
}
