/**
 * Value noise, fBm and hillshade — the numeric core, extracted once (audit-61).
 *
 * Everything here is PURE and returns NUMBERS. It maps nothing to colour, reads no palette and
 * knows no game type, so it is genuinely generic and does not strain the engine-never-imports-a-game
 * rule. `games/citadel/client/src/render/hillshade.ts` was already written to exactly that contract
 * and is the model this module follows.
 *
 * ## Two families, deliberately kept apart
 *
 * They are DIFFERENT ALGORITHMS that happen to share a shape, not variants of one. Merging them
 * would change every pixel that uses them, so they are separate exports with separate names:
 *
 * 1. **{@link hash21} / {@link valueNoise21} / {@link fbm3}** — the *shader* family. A
 *    `sin`-based hash, unseeded, 3 fixed octaves. This is the recipe in
 *    `render/webgl2/shaders/cloud.frag.glsl`, which Citadel's `terrain-dither.ts` carries as a
 *    hand-maintained CPU mirror so its ground bake matches the sky above it. That mirror was the
 *    sharpest edge in the sweep: **a correctness coupling maintained by a comment.**
 *    `noise.glsl-parity.test.ts` turns the comment into a gate.
 *
 * 2. **{@link hash2} / {@link valueNoise2d} / {@link fbm}** — the *seeded* family. An integer
 *    bit-mixing hash with a real `seed` parameter and configurable octaves/lacunarity/gain. This is
 *    Farm's ground noise, whose `hash2` was byte-identical in two files of the same package.
 *
 * MateQuest's map screen uses a THIRD hash (`rand01`, combining coordinates with `+` rather than
 * `^` and folding the seed into the coordinates instead of the mix). It is not a copy of either
 * family and is left where it is; only its hillshade is shared, via {@link hillshadeFrom}.
 */

// ---------------------------------------------------------------------------
// 1. The shader family — mirrors cloud.frag.glsl EXACTLY. Do not "improve".
// ---------------------------------------------------------------------------

/**
 * The GLSL constants this family mirrors, named so `noise.glsl-parity.test.ts` can check them
 * against the shader source rather than trusting a comment.
 */
export const SHADER_NOISE_CONSTANTS = {
  /** `dot(coord, vec2(127.1, 311.7))` */
  hashDotX: 127.1,
  hashDotY: 311.7,
  /** `fract(sin(...) * 43758.5453)` */
  hashScale: 43758.5453,
  /** `fbm3` octave count, and its geometric-series normaliser 0.5 + 0.25 + 0.125. */
  octaves: 3,
  fbmNorm: 0.875,
} as const;

/** GLSL `fract` — `x - floor(x)`. Differs from `%` for negatives, which is the point. */
function fract(x: number): number {
  return x - Math.floor(x);
}

/** cloud.frag.glsl `hash21`: a 2D coord → pseudo-random float in [0, 1). */
export function hash21(px: number, py: number): number {
  const { hashDotX, hashDotY, hashScale } = SHADER_NOISE_CONSTANTS;
  return fract(Math.sin(px * hashDotX + py * hashDotY) * hashScale);
}

/**
 * cloud.frag.glsl `valueNoise`: bilinear value noise with cubic-Hermite smoothing
 * (`t*t*(3-2t)` — smoother than linear, and it avoids crease seams).
 */
export function valueNoise21(px: number, py: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const frx = px - ix;
  const fry = py - iy;
  const smx = frx * frx * (3 - 2 * frx);
  const smy = fry * fry * (3 - 2 * fry);
  const a = hash21(ix, iy);
  const b = hash21(ix + 1, iy);
  const c = hash21(ix, iy + 1);
  const d = hash21(ix + 1, iy + 1);
  const top = a + (b - a) * smx;
  const bot = c + (d - c) * smx;
  return top + (bot - top) * smy;
}

/**
 * cloud.frag.glsl `fbm3`: 3 octaves, frequency ×2 and amplitude ÷2 per octave, normalised by
 * 0.875 so the result lands in roughly [0, 1].
 */
export function fbm3(px: number, py: number): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < SHADER_NOISE_CONSTANTS.octaves; o++) {
    val += amp * valueNoise21(px * freq, py * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return val / SHADER_NOISE_CONSTANTS.fbmNorm;
}

// ---------------------------------------------------------------------------
// 2. The seeded family — Farm's ground noise.
// ---------------------------------------------------------------------------

/** Integer bit-mixing hash: `(x, y, seed)` → float in [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Seeded bilinear value noise with cubic-Hermite smoothing. */
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

/**
 * Seeded fBm with configurable octaves, lacunarity and gain, normalised by the amplitude sum.
 * Each octave draws from a decorrelated sub-seed.
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

// ---------------------------------------------------------------------------
// 3. Hillshade — the central-difference relief gradient.
// ---------------------------------------------------------------------------

/** Samples a height field in [0, 1] at integer-ish coordinates. */
export type HeightSampler = (x: number, y: number) => number;

/**
 * Per-game weights for {@link hillshadeFrom}.
 *
 * These are EXPLICIT PARAMETERS rather than module constants precisely because the games disagree
 * and audit-61 found no record of why: Citadel uses `slope: 1.3`, MateQuest `slope: 1.2`, with the
 * MateQuest source carrying only `// hillshade slope weight (Citadel uses 1.3)`. Nothing in either
 * game's history says the difference was measured, and nothing says it was an accident either — so
 * converging them would be an unrecorded art change, and hiding them in the shared module would
 * make the divergence invisible again. Passing them in keeps each game's look exactly as shipped
 * while making the disagreement impossible to miss.
 */
export interface HillshadeWeights {
  /** How strongly the local slope drives the shade. */
  slope: number;
  /** How strongly absolute height nudges it (the mild hypsometric term). */
  height: number;
}

/**
 * Continuous relief signal under a fixed NW sun. Positive = lit, ~0 = flat or facing across the
 * light, negative = facing away.
 *
 * Central differences: `gx = h(x+1) - h(x-1)` is positive when the ground rises toward the EAST,
 * `gy` likewise toward the SOUTH. A NW-facing surface rises west (gx < 0) and north (gy < 0), so
 * `-(gx + gy)` is positive exactly when the cell faces the sun. The `(h - 0.5)` term adds a mild
 * hypsometric nudge so absolute height shades too.
 */
export function hillshadeFrom(
  sample: HeightSampler,
  tx: number,
  ty: number,
  w: HillshadeWeights,
): number {
  const hC = sample(tx, ty);
  const gx = sample(tx + 1, ty) - sample(tx - 1, ty);
  const gy = sample(tx, ty + 1) - sample(tx, ty - 1);
  return w.slope * -(gx + gy) + w.height * (hC - 0.5);
}
