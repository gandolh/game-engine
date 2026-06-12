import type { RendererLike } from "@engine/core";
import type { NoiseGenerator } from "@engine/core";
import { makeGroundNoiseDecorator, GROUND_NOISE_AMPLITUDE } from "../render/ground-noise";
import { makeWaterDepthDecorator } from "../render/water-depth";
import { makeShoreDescentDecorator } from "../render/shore-descent";
import { TILE } from "./config";
import type { SimClient } from "../worker/sim-client";
import type { AmbientLayer } from "./ambient";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@farm/sim-core/world/regions";
import { oceanGradientAt } from "@farm/sim-core/render-systems";

/**
 * Build the per-tile depth mask for the GPU water pass (brief 13 follow-up: wide gradient).
 * Returns a Uint8Array of tilesX × tilesY bytes.
 *
 * Each byte encodes a normalized shore-proximity value (0..255):
 *   255 = ocean tile immediately adjacent to land
 *   0   = land tile, out-of-grid, or ≥ GRADIENT_DEPTH_MAX tiles from any land
 *
 * The field comes from `oceanGradientAt` (sim-core render-systems geometry — the wide
 * GRADIENT_DEPTH_MAX=14 sibling of oceanDepthAt). This was briefly an inlined BFS copy while
 * the change was developed in a worktree (cross-package exports lag there); unified post-merge.
 */
function buildDepthMask(tilesX: number, tilesY: number): Uint8Array {
  const data = new Uint8Array(tilesX * tilesY);
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      data[ty * tilesX + tx] = Math.round(oceanGradientAt(tx, ty) * 255);
    }
  }
  return data;
}

/**
 * Type guard: true when renderer exposes setWaterDepthMask (WebGPU backend, brief 13).
 * Canvas2D renderer does not implement it — depth is baked into the static layer there.
 * Using a local interface + type guard avoids requiring RendererLike to declare this
 * method, since the RendererLike contract is resolved through the shared node_modules
 * at typecheck time and may lag the engine worktree.
 */
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

// Bake static-layer sprites once; JS fBm ground noise bypasses WASM (per-cell
// hash, not fBm). noiseGen param kept for signature compatibility but unused.
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
  // Combined post-bake pass: per-tile ground brightness, the sandy-shore descent darkening on the
  // land side of beaches, then the coastal shallow-water tint over ocean (land slope → water shallows).
  const decorate = (ctx: Parameters<typeof groundNoise>[0], w: number, h: number): void => {
    groundNoise(ctx, w, h);
    shoreDescent(ctx, w, h);
    waterDepth(ctx, w, h);
  };
  client.onStaticLayer((msg) => {
    renderer.bakeStaticLayer(
      msg.sprites,
      msg.worldWidthPx,
      msg.worldHeightPx,
      decorate,
    );
    // pixelScale 3: chunky wave pixels survive downscale at low zoom.
    renderer.bakeWaterPattern("tile/ocean", "terrain", TILE, 3);

    // Brief 13 follow-up: upload the wide shore-proximity gradient as the GPU depth mask.
    // Only the WebGPU renderer supports this; Canvas2D bakes depth into the static layer.
    if (supportsDepthMask(renderer)) {
      const maskData = buildDepthMask(WORLD_WIDTH, WORLD_HEIGHT);
      renderer.setWaterDepthMask(
        maskData,
        WORLD_WIDTH,
        WORLD_HEIGHT,
        WORLD_WIDTH * TILE,
        WORLD_HEIGHT * TILE,
        TILE,
      );
    }

    ambient.init(msg.sprites, seed);
    onBaked?.();
  });
}
