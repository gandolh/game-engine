import type { DecorateFn, RendererLike } from "@engine/core";
import type { NoiseGenerator } from "@engine/core";
import { EDG } from "@engine/core";
import type { Sprite } from "@engine/core/render";
import { makeGroundNoiseDecorator, GROUND_NOISE_AMPLITUDE, tileBrightness } from "../render/ground-noise";
import { makeWaterDepthDecorator, SPECKLE, SPECKLE_PX, SPECKLE_COLOR_SEED } from "../render/water-depth";
import { makeShoreDescentDecorator, BAND_ALPHA, oceanDir } from "../render/shore-descent";
import { TILE } from "./config";
import type { SimClient } from "../net/sim-client";
import type { AmbientLayer } from "./ambient";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@farm/sim-core/world/regions";
import { oceanGradientAt, oceanDepthAt, COAST_DEPTH_MAX, SAND_SHORES } from "@farm/sim-core/render-systems";

function buildDepthMask(tilesX: number, tilesY: number): Uint8Array {
  const data = new Uint8Array(tilesX * tilesY);
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      data[ty * tilesX + tx] = Math.round(oceanGradientAt(tx, ty) * 255);
    }
  }
  return data;
}

interface RendererWithDepthMask {
  setWaterDepthMask(
    data: Uint8Array,
    tilesX: number,
    tilesY: number,
    worldWidthPx: number,
    worldHeightPx: number,
    tilePxSize: number,
  ): void;
}
function supportsDepthMask(r: RendererLike): r is RendererLike & RendererWithDepthMask {
  return typeof (r as Partial<RendererWithDepthMask>).setWaterDepthMask === "function";
}

/**
 * `?tilechunks` (corpus brief 21, a spike): the ground is drawn as tile chunks from the atlas instead of
 * one baked image. Read in production builds too, so a deployed build can be compared on a real device.
 */
export function tileChunksRequested(search: string = typeof location !== "undefined" ? location.search : ""): boolean {
  return new URLSearchParams(search).has("tilechunks");
}

// The engine's TileChunkDecor and TileChunkStats, declared here structurally: the renderer's hook is not on
// RendererLike, so it is feature-detected like the depth mask above.
interface TileChunkDecorInput {
  tilesX: number;
  tilesY: number;
  ground: Uint8Array;
  shade: Float32Array;
  shadeDark: string;
  shadeLight: string;
  edges: Uint8Array;
  edgeColor: string;
  edgeBandPx: number;
  edgeBandAlphas: readonly number[];
  speckle: Uint8Array;
  speckleClasses: readonly { density: number; alpha: number; colors: readonly [string, string] }[];
  specklePx: number;
  speckleSeed: number;
  speckleColorSeed: number;
}

interface TileChunkStatsView {
  readonly chunks: number;
  readonly instances: number;
  readonly decorInstances: number;
  readonly bufferBytes: number;
  readonly buildMs: number;
  readonly lastChunks: number;
  readonly lastDraws: number;
  readonly lastInstances: number;
  readonly lastMs: number;
}

interface RendererWithTileChunks {
  bakeTileChunks(
    sprites: readonly Sprite[],
    worldWidth: number,
    worldHeight: number,
    tileSize: number,
    decor?: TileChunkDecorInput,
  ): { readonly stats: TileChunkStatsView };
}
function supportsTileChunks(r: RendererLike): r is RendererLike & RendererWithTileChunks {
  return typeof (r as Partial<RendererWithTileChunks>).bakeTileChunks === "function";
}

/** Bit per edge, as the chunk shader reads it: 1 top, 2 right, 4 bottom, 8 left. */
function edgeBit(rotation: number): number {
  const { dx, dy } = oceanDir(rotation);
  if (dy === -1) return 1;
  if (dy === 1) return 4;
  if (dx === 1) return 2;
  return 8;
}

/**
 * What the three decorators paint, per tile, for the chunk shader: the ground noise's shade, the shore
 * descent's edges and the water depth's speckle class. The same functions and constants as the bake.
 */
export function buildTileChunkDecor(sprites: readonly Sprite[], seed: number): TileChunkDecorInput {
  const n = WORLD_WIDTH * WORLD_HEIGHT;
  const ground = new Uint8Array(n);
  const shade = new Float32Array(n);
  const edges = new Uint8Array(n);
  const speckle = new Uint8Array(n);
  for (const s of sprites) {
    // Layer 0 is the backdrop: one opaque ground tile per walkable tile (iterStaticSprites).
    if (s.layer === 0) ground[Math.floor(s.y / TILE) * WORLD_WIDTH + Math.floor(s.x / TILE)] = 1;
  }
  const speckleClasses: { density: number; alpha: number; colors: readonly [string, string] }[] = [];
  const classOfDepth = new Map<number, number>();
  SPECKLE.forEach((spec, depth) => {
    if (!spec) return;
    const [a, b] = spec.colors;
    if (a === undefined || b === undefined || spec.colors.length !== 2) {
      throw new Error("tile chunks: a speckle class needs exactly two colours");
    }
    speckleClasses.push({ density: spec.density, alpha: spec.alpha, colors: [a, b] });
    classOfDepth.set(depth, speckleClasses.length);
  });
  if (speckleClasses.length > 2) throw new Error("tile chunks: the shader takes at most two speckle classes");
  for (let ty = 0; ty < WORLD_HEIGHT; ty++) {
    for (let tx = 0; tx < WORLD_WIDTH; tx++) {
      const t = ty * WORLD_WIDTH + tx;
      shade[t] = tileBrightness(tx, ty, seed, GROUND_NOISE_AMPLITUDE) - 1;
      const d = oceanDepthAt(tx, ty);
      if (d > 0 && d <= COAST_DEPTH_MAX) speckle[t] = classOfDepth.get(d) ?? 0;
    }
  }
  for (const s of SAND_SHORES) {
    const t = s.ty * WORLD_WIDTH + s.tx;
    edges[t] = (edges[t] ?? 0) | edgeBit(s.rotation);
  }
  return {
    tilesX: WORLD_WIDTH,
    tilesY: WORLD_HEIGHT,
    ground,
    shade,
    shadeDark: EDG.black,
    shadeLight: EDG.white,
    edges,
    edgeColor: EDG.skinMid,
    edgeBandPx: Math.max(1, Math.round(TILE / 8)),
    edgeBandAlphas: BAND_ALPHA,
    speckle,
    speckleClasses,
    specklePx: SPECKLE_PX,
    speckleSeed: seed >>> 0,
    speckleColorSeed: (seed ^ SPECKLE_COLOR_SEED) >>> 0,
  };
}

/** The chunk pass's numbers for the profile, under `?tilechunks`. */
export interface TileChunkProfile {
  stats: TileChunkStatsView;
  /** CPU ms of the last `buildTileChunkDecor`. */
  decorMs: number;
}

let tileChunkProfileNow: TileChunkProfile | null = null;

/** The chunk pass's numbers, or null when the ground is baked (no `?tilechunks`). */
export function tileChunkProfile(): TileChunkProfile | null {
  return tileChunkProfileNow;
}

export function bakeStaticLayer(
  client: SimClient,
  renderer: RendererLike,
  _noiseGen: NoiseGenerator | null,
  seed: number,
  ambient: AmbientLayer,
  onBaked?: () => void,
): void {
  const groundNoise = makeGroundNoiseDecorator(seed, TILE, GROUND_NOISE_AMPLITUDE);
  const shoreDescent = makeShoreDescentDecorator(TILE);
  const waterDepth = makeWaterDepthDecorator(TILE, seed);

  // Each decorator paints only the tiles of the region being baked (the whole world, or one
  // patch when the static layer is patched).
  const decorate: DecorateFn = (ctx, w, h, region) => {
    groundNoise(ctx, w, h, region);
    shoreDescent(ctx, w, h, region);
    waterDepth(ctx, w, h, region);
  };
  const chunked = tileChunksRequested() && supportsTileChunks(renderer) ? renderer : null;
  client.onStaticLayer((msg) => {
    if (chunked !== null) {
      const t0 = performance.now();
      const decor = buildTileChunkDecor(msg.sprites, seed);
      const decorMs = performance.now() - t0;
      const pass = chunked.bakeTileChunks(msg.sprites, msg.worldWidthPx, msg.worldHeightPx, TILE, decor);
      tileChunkProfileNow = { stats: pass.stats, decorMs };
    } else {
      renderer.bakeStaticLayer(msg.sprites, msg.worldWidthPx, msg.worldHeightPx, decorate);
    }

    renderer.bakeWaterPattern("tile/ocean", "terrain", TILE, 3);

    if (supportsDepthMask(renderer)) {
      const maskData = buildDepthMask(WORLD_WIDTH, WORLD_HEIGHT);
      renderer.setWaterDepthMask(maskData, WORLD_WIDTH, WORLD_HEIGHT, WORLD_WIDTH * TILE, WORLD_HEIGHT * TILE, TILE);
    }

    ambient.init(msg.sprites, seed);
    onBaked?.();
  });
}
