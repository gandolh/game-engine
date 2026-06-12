import { describe, expect, it } from "vitest";
import { AnimationClip } from "./clip";

const walk = () =>
  new AnimationClip({
    name: "walk",
    loop: true,
    frames: [
      { frame: "a", durationMs: 100 },
      { frame: "b", durationMs: 100 },
      { frame: "c", durationMs: 100 },
    ],
  });

describe("AnimationClip", () => {
  it("throws on empty frames", () => {
    expect(() => new AnimationClip({ name: "x", loop: true, frames: [] })).toThrow();
  });

  it("throws on non-positive durations", () => {
    expect(
      () => new AnimationClip({ name: "x", loop: true, frames: [{ frame: "a", durationMs: 0 }] }),
    ).toThrow();
  });

  it("sums total duration", () => {
    expect(walk().totalDurationMs).toBe(300);
  });

  it("holds first frame at or before t=0", () => {
    const c = walk();
    expect(c.sampleAt(-10).frameName).toBe("a");
    expect(c.sampleAt(0).frameName).toBe("a");
  });

  it("resolves frames within the first pass deterministically", () => {
    const c = walk();
    expect(c.sampleAt(50).frameName).toBe("a");
    expect(c.sampleAt(100).frameName).toBe("b");
    expect(c.sampleAt(150).frameName).toBe("b");
    expect(c.sampleAt(250).frameName).toBe("c");
  });

  it("wraps past total duration when looping and reports loops", () => {
    const c = walk();
    const s = c.sampleAt(350); // one full loop + 50ms → frame a, loop 1
    expect(s.frameName).toBe("a");
    expect(s.loopsCompleted).toBe(1);
    expect(s.finished).toBe(false);
    expect(c.sampleAt(700).loopsCompleted).toBe(2);
  });

  it("clamps and finishes on the last frame when not looping", () => {
    const c = new AnimationClip({
      name: "oneshot",
      loop: false,
      frames: [
        { frame: "a", durationMs: 100 },
        { frame: "b", durationMs: 100 },
      ],
    });
    expect(c.sampleAt(150).frameName).toBe("b");
    const end = c.sampleAt(999);
    expect(end.frameName).toBe("b");
    expect(end.finished).toBe(true);
  });
});
