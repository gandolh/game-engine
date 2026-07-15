import type { RendererLike } from "@engine/core";
import type { NoiseGenerator } from "@engine/core";
import { makeGroundNoiseDecorator, GROUND_NOISE_AMPLITUDE } from "../render/ground-noise";
import { makeWaterDepthDecorator } from "../render/water-depth";
import { makeShoreDescentDecorator } from "../render/shore-descent";
import { TILE } from "./config";
import type { SimClient } from "../net/sim-client";
import type { AmbientLayer } from "./ambient";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@farm/sim-core/world/regions";
import { oceanGradientAt } from "@farm/sim-core/render-systems";

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

    renderer.bakeWaterPattern("tile/ocean", "terrain", TILE, 3);

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
