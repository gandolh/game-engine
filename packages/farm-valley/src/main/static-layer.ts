import { Canvas2dRenderer } from "@engine/core";
import type { NoiseGenerator } from "@engine/core";
import { makeGroundNoiseDecorator, GROUND_NOISE_AMPLITUDE } from "../render/ground-noise";
import { TILE } from "./config";
import type { SimClient } from "../worker/sim-client";

// ── Static-layer bake ────────────────────────────────────────────────────────

// Receive the static-layer sprites from the worker and bake them once.
// brief 30 — stamp subtle per-tile ground-noise into the baked layer
// (one-time cost, deterministic on the run seed).
//
// brief 49 (Track 1) — the ground noise is now coherent fBm computed in JS
// inside ground-noise.ts. We deliberately BYPASS the WASM noise path here (the
// wasm `fillNoise` is per-cell hash, not fBm) by not passing a `wasmBrightness`
// array, so the JS fBm path always runs at bake time. The one-time bake over
// ~88×122 tiles costs a few ms, which is fine. `noiseGen` is still loaded by
// main.ts (kept for other potential consumers) but no longer feeds the ground
// decorator.
export function bakeStaticLayer(
  client: SimClient,
  renderer: Canvas2dRenderer,
  _noiseGen: NoiseGenerator | null,
  seed: number,
): void {
  const groundNoise = makeGroundNoiseDecorator(seed, TILE, GROUND_NOISE_AMPLITUDE);
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
