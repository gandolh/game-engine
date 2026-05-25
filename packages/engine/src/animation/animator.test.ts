import { describe, expect, it } from "vitest";
import { AnimationClip } from "./clip";
import { Animator } from "./animator";

const walk = new AnimationClip({
  name: "walk",
  frames: [
    { frame: "walk_0", durationMs: 100 },
    { frame: "walk_1", durationMs: 100 },
    { frame: "walk_2", durationMs: 100 },
    { frame: "walk_3", durationMs: 100 },
  ],
  loop: true,
});

const swing = new AnimationClip({
  name: "swing",
  frames: [
    { frame: "swing_0", durationMs: 50 },
    { frame: "swing_1", durationMs: 50 },
    { frame: "swing_2", durationMs: 50 },
  ],
  loop: false,
});

describe("AnimationClip.sampleAt", () => {
  it("is deterministic for fixed elapsed times", () => {
    const a = walk.sampleAt(150);
    const b = walk.sampleAt(150);
    expect(a).toEqual(b);
    expect(a.frameName).toBe("walk_1");
  });

  it("returns the first frame at elapsed=0", () => {
    expect(walk.sampleAt(0).frameName).toBe("walk_0");
    expect(swing.sampleAt(0).frameName).toBe("swing_0");
  });

  it("walks frames within the first pass", () => {
    expect(walk.sampleAt(50).frameName).toBe("walk_0");
    expect(walk.sampleAt(100).frameName).toBe("walk_1");
    expect(walk.sampleAt(250).frameName).toBe("walk_2");
    expect(walk.sampleAt(399).frameName).toBe("walk_3");
  });

  it("loop=true wraps correctly past total duration", () => {
    // total = 400ms
    const s = walk.sampleAt(450); // -> local 50 -> walk_0, 1 loop done
    expect(s.frameName).toBe("walk_0");
    expect(s.loopsCompleted).toBe(1);
    expect(s.finished).toBe(false);

    const big = walk.sampleAt(400 * 7 + 250); // local 250 -> walk_2
    expect(big.frameName).toBe("walk_2");
    expect(big.loopsCompleted).toBe(7);
    expect(big.finished).toBe(false);
  });

  it("loop=false clamps to last frame and reports finished", () => {
    // total = 150ms
    const at = swing.sampleAt(150);
    expect(at.frameName).toBe("swing_2");
    expect(at.finished).toBe(true);

    const past = swing.sampleAt(100_000);
    expect(past.frameName).toBe("swing_2");
    expect(past.finished).toBe(true);
    expect(past.loopsCompleted).toBe(0);
  });

  it("constructor rejects empty frames", () => {
    expect(
      () => new AnimationClip({ name: "x", frames: [], loop: true }),
    ).toThrow(/frames must not be empty/);
  });

  it("constructor rejects non-positive durations", () => {
    expect(
      () =>
        new AnimationClip({
          name: "x",
          frames: [{ frame: "a", durationMs: 0 }],
          loop: true,
        }),
    ).toThrow();
    expect(
      () =>
        new AnimationClip({
          name: "x",
          frames: [{ frame: "a", durationMs: -1 }],
          loop: true,
        }),
    ).toThrow();
  });
});

describe("Animator", () => {
  it("returns null before any clip is played", () => {
    const animator = new Animator();
    expect(animator.currentFrameName()).toBeNull();
  });

  it("plays a registered clip and advances frames via update", () => {
    const animator = new Animator();
    animator.addClip(walk);
    animator.play("walk");

    expect(animator.currentFrameName()).toBe("walk_0");
    animator.update(100);
    expect(animator.currentFrameName()).toBe("walk_1");
    animator.update(100);
    expect(animator.currentFrameName()).toBe("walk_2");
    animator.update(100);
    expect(animator.currentFrameName()).toBe("walk_3");
    // wraps because loop=true
    animator.update(100);
    expect(animator.currentFrameName()).toBe("walk_0");
  });

  it("addClip throws on duplicate name", () => {
    const animator = new Animator();
    animator.addClip(walk);
    expect(() => animator.addClip(walk)).toThrow(/already registered/);
  });

  it("play throws on unknown clip name", () => {
    const animator = new Animator();
    expect(() => animator.play("nope")).toThrow(/unknown clip/);
  });

  it("play resets elapsed only when switching clips or reset=true", () => {
    const animator = new Animator();
    animator.addClip(walk);
    animator.addClip(swing);

    animator.play("walk");
    animator.update(150);
    expect(animator.currentFrameName()).toBe("walk_1");

    // replaying same clip without reset preserves elapsed
    animator.play("walk");
    expect(animator.currentFrameName()).toBe("walk_1");

    // reset=true rewinds
    animator.play("walk", { reset: true });
    expect(animator.currentFrameName()).toBe("walk_0");

    // switching clips rewinds
    animator.update(120);
    animator.play("swing");
    expect(animator.currentFrameName()).toBe("swing_0");
  });

  it("isFinished tracks non-looping completion", () => {
    const animator = new Animator();
    animator.addClip(swing);
    animator.play("swing");
    expect(animator.isFinished()).toBe(false);
    animator.update(149);
    expect(animator.isFinished()).toBe(false);
    animator.update(2);
    expect(animator.isFinished()).toBe(true);
    expect(animator.currentFrameName()).toBe("swing_2");
  });

  it("update with non-positive delta is a no-op", () => {
    const animator = new Animator();
    animator.addClip(walk);
    animator.play("walk");
    animator.update(0);
    animator.update(-50);
    expect(animator.currentFrameName()).toBe("walk_0");
  });

  it("clear drops clips and current state", () => {
    const animator = new Animator();
    animator.addClip(walk);
    animator.play("walk");
    animator.update(150);
    animator.clear();
    expect(animator.currentFrameName()).toBeNull();
    // can re-add the same name after clear
    animator.addClip(walk);
    animator.play("walk");
    expect(animator.currentFrameName()).toBe("walk_0");
  });
});
