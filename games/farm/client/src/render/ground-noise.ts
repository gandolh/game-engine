

import { EDG } from "@engine/core/render";

// `hash2`, `valueNoise2d` and `fbm` moved to `@engine/core/render` (audit-61). `hash2` was
// byte-identical in two files of THIS package alone (here and `water-depth.ts`). Re-exported so
// this module's existing importers are unaffected.
export { hash2, valueNoise2d, fbm } from "@engine/core/render";
// ...and imported for this module's own use below.
import { fbm } from "@engine/core/render";

export const GROUND_NOISE_AMPLITUDE = 0.12;

const FBM_BASE_FREQUENCY = 1 / 8;
const FBM_OCTAVES = 4;
const FBM_LACUNARITY = 2;
const FBM_GAIN = 0.5;

const WARP_STRENGTH = 1.5;
const WARP_FREQUENCY = 1 / 16;
const WARP_SEED_X = 0x1b873593;
const WARP_SEED_Y = 0xcc9e2d51;
const WARP_OFFSET = 5.2;

export function domainWarp(
  x: number,
  y: number,
  seed: number,
): readonly [number, number] {
  const s = seed >>> 0;
  const dx =
    (fbm(
      x * WARP_FREQUENCY * 8, 
      y * WARP_FREQUENCY * 8,
      (s ^ WARP_SEED_X) >>> 0,
      FBM_OCTAVES,
      FBM_LACUNARITY,
      FBM_GAIN,
    ) *
      2 -
      1) *
    WARP_STRENGTH;
  const dy =
    (fbm(
      (x + WARP_OFFSET) * WARP_FREQUENCY * 8,
      (y + WARP_OFFSET) * WARP_FREQUENCY * 8,
      (s ^ WARP_SEED_Y) >>> 0,
      FBM_OCTAVES,
      FBM_LACUNARITY,
      FBM_GAIN,
    ) *
      2 -
      1) *
    WARP_STRENGTH;
  return [x + dx, y + dy];
}

export function tileBrightness(
  tileX: number,
  tileY: number,
  seed: number,
  amplitude: number = GROUND_NOISE_AMPLITUDE,
): number {
  const s = seed >>> 0;
  const [wx, wy] = domainWarp(
    (tileX | 0) * FBM_BASE_FREQUENCY,
    (tileY | 0) * FBM_BASE_FREQUENCY,
    s,
  );
  const n = fbm(
    wx,
    wy,
    s,
    FBM_OCTAVES,
    FBM_LACUNARITY,
    FBM_GAIN,
  ); 
  return 1 + (n * 2 - 1) * amplitude;
}

type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeGroundNoiseDecorator(
  seed: number,
  tilePx: number,
  amplitude: number = GROUND_NOISE_AMPLITUDE,
  wasmBrightness?: Float32Array,
): (ctx: AnyCtx2D, widthPx: number, heightPx: number) => void {
  return (ctx, widthPx, heightPx) => {
    const cols = Math.ceil(widthPx / tilePx);
    const rows = Math.ceil(heightPx / tilePx);
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const idx = ty * cols + tx;
        const b = (wasmBrightness && idx < wasmBrightness.length)
          ? wasmBrightness[idx]!
          : tileBrightness(tx, ty, seed, amplitude);
        if (b === 1) continue;
        const strength = Math.abs(b - 1) / amplitude;
        ctx.globalAlpha = strength * amplitude;
        if (b < 1) {
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = EDG.black;
        } else {
          ctx.globalCompositeOperation = "screen";
          ctx.fillStyle = EDG.white;
        }
        ctx.fillRect(tx * tilePx, ty * tilePx, tilePx, tilePx);
      }
    }
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prevAlpha;
  };
}
