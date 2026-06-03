import { describe, it, expect } from "vitest";
import {
  tileBrightness,
  makeGroundNoiseDecorator,
  GROUND_NOISE_AMPLITUDE,
} from "./ground-noise";

describe("ground-noise (brief 30)", () => {
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
    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 40; y++) {
        const b = tileBrightness(x, y, 0xc0ffee);
        expect(b).toBeGreaterThanOrEqual(1 - GROUND_NOISE_AMPLITUDE - 1e-9);
        expect(b).toBeLessThanOrEqual(1 + GROUND_NOISE_AMPLITUDE + 1e-9);
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

  it("decorator stamps per-tile fills and restores composite state", () => {
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
