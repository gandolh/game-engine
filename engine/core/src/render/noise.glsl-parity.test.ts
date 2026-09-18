/**
 * audit-61 — the CPU port of the shader noise agrees with the shader.
 *
 * `cloud.frag.glsl` computes `hash21`/`valueNoise`/`fbm3` on the GPU; Citadel's ground bake needs
 * the SAME field on the CPU so the ground it dithers matches the sky drawn over it. Before this,
 * the two were kept in step by a comment — `terrain-dither.ts` said the port was "VERBATIM" and
 * nothing checked it. Edit the shader's noise and Citadel's bake silently desyncs from the sky,
 * with every test still green. That is a correctness coupling maintained by prose.
 *
 * ## What this can and cannot prove
 *
 * It CANNOT assert bit-equal outputs: GLSL evaluates `sin` and `fract` at `highp` float32 with
 * implementation-defined precision, while this runs in float64, so the last digits will differ on
 * any real GPU. Chasing that would test the driver, not the port.
 *
 * What it CAN prove — and what actually broke in practice — is that the two are the SAME RECIPE:
 * the same magic constants, the same octave count, the same normaliser, the same smoothing
 * polynomial. Every realistic desync is someone editing one of those numbers in one place. So this
 * reads the real `.glsl` file off disk and checks it against the TypeScript module's exported
 * constants, plus the structural markers.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHADER_NOISE_CONSTANTS, hash21, valueNoise21, fbm3 } from "./noise";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const GLSL_PATH = join(HERE, "webgl2", "shaders", "cloud.frag.glsl");
const SRC = readFileSync(GLSL_PATH, "utf8");

/** The shader's noise block only — so an unrelated constant elsewhere cannot satisfy a check. */
function noiseBlock(): string {
  const start = SRC.indexOf("float hash21(");
  const end = SRC.indexOf("void main(");
  expect(start, "hash21 not found in cloud.frag.glsl").toBeGreaterThan(-1);
  expect(end, "main() not found in cloud.frag.glsl").toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe("the shader source is where we think it is", () => {
  it("cloud.frag.glsl exists and still declares the three noise functions", () => {
    const block = noiseBlock();
    expect(block).toContain("float hash21(");
    expect(block).toContain("float valueNoise(");
    expect(block).toContain("float fbm3(");
  });
});

describe("hash21 — the CPU port uses the shader's constants", () => {
  const block = noiseBlock();

  it("the dot-product constants match", () => {
    expect(block).toContain(`vec2(${String(SHADER_NOISE_CONSTANTS.hashDotX)}, ${String(SHADER_NOISE_CONSTANTS.hashDotY)})`);
  });

  it("the sine scale constant matches", () => {
    expect(block).toContain(String(SHADER_NOISE_CONSTANTS.hashScale));
  });

  it("the shader still uses fract(sin(dot(...)) * scale) — not some other hash", () => {
    const hash = block.slice(block.indexOf("float hash21("), block.indexOf("float valueNoise("));
    expect(hash).toMatch(/fract\s*\(\s*sin\s*\(\s*dot\s*\(/);
  });

  it("the TS port really is fract(sin(...)), including for negative coordinates", () => {
    // `fract` is `x - floor(x)`, NOT `%` — they differ in sign for negatives, and getting that
    // wrong is silent (the noise just looks slightly different on one side of the origin).
    for (const [x, y] of [[0, 0], [1, 0], [-3, 7], [12.5, -4.25]] as const) {
      const expected = (() => {
        const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        return s - Math.floor(s);
      })();
      expect(hash21(x, y)).toBeCloseTo(expected, 12);
      expect(hash21(x, y)).toBeGreaterThanOrEqual(0);
      expect(hash21(x, y)).toBeLessThan(1);
    }
  });
});

describe("valueNoise — same cubic-Hermite smoothing", () => {
  const block = noiseBlock();

  it("the shader still smooths with t*t*(3-2t)", () => {
    expect(block).toMatch(/frac_part\s*\*\s*frac_part\s*\*\s*\(\s*3\.0\s*-\s*2\.0\s*\*\s*frac_part\s*\)/);
  });

  it("the shader still samples the four lattice corners", () => {
    for (const corner of ["vec2(0.0, 0.0)", "vec2(1.0, 0.0)", "vec2(0.0, 1.0)", "vec2(1.0, 1.0)"]) {
      expect(block).toContain(corner);
    }
  });

  it("the TS port reduces to the raw hash exactly at a lattice point", () => {
    // At integer coords the fractional part is 0, so smoothing weights are 0 and only corner A
    // contributes. If the port's corner ordering or smoothing were wrong, this would drift.
    for (const [x, y] of [[0, 0], [3, 5], [-2, 9]] as const) {
      expect(valueNoise21(x, y)).toBeCloseTo(hash21(x, y), 12);
    }
  });

  it("the TS port stays within the hull of its four corners", () => {
    for (let i = 0; i < 200; i++) {
      const x = (i * 0.37) % 11;
      const y = (i * 0.61) % 7;
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const corners = [
        hash21(ix, iy), hash21(ix + 1, iy), hash21(ix, iy + 1), hash21(ix + 1, iy + 1),
      ];
      const v = valueNoise21(x, y);
      expect(v).toBeGreaterThanOrEqual(Math.min(...corners) - 1e-12);
      expect(v).toBeLessThanOrEqual(Math.max(...corners) + 1e-12);
    }
  });
});

describe("fbm3 — same octaves and normaliser", () => {
  const block = noiseBlock();

  it("the shader normalises by the same geometric-series sum", () => {
    expect(block).toContain(`/ ${String(SHADER_NOISE_CONSTANTS.fbmNorm)}`);
  });

  it("the normaliser really is the sum of the octave amplitudes", () => {
    // 0.5 + 0.25 + 0.125 = 0.875. Pinning the ARITHMETIC, so changing the octave count without
    // changing the normaliser is caught rather than quietly rescaling the field.
    let sum = 0;
    let amp = 0.5;
    for (let o = 0; o < SHADER_NOISE_CONSTANTS.octaves; o++) {
      sum += amp;
      amp *= 0.5;
    }
    expect(sum).toBeCloseTo(SHADER_NOISE_CONSTANTS.fbmNorm, 12);
  });

  it("the shader still accumulates exactly that many octaves", () => {
    const f = block.slice(block.indexOf("float fbm3("));
    const calls = f.match(/valueNoise\s*\(/g) ?? [];
    expect(calls.length).toBe(SHADER_NOISE_CONSTANTS.octaves);
  });

  it("the shader still doubles frequency and halves amplitude per octave", () => {
    const f = block.slice(block.indexOf("float fbm3("));
    expect(f).toMatch(/amp\s*\*=\s*0\.5;/);
    expect(f).toMatch(/freq\s*\*=\s*2\.0;/);
  });

  it("the TS port lands in roughly [0, 1] across a wide sample", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 2000; i++) {
      const v = fbm3((i * 0.13) % 37, (i * 0.29) % 23);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1 / 0.875 + 1e-9);
  });

  it("the TS port is deterministic and pure", () => {
    expect(fbm3(3.25, 7.75)).toBe(fbm3(3.25, 7.75));
  });
});
