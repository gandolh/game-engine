/**
 * brief 30 — procedural ground texture.
 *
 * Subtle per-tile brightness variation, baked ONCE into the static layer so it
 * costs nothing per frame. The flat solid-color tiles read as a debug view;
 * a faint value-noise jitter gives grass/dirt/path surface texture without
 * changing the layout, the tile grid, or any sim state.
 *
 * The math (hash-based value noise) is reimplemented in JS, inspired by The
 * Book of Shaders' Random/Noise chapters — NOT copied from it (its code is
 * "all rights reserved"; algorithms aren't copyrightable). This renderer is
 * Canvas2D, not GLSL, so there is no shader here — just a per-tile multiply.
 *
 * Deterministic on `(seed, tileX, tileY)`: the same run (and the same shared
 * run URL) always produces the same ground.
 */

import { EDG } from "@engine/core/render";

/**
 * Deterministic hash → [0,1). Integer cell coords + seed in, fraction out.
 * Uses `Math.imul` for true 32-bit integer multiplies (a plain `*` overflows
 * the 2^53 safe range before truncation and skews the distribution).
 */
function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Maximum fractional brightness swing (±). Small on purpose — texture, not noise. */
export const GROUND_NOISE_AMPLITUDE = 0.12;

/**
 * Brightness multiplier for the tile at `(tileX, tileY)` — in
 * `[1 - amplitude, 1 + amplitude]`, centered on 1 (no change). Pure.
 */
export function tileBrightness(
  tileX: number,
  tileY: number,
  seed: number,
  amplitude: number = GROUND_NOISE_AMPLITUDE,
): number {
  const n = hash2(tileX | 0, tileY | 0, seed >>> 0); // [0,1)
  return 1 + (n * 2 - 1) * amplitude;
}

/**
 * Returns a `decorate` callback for `Canvas2dRenderer.bakeStaticLayer`. It
 * stamps a per-tile darken/lighten overlay across the whole baked layer using
 * `multiply` / `screen` composite ops, then restores `source-over`. Operates
 * on the offscreen layer, so it's a one-time cost.
 */
/** Matches the engine renderer's offscreen 2D context union. */
type AnyCtx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Build the ground decorator. When `wasmBrightness` is provided (a
 * Float32Array from `NoiseGenerator.fillNoise`) it's used directly —
 * the WASM tight-loop is ~8× faster than the per-tile JS hash path.
 * Falls back to `tileBrightness` for tiles outside the array or when
 * no WASM array is supplied.
 */
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
          // multiply by EDG.black darkens; screen by EDG.white lightens.
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
