import { describe, expect, it } from "vitest";
import {
  linear,
  smoothstep,
  easeOutQuad,
  easeOutCubic,
  easeOutBack,
  easeOutElastic,
} from "./easing";

describe("easing functions", () => {
  it("all pin the endpoints 0→0 and 1→1", () => {
    for (const f of [linear, smoothstep, easeOutQuad, easeOutCubic, easeOutBack, easeOutElastic]) {
      expect(f(0)).toBeCloseTo(0, 5);
      expect(f(1)).toBeCloseTo(1, 5);
    }
  });

  it("ease-out variants decelerate (are ahead of linear in the first half)", () => {
    for (const f of [easeOutQuad, easeOutCubic]) {
      expect(f(0.25)).toBeGreaterThan(0.25);
      expect(f(0.5)).toBeGreaterThan(0.5);
    }
  });

  it("easeOutBack overshoots past 1 before settling", () => {
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => easeOutBack((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1);
  });

  it("easeOutElastic rings (exceeds 1 somewhere mid-curve)", () => {
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => easeOutElastic((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1);
  });

  it("smoothstep is symmetric about 0.5", () => {
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 5);
    expect(smoothstep(0.25) + smoothstep(0.75)).toBeCloseTo(1, 5);
  });
});
