import type { Camera2D } from "./camera";
import type { LoadedAtlasImage } from "../assets/loader";
import type { ParticleSystem } from "./particles";
import type { Canvas2dSprite, Ctx2D } from "./canvas2d/types";

/** A sprite to draw. Alias kept stable; canonical shape lives in canvas2d/types.ts. */
export type Sprite = Canvas2dSprite;

export interface WashOptions { color: string; alpha: number; }
export interface WeatherLike { count: number; draw(ctx: Ctx2D): void; }
export type DecorateFn = (ctx: Ctx2D, widthPx: number, heightPx: number) => void;

/**
 * Options for the GPU cloud-shadow overlay (brief 15).
 * `color` must be an EDG hex string (e.g. EDG.ink); parsed to RGB floats on the CPU.
 * `coverage` in [0..1]: 0 = clear sky, 1 = full overcast.
 * `driftSpeed` in world px/s: horizontal cloud scroll rate (vertical is 38% of this).
 * `timeSec`: wall-clock seconds, drives the fBm animation phase.
 */
export interface CloudOptions {
  color: string;
  coverage: number;
  driftSpeed: number;
  timeSec: number;
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
  ): void;
  bakeWaterPattern(frame: string, atlasId: string, tileSize: number, pixelScale?: number): void;
  setWaterScroll(offsetX: number, offsetY: number): void;
  setWaterSwell(alpha: number, offsetX: number, offsetY: number): void;
  /**
   * Upload a per-tile depth mask for shore foam and caustics (brief 13).
   * No-op on the Canvas2D backend (depth is already baked into the static layer there).
   *
   * @param data          - Uint8Array, tilesX × tilesY, each byte = depth/COAST_DEPTH_MAX × 255.
   * @param tilesX        - Tile grid width.
   * @param tilesY        - Tile grid height.
   * @param worldWidthPx  - Full world width in world pixels.
   * @param worldHeightPx - Full world height in world pixels.
   * @param tilePxSize    - Tile size in world pixels.
   */
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
  endFrame(wash?: WashOptions, particles?: ParticleSystem, weather?: WeatherLike): void;
}
