

import { EDG } from "@engine/core/render";

function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export function valueNoise2d(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;

  const s = seed >>> 0;
  const c00 = hash2(x0, y0, s);
  const c10 = hash2(x0 + 1, y0, s);
  const c01 = hash2(x0, y0 + 1, s);
  const c11 = hash2(x0 + 1, y0 + 1, s);

  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const top = c00 + (c10 - c00) * ux;
  const bottom = c01 + (c11 - c01) * ux;
  return top + (bottom - top) * uy;
}

export function fbm(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  lacunarity: number,
  gain: number,
): number {
  let freq = 1;
  let amp = 1;
  let sum = 0;
  let ampSum = 0;
  const base = seed >>> 0;
  for (let i = 0; i < octaves; i++) {
    const octaveSeed = (base + Math.imul(i, 0x9e3779b1)) >>> 0;
    sum += amp * valueNoise2d(x * freq, y * freq, octaveSeed);
    ampSum += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return ampSum > 0 ? sum / ampSum : 0;
}

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
