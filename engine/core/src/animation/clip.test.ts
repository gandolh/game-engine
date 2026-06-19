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
    const s = c.sampleAt(350); 
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

describe("AnimationClip frame events", () => {
  const clip = (loop: boolean) =>
    new AnimationClip({
      name: "walk",
      loop,
      frames: [
        { frame: "a", durationMs: 100 },
        { frame: "b", durationMs: 100 },
        { frame: "c", durationMs: 100 },
      ],
      events: [
        { name: "left", atMs: 0 },
        { name: "right", atMs: 150 },
      ],
    });

  it("rejects an event outside [0, total)", () => {
    expect(
      () =>
        new AnimationClip({
          name: "x",
          loop: true,
          frames: [{ frame: "a", durationMs: 100 }],
          events: [{ name: "bad", atMs: 100 }],
        }),
    ).toThrow();
  });

  it("fires an event when the half-open window crosses its time", () => {
    const c = clip(true);
    expect(c.eventsBetween(100, 200)).toEqual(["right"]); 
    expect(c.eventsBetween(160, 200)).toEqual([]); 
  });

  it("is half-open: (prev, cur], so the boundary fires once", () => {
    const c = clip(true);
    expect(c.eventsBetween(140, 150)).toEqual(["right"]); 
    expect(c.eventsBetween(150, 160)).toEqual([]); 
  });

  it("handles loop wrap (event at 0 recurs each cycle)", () => {
    const c = clip(true);

    expect(c.eventsBetween(290, 310)).toEqual(["left"]);
  });

  it("caps a huge window to one cycle (no spin / no spam)", () => {
    const c = clip(true);
    const names = c.eventsBetween(0, 100_000);

    expect(names.length).toBeLessThanOrEqual(2);
  });

  it("a non-looping clip fires each event at most once", () => {
    const c = clip(false);
    expect(c.eventsBetween(-10, 999)).toEqual(["left", "right"]);
    expect(c.eventsBetween(999, 2000)).toEqual([]);
  });

  it("returns nothing when the clip has no events", () => {
    const c = new AnimationClip({ name: "n", loop: true, frames: [{ frame: "a", durationMs: 50 }] });
    expect(c.eventsBetween(0, 1000)).toEqual([]);
  });
});
