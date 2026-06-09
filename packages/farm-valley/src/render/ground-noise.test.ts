import { describe, it, expect } from "vitest";
import {
  fbm,
  valueNoise2d,
  tileBrightness,
  domainWarp,
  makeGroundNoiseDecorator,
  GROUND_NOISE_AMPLITUDE,
} from "./ground-noise";

// brief 49 Track 2 — domain warping. WARP_STRENGTH (k) in ground-noise.ts is
// 1.5 fBm-coordinate units; mirror it here for the boundedness assertions.
const WARP_K = 1.5;
const FBM_BASE_FREQUENCY = 1 / 8;

// brief 49 Track 1 — the ground texture is now coherent fBm value noise
// (base freq 1/8, 4 octaves, lacunarity 2, gain 0.5) instead of raw per-tile
// hash. These tests pin determinism, [0,1) bounds on the noise primitives,
// the [1±amplitude] brightness contract, fixed known-vectors, and the
// spatial-coherence property that distinguishes fBm from the old hash static.

const OCTAVES = 4;
const LACUNARITY = 2;
const GAIN = 0.5;

describe("valueNoise2d", () => {
  it("is deterministic on (x, y, seed)", () => {
    for (const [x, y, s] of [
      [0, 0, 1],
      [5.3, 7.7, 12345],
      [-12.5, 88.25, 7],
      [1000.1, -3.9, 0],
    ] as const) {
      expect(valueNoise2d(x, y, s)).toBe(valueNoise2d(x, y, s));
    }
  });

  it("is bounded in [0, 1)", () => {
    for (let i = 0; i < 2000; i++) {
      const x = ((i * 37.123) % 211) - 105;
      const y = ((i * 91.777) % 173) - 86;
      const seed = (i * 2654435761) >>> 0;
      const n = valueNoise2d(x, y, seed);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe("fbm", () => {
  it("is deterministic on (x, y, seed)", () => {
    for (const [x, y, s] of [
      [0, 0, 1],
      [0.625, 0.875, 12345],
      [-4.5, 9.25, 99],
    ] as const) {
      expect(fbm(x, y, s, OCTAVES, LACUNARITY, GAIN)).toBe(
        fbm(x, y, s, OCTAVES, LACUNARITY, GAIN),
      );
    }
  });

  it("is bounded in [0, 1)", () => {
    for (let i = 0; i < 2000; i++) {
      const x = ((i * 13.31) % 200) - 100;
      const y = ((i * 29.17) % 200) - 100;
      const seed = (i * 40503 + 1) >>> 0;
      const n = fbm(x, y, seed, OCTAVES, LACUNARITY, GAIN);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe("tileBrightness (brief 30 / brief 49)", () => {
  it("is deterministic on (seed, x, y)", () => {
    const a = tileBrightness(3, 7, 0xc0ffee);
    const b = tileBrightness(3, 7, 0xc0ffee);
    expect(a).toBe(b);
  });

  it("varies across tiles and across seeds", () => {
    const t1 = tileBrightness(3, 7, 0xc0ffee);
    const t2 = tileBrightness(4, 7, 0xc0ffee); // neighbor
    const t3 = tileBrightness(3, 7, 1); // different seed
    expect(t1).not.toBe(t2);
    expect(t1).not.toBe(t3);
  });

  it("stays within [1 - amplitude, 1 + amplitude]", () => {
    const amp = GROUND_NOISE_AMPLITUDE;
    for (let x = -10; x < 100; x++) {
      for (let y = -10; y < 130; y++) {
        const b = tileBrightness(x, y, 0xc0ffee);
        expect(b).toBeGreaterThanOrEqual(1 - amp - 1e-9);
        expect(b).toBeLessThanOrEqual(1 + amp + 1e-9);
      }
    }
  });

  it("centers on 1 on average (no net darkening/lightening)", () => {
    let sum = 0;
    let n = 0;
    for (let x = 0; x < 60; x++) {
      for (let y = 0; y < 60; y++) {
        sum += tileBrightness(x, y, 42);
        n++;
      }
    }
    const mean = sum / n;
    expect(Math.abs(mean - 1)).toBeLessThan(0.01);
  });

  // Known-vector regression: these literals were captured from the current
  // (Track 2 domain-warped) implementation. A change here means the baked
  // ground texture moved — intentional refactors must re-capture; accidental
  // drift fails the build. (Track 1 values were pre-warp and are now stale.)
  it("matches captured known-vectors", () => {
    expect(tileBrightness(5, 7, 12345)).toBeCloseTo(1.0118082820199261, 12);
    expect(tileBrightness(0, 0, 12345)).toBeCloseTo(1.0537431249204061, 12);
    expect(tileBrightness(40, 60, 99)).toBeCloseTo(1.0103074053620025, 12);
  });
});

describe("domainWarp (brief 49 Track 2)", () => {
  it("is deterministic on (x, y, seed)", () => {
    for (const [x, y, s] of [
      [0, 0, 1],
      [0.625, 0.875, 12345],
      [-4.5, 9.25, 99],
    ] as const) {
      const a = domainWarp(x, y, s);
      const b = domainWarp(x, y, s);
      expect(a[0]).toBe(b[0]);
      expect(a[1]).toBe(b[1]);
    }
  });

  it("uses decorrelated dx/dy (not pushed only along the diagonal)", () => {
    // If dx === dy for every coord the warp would only slide along the
    // diagonal. Sample a sweep and require at least one with dx !== dy.
    let sawDecorrelated = false;
    for (let i = 0; i < 50; i++) {
      const x = i * 0.37;
      const y = i * 0.91;
      const [wx, wy] = domainWarp(x, y, 12345);
      const dx = wx - x;
      const dy = wy - y;
      if (Math.abs(dx - dy) > 1e-6) sawDecorrelated = true;
    }
    expect(sawDecorrelated).toBe(true);
  });

  it("bounds the offset by k (no runaway warp off-grid)", () => {
    for (let x = -20; x < 80; x += 1) {
      for (let y = -20; y < 80; y += 1) {
        const fx = x * FBM_BASE_FREQUENCY;
        const fy = y * FBM_BASE_FREQUENCY;
        const [wx, wy] = domainWarp(fx, fy, 7);
        expect(Math.abs(wx - fx)).toBeLessThanOrEqual(WARP_K + 1e-9);
        expect(Math.abs(wy - fy)).toBeLessThanOrEqual(WARP_K + 1e-9);
      }
    }
  });

  it("is actually wired into tileBrightness (warp changes output)", () => {
    // Compare warped tileBrightness against an unwarped direct fBm brightness
    // at the same tiles. At least one tile must differ, proving the warp has a
    // real effect on the baked texture.
    const seed = 12345;
    const amp = GROUND_NOISE_AMPLITUDE;
    let differing = 0;
    for (let tx = 0; tx < 40; tx++) {
      for (let ty = 0; ty < 40; ty++) {
        const warped = tileBrightness(tx, ty, seed);
        const nUnwarped = fbm(
          tx * FBM_BASE_FREQUENCY,
          ty * FBM_BASE_FREQUENCY,
          seed >>> 0,
          OCTAVES,
          LACUNARITY,
          GAIN,
        );
        const unwarped = 1 + (nUnwarped * 2 - 1) * amp;
        if (Math.abs(warped - unwarped) > 1e-6) differing++;
      }
    }
    // The vast majority of tiles should be displaced by the warp.
    expect(differing).toBeGreaterThan(40 * 40 * 0.5);
  });
});

describe("spatial coherence (fBm vs hash)", () => {
  it("adjacent tiles vary less than far-apart tiles on average", () => {
    const seed = 12345;
    let adjacentSum = 0;
    let farSum = 0;
    let count = 0;
    for (let ty = 0; ty < 60; ty++) {
      for (let tx = 0; tx < 60; tx++) {
        const here = tileBrightness(tx, ty, seed);
        adjacentSum += Math.abs(here - tileBrightness(tx + 1, ty, seed));
        farSum += Math.abs(here - tileBrightness(tx + 37, ty + 37, seed));
        count++;
      }
    }
    const adjacentAvg = adjacentSum / count;
    const farAvg = farSum / count;
    // Coherence: neighbours should be meaningfully closer than distant tiles.
    // Robust margin (not flaky): adjacent delta well under half the far delta.
    // brief 49 Track 2: domain warping PRESERVES this — measured ratio ≈ 0.25
    // after warping (vs ≈ 0.24 pre-warp). If this fails, WARP_STRENGTH is too
    // high; dial it down until coherence holds (the "not too psychedelic" guard).
    expect(adjacentAvg).toBeLessThan(farAvg * 0.5);
  });
});

describe("makeGroundNoiseDecorator", () => {
  it("stamps per-tile fills and restores composite state", () => {
    // Minimal fake 2D context recording the ops it sees.
    const ops: string[] = [];
    let composite = "source-over";
    let alpha = 1;
    const fakeCtx = {
      get globalCompositeOperation() {
        return composite;
      },
      set globalCompositeOperation(v: string) {
        composite = v;
      },
      get globalAlpha() {
        return alpha;
      },
      set globalAlpha(v: number) {
        alpha = v;
      },
      fillStyle: "",
      fillRect: (x: number, y: number, w: number, h: number) => {
        ops.push(`fill ${x},${y} ${w}x${h} op=${composite}`);
      },
    } as unknown as CanvasRenderingContext2D;

    const decorate = makeGroundNoiseDecorator(0xc0ffee, 16);
    decorate(fakeCtx, 64, 64); // 4x4 tiles

    expect(ops.length).toBeGreaterThan(0);
    // Composite + alpha restored to defaults afterward.
    expect(composite).toBe("source-over");
    expect(alpha).toBe(1);
    // Uses multiply (darken) and/or screen (lighten).
    expect(ops.some((o) => /multiply|screen/.test(o))).toBe(true);
  });
});
