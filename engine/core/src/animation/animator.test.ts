import { describe, expect, it } from "vitest";
import { AnimationClip } from "./clip";
import { Animator } from "./animator";

const clip = (name: string, frames: string[], loop = true) =>
  new AnimationClip({
    name,
    loop,
    frames: frames.map((f) => ({ frame: f, durationMs: 100 })),
  });

describe("Animator", () => {
  it("returns null before any clip plays", () => {
    expect(new Animator().currentFrameName()).toBeNull();
  });

  it("throws on duplicate clip names", () => {
    const a = new Animator();
    a.addClip(clip("walk", ["a", "b"]));
    expect(() => a.addClip(clip("walk", ["c"]))).toThrow();
  });

  it("throws when playing an unknown clip", () => {
    expect(() => new Animator().play("nope")).toThrow();
  });

  it("advances elapsed time and resolves frames", () => {
    const a = new Animator();
    a.addClip(clip("walk", ["a", "b", "c"]));
    a.play("walk");
    expect(a.currentFrameName()).toBe("a");
    a.update(120);
    expect(a.currentFrameName()).toBe("b");
    a.update(100);
    expect(a.currentFrameName()).toBe("c");
  });

  it("preserves elapsed when replaying the same clip, resets with reset:true", () => {
    const a = new Animator();
    a.addClip(clip("walk", ["a", "b", "c"]));
    a.play("walk");
    a.update(120); 
    a.play("walk"); 
    expect(a.currentFrameName()).toBe("b");
    a.play("walk", { reset: true });
    expect(a.currentFrameName()).toBe("a");
  });

  it("resets elapsed when switching clips", () => {
    const a = new Animator();
    a.addClip(clip("walk", ["a", "b"]));
    a.addClip(clip("idle", ["x", "y"]));
    a.play("walk");
    a.update(150);
    a.play("idle");
    expect(a.currentFrameName()).toBe("x");
  });

  it("reports finished for a non-looping clip held at its end", () => {
    const a = new Animator();
    a.addClip(clip("oneshot", ["a", "b"], false));
    a.play("oneshot");
    expect(a.isFinished()).toBe(false);
    a.update(500);
    expect(a.isFinished()).toBe(true);
    expect(a.currentFrameName()).toBe("b");
  });

  it("ignores non-positive deltas", () => {
    const a = new Animator();
    a.addClip(clip("walk", ["a", "b"]));
    a.play("walk");
    a.update(-50);
    a.update(0);
    expect(a.currentFrameName()).toBe("a");
  });
});
