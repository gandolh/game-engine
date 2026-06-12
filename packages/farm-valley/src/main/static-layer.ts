import type { RendererLike } from "@engine/core";
import type { NoiseGenerator } from "@engine/core";
import { makeGroundNoiseDecorator, GROUND_NOISE_AMPLITUDE } from "../render/ground-noise";
import { makeWaterDepthDecorator } from "../render/water-depth";
import { makeShoreDescentDecorator } from "../render/shore-descent";
import { TILE } from "./config";
import type { SimClient } from "../worker/sim-client";
import type { AmbientLayer } from "./ambient";

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
    ambient.init(msg.sprites, seed);
    onBaked?.();
  });
}
