import { describe, expect, it } from "vitest";
import { easeInCubic, easeInOutCubic, easeOutCubic, linear } from "./easing";
import { advanceTween, resetTween, tween } from "./tween";

// ---------------------------------------------------------------------------
// Easing functions
// ---------------------------------------------------------------------------

describe("linear easing", () => {
  it("returns t unchanged", () => {
    expect(linear(0)).toBe(0);
    expect(linear(0.5)).toBe(0.5);
    expect(linear(1)).toBe(1);
  });
});

describe("easeOutCubic", () => {
  it("returns 0 at t=0, 1 at t=1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it("is > linear(t) in the middle (deceleration means more progress early)", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("easeInCubic", () => {
  it("returns 0 at t=0, 1 at t=1", () => {
    expect(easeInCubic(0)).toBe(0);
    expect(easeInCubic(1)).toBe(1);
  });
  it("is < linear(t) in the middle (acceleration means less progress early)", () => {
    expect(easeInCubic(0.5)).toBeLessThan(0.5);
  });
});

describe("easeInOutCubic", () => {
  it("returns 0 at t=0, 1 at t=1, 0.5 at t=0.5", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
  });
});

// ---------------------------------------------------------------------------
// tween — construction
// ---------------------------------------------------------------------------

describe("tween — construction", () => {
  it("starts at `from` with elapsed=0 and done=false", () => {
    const tw = tween({ from: 10, to: 50, durationMs: 300 });
    expect(tw.value).toBe(10);
    expect(tw.elapsed).toBe(0);
    expect(tw.done).toBe(false);
  });

  it("defaults to linear easing", () => {
    const tw = tween({ from: 0, to: 100, durationMs: 100 });
    advanceTween(tw, 50);
    expect(tw.value).toBeCloseTo(50, 5);
  });
});

// ---------------------------------------------------------------------------
// advanceTween — deterministic interpolation
// ---------------------------------------------------------------------------

describe("advanceTween — interpolation", () => {
  it("returns `from` at t=0 (no advance)", () => {
    const tw = tween({ from: 0, to: 100, durationMs: 200 });
    const v = advanceTween(tw, 0);
    expect(v).toBe(0);
  });

  it("returns `to` exactly at t=durationMs with linear easing", () => {
    const tw = tween({ from: 0, to: 100, durationMs: 200 });
    const v = advanceTween(tw, 200);
    expect(v).toBe(100);
    expect(tw.done).toBe(true);
  });

  it("returns mid-point value at half duration with linear easing", () => {
    const tw = tween({ from: 0, to: 80, durationMs: 400 });
    const v = advanceTween(tw, 200);
    expect(v).toBeCloseTo(40, 5);
    expect(tw.done).toBe(false);
  });

  it("applies easeOutCubic: value at midpoint > linear midpoint", () => {
    const tw = tween({ from: 0, to: 100, durationMs: 200, ease: easeOutCubic });
    const v = advanceTween(tw, 100); // t=0.5
    expect(v).toBeGreaterThan(50);
  });

  it("clamps to `to` when advanced beyond durationMs", () => {
    const tw = tween({ from: 5, to: 20, durationMs: 100 });
    const v = advanceTween(tw, 9999);
    expect(v).toBe(20);
    expect(tw.done).toBe(true);
  });

  it("returns `to` immediately on every subsequent call once done", () => {
    const tw = tween({ from: 0, to: 10, durationMs: 50 });
    advanceTween(tw, 50);
    expect(tw.done).toBe(true);
    const v2 = advanceTween(tw, 100); // advance again — should stay at 10
    expect(v2).toBe(10);
    expect(tw.elapsed).toBe(50); // elapsed must not grow past durationMs
  });

  it("accumulates elapsed correctly across multiple small steps", () => {
    const tw = tween({ from: 0, to: 100, durationMs: 100 });
    advanceTween(tw, 25); // t=0.25
    advanceTween(tw, 25); // t=0.50
    advanceTween(tw, 25); // t=0.75
    const v = advanceTween(tw, 25); // t=1.00
    expect(v).toBe(100);
    expect(tw.done).toBe(true);
  });

  it("handles zero-duration tween: immediately done at `to`", () => {
    const tw = tween({ from: 0, to: 42, durationMs: 0 });
    const v = advanceTween(tw, 0);
    expect(v).toBe(42);
    expect(tw.done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resetTween
// ---------------------------------------------------------------------------

describe("resetTween — replay", () => {
  it("resets elapsed, value, and done to initial state", () => {
    const tw = tween({ from: 5, to: 50, durationMs: 200 });
    advanceTween(tw, 200);
    expect(tw.done).toBe(true);

    resetTween(tw);

    expect(tw.elapsed).toBe(0);
    expect(tw.value).toBe(5); // back to `from`
    expect(tw.done).toBe(false);

    // Can be re-advanced normally.
    const v = advanceTween(tw, 100);
    expect(v).toBeCloseTo(27.5, 3); // linear midpoint
  });
});

// ---------------------------------------------------------------------------
// Determinism: no Date.now / performance.now leakage
// ---------------------------------------------------------------------------

describe("tween — pure / deterministic", () => {
  it("same injected sequence always produces same values", () => {
    function run(dts: number[]): number[] {
      const tw = tween({ from: 0, to: 100, durationMs: 300 });
      return dts.map((dt) => advanceTween(tw, dt));
    }
    const a = run([50, 100, 150]);
    const b = run([50, 100, 150]);
    expect(a).toEqual(b);
  });
});
