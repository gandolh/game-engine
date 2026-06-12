import { describe, expect, it } from "vitest";
import { loopClip, sampleCycle, cycleIndex } from "./cycle";
import { FOAM_CLIP, WEATHER_BEACON_CLIP } from "./clips";
import { resolveFrameAndBob } from "./frames";
import type { SnapshotSprite } from "../snapshot";

const FRAMES = ["a", "b", "c"] as const;

describe("cycle helpers", () => {
  it("reproduces the old floor/modulo cycler exactly", () => {
    const clip = loopClip("t", FRAMES, 900); // 300ms per frame
    for (const nowMs of [0, 150, 300, 450, 899, 900, 1234, 99999]) {
      const oldIdx = Math.floor(nowMs / (900 / FRAMES.length)) % FRAMES.length;
      expect(cycleIndex(clip, nowMs)).toBe(oldIdx);
      expect(sampleCycle(clip, nowMs)).toBe(FRAMES[oldIdx]);
    }
  });

  it("applies an integer phase-frame offset like the per-tile desync", () => {
    const clip = loopClip("t", FRAMES, 900);
    const nowMs = 350; // base index 1
    expect(cycleIndex(clip, nowMs, 0)).toBe(1);
    expect(cycleIndex(clip, nowMs, 1)).toBe(2);
    expect(cycleIndex(clip, nowMs, 2)).toBe(0); // wraps
  });

  it("beacon clip is a 2-frame ~1Hz blink (per-frame 500ms)", () => {
    expect(WEATHER_BEACON_CLIP.frames.length).toBe(2);
    expect(sampleCycle(WEATHER_BEACON_CLIP, 0)).toBe(WEATHER_BEACON_CLIP.frames[0]!.frame);
    expect(sampleCycle(WEATHER_BEACON_CLIP, 500)).toBe(WEATHER_BEACON_CLIP.frames[1]!.frame);
    expect(sampleCycle(WEATHER_BEACON_CLIP, 1000)).toBe(WEATHER_BEACON_CLIP.frames[0]!.frame);
  });

  it("foam clip advances over its period", () => {
    expect(FOAM_CLIP.totalDurationMs).toBe(1800);
  });
});

function sprite(over: Partial<SnapshotSprite>): SnapshotSprite {
  return {
    id: 1,
    x: 64,
    y: 64,
    rotation: 0,
    layer: 50,
    frame: "farmer/hoarder",
    alpha: 1,
    interpolate: true,
    action: null,
    label: null,
    facing: "down",
    ...over,
  };
}

describe("resolveFrameAndBob — action swing", () => {
  it("resolves the action pose frame and gives a non-frozen downward swing", () => {
    const s = sprite({ action: "till" });
    const a = resolveFrameAndBob(s, 0);
    const b = resolveFrameAndBob(s, 55); // ~quarter cycle later (period factor 110)
    expect(a.frame).toBe("farmer/hoarder/till");
    expect(b.frame).toBe("farmer/hoarder/till");
    // The swing oscillates, so two distinct times give distinct offsets...
    expect(a.bobY).not.toBe(b.bobY);
    // ...and the dip is bounded to [0, ~2.5px] (never lifts the sprite up).
    for (const t of [0, 20, 55, 110, 200, 333]) {
      const { bobY } = resolveFrameAndBob(sprite({ action: "till" }), t);
      expect(bobY).toBeGreaterThanOrEqual(-0.001);
      expect(bobY).toBeLessThanOrEqual(2.5001);
    }
  });

  it("idle (no action) does not use the work swing", () => {
    const idle = resolveFrameAndBob(sprite({ action: null }), 0);
    expect(idle.frame).toBe("farmer/hoarder");
  });

  it("cycles the fishing-spot bubbles over time", () => {
    const spots = ["structure/fishing-spot", "structure/fishing-spot-b", "structure/fishing-spot-c"];
    const base = resolveFrameAndBob(sprite({ id: null, frame: "structure/fishing-spot" }), 0);
    const later = resolveFrameAndBob(
      sprite({ id: null, frame: "structure/fishing-spot" }),
      450, // > one 400ms frame step → different bubble
    );
    expect(spots).toContain(base.frame);
    expect(spots).toContain(later.frame);
    expect(later.frame).not.toBe(base.frame);
  });
});
