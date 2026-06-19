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
  endFrame(
    wash?: WashOptions,
    particles?: ParticleSystem,
    weather?: WeatherLike,
    overlay?: OverlayFn,
  ): void;
}
