import { Canvas2dRenderer } from "@engine/core";
import type { NoiseGenerator } from "@engine/core";
import { makeGroundNoiseDecorator } from "../render/ground-noise";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../world/regions";
import { TILE } from "./config";
import type { SimClient } from "../worker/sim-client";

// ── Static-layer bake ────────────────────────────────────────────────────────

// Receive the static-layer sprites from the worker and bake them once.
// brief 30 — stamp subtle per-tile ground-noise into the baked layer
// (one-time cost, deterministic on the run seed).
// Pre-generate brightness array via WASM (8× faster than JS hash loop).
// Falls back to JS path if WASM didn't load.
export function bakeStaticLayer(
  client: SimClient,
  renderer: Canvas2dRenderer,
  noiseGen: NoiseGenerator | null,
  seed: number,
): void {
  const wasmBrightness = noiseGen
    ? noiseGen.fillNoise(
        Math.ceil(WORLD_WIDTH * TILE / TILE),  // cols = WORLD_WIDTH
        Math.ceil(WORLD_HEIGHT * TILE / TILE), // rows = WORLD_HEIGHT
        seed,
        0.12, // GROUND_NOISE_AMPLITUDE
      )
    : undefined;
  const groundNoise = makeGroundNoiseDecorator(seed, TILE, 0.12, wasmBrightness);
  client.onStaticLayer((msg) => {
    renderer.bakeStaticLayer(
      msg.sprites,
      msg.worldWidthPx,
      msg.worldHeightPx,
      groundNoise,
    );
    // Animated water surface tiles the ocean frame under the (ocean-less) static
    // layer. Baked here once the atlas + world size are known. pixelScale 3 →
    // chunky 3×-bigger wave pixels that survive the downscale when zoomed out
    // (at zoom 0.5 a 1px ripple aliases into noise; a 3px one still reads).
    renderer.bakeWaterPattern("tile/ocean", "terrain", TILE, 3);
  });
}
