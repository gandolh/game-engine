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

/**
 * Smooth value noise → [0,1). For fractional `(x, y)`, hash the 4 integer
 * lattice corners with `hash2` and bilinearly interpolate them using a
 * smoothstep fade (`t*t*(3-2t)`) on the fractional parts. Pure.
 *
 * Unlike raw `hash2` — which is uncorrelated between adjacent integer cells —
 * this is spatially coherent, so octaves can be summed into fBm.
 */
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

  // Smoothstep fade: removes the linear-interpolation grid artifacts.
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const top = c00 + (c10 - c00) * ux;
  const bottom = c01 + (c11 - c01) * ux;
  return top + (bottom - top) * uy;
}

/**
 * Fractional Brownian motion → [0,1), normalized. Sums `octaves` of
 * `valueNoise2d` with frequency multiplied by `lacunarity` and amplitude
 * multiplied by `gain` per octave, then divides by the total amplitude so the
 * result stays in [0,1). Each octave uses a distinct seed offset so the
 * lattices don't all align. Pure.
 */
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

/** Maximum fractional brightness swing (±). Small on purpose — texture, not noise. */
export const GROUND_NOISE_AMPLITUDE = 0.12;

// fBm shaping. Base period ~8 tiles → lowest octave varies over meadow/plot-
// sized patches; 4 octaves with lacunarity 2 / gain 0.5 add finer grain on top.
const FBM_BASE_FREQUENCY = 1 / 8;
const FBM_OCTAVES = 4;
const FBM_LACUNARITY = 2;
const FBM_GAIN = 0.5;

/**
 * brief 49 Track 2 — Inigo Quilez domain warping (render-only).
 *
 * Instead of sampling the ground fBm at the raw lattice position, we first
 * displace the sample coordinates by a low-frequency fBm vector field. This
 * bends the patch boundaries so they swirl/marble organically rather than
 * sitting as smooth blobs. See https://iquilezles.org/articles/warp/ — the
 * canonical form is `fbm(p + 4*fbm(p + 4*fbm(p)))`. We deliberately do NOT go
 * that far: our texture is a faint ±0.12 brightness multiply, so a k=4
 * double-recursion would read as a busy lava-lamp. We use a SINGLE warp layer
 * with a modest k, which gives flowing/marbled patches that still preserve
 * spatial coherence (verified by the adjacent<far guard in the tests).
 *
 * Chosen params (organic but subtle — eyeball-tunable later):
 *   - k = WARP_STRENGTH = 1.5 fBm-coordinate units (~12 tiles of max push at
 *     base period 8). Conservative middle of the recommended 1.0–2.0 band.
 *   - warp field frequency = WARP_FREQUENCY = 1/16, i.e. HALF the texture
 *     frequency (1/8). A lower-frequency warp bends whole patches rather than
 *     adding high-frequency jitter — that's what makes it read as marbling.
 *   - recursion depth = 1 (single warp, no nested fbm-of-fbm).
 *   - dx / dy decorrelation: the two offset components are sampled from the
 *     SAME warp fBm but with (a) distinct seed forks (XOR constants) AND (b) a
 *     fixed coordinate offset on the y-sample, so dx !== dy and the warp pushes
 *     in a genuine 2D direction rather than only along the diagonal.
 */
const WARP_STRENGTH = 1.5;
const WARP_FREQUENCY = 1 / 16;
// Decorrelation: distinct seed forks for the two warp components...
const WARP_SEED_X = 0x1b873593;
const WARP_SEED_Y = 0xcc9e2d51;
// ...plus a fixed coordinate offset so the y-sample never collapses onto the
// x-sample even if the forked seeds happened to align at a lattice cell.
const WARP_OFFSET = 5.2;

/**
 * Compute the warped sample coordinates for the ground fBm at `(x, y)` in
 * fBm-coordinate units (i.e. already multiplied by the base frequency). Returns
 * `[wx, wy]`. The offset is `(fbm * 2 - 1) * k` per axis so the warp pushes in
 * BOTH directions and stays bounded by ±k. Pure & deterministic on (x,y,seed).
 */
export function domainWarp(
  x: number,
  y: number,
  seed: number,
): readonly [number, number] {
  const s = seed >>> 0;
  const dx =
    (fbm(
      x * WARP_FREQUENCY * 8, // warp samples at WARP_FREQUENCY in tile-space;
      y * WARP_FREQUENCY * 8, // x/y arrive in fBm units (×1/8), so re-scale.
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

/**
 * Brightness multiplier for the tile at `(tileX, tileY)` — in
 * `[1 - amplitude, 1 + amplitude]`, centered on 1 (no change). Pure.
 *
 * Samples coherent fBm value noise (cloudy, "grown" patches) rather than the
 * old per-tile uncorrelated hash, then maps the [0,1) fBm value to the
 * multiplier with the same formula as before. brief 49 Track 2: the sample
 * coordinates are first domain-warped (see `domainWarp`) so the patches swirl
 * organically instead of reading as smooth blobs.
 */
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
  ); // [0,1)
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
