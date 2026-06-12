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
  it("alternates the action pose with its -b strike frame (no bob)", () => {
    // id 0 → phase 0: t<220ms = base pose, t in [220,440) = -b.
    const a = resolveFrameAndBob(sprite({ id: 0, action: "till" }), 0);
    const b = resolveFrameAndBob(sprite({ id: 0, action: "till" }), 250);
    expect(a.frame).toBe("farmer/hoarder/till");
    expect(b.frame).toBe("farmer/hoarder/till-b");
    expect(a.bobY).toBe(0);
    expect(b.bobY).toBe(0);
  });

  it("maps each action to its pose and swings to a -b variant over time", () => {
    for (const [action, pose] of [
      ["chop-tree", "chop"],
      ["mine-stone", "mine"],
      ["water", "water"],
      ["harvest", "work"], // harvest has no dedicated pose → /work
    ] as const) {
      const a = resolveFrameAndBob(sprite({ id: 0, action }), 0);
      const b = resolveFrameAndBob(sprite({ id: 0, action }), 250);
      expect(a.frame).toBe(`farmer/hoarder/${pose}`);
      expect(b.frame).toBe(`farmer/hoarder/${pose}-b`);
    }
  });

  it("phase-shifts per entity id so two farmers don't swing in lockstep", () => {
    const even = resolveFrameAndBob(sprite({ id: 0, action: "till" }), 0).frame;
    const odd = resolveFrameAndBob(sprite({ id: 1, action: "till" }), 0).frame;
    expect(even).not.toBe(odd);
  });

  it("idle (no action) does not use the work swing", () => {
    const idle = resolveFrameAndBob(sprite({ action: null }), 0);
    expect(idle.frame).toBe("farmer/hoarder");
  });
});

describe("resolveFrameAndBob — walk cycle", () => {
  it("idle (not moving) returns the directional base frame + a bob", () => {
    const down = resolveFrameAndBob(sprite({ id: 0, moving: false, facing: "down" }), 0);
    const up = resolveFrameAndBob(sprite({ id: 0, moving: false, facing: "up" }), 0);
    const side = resolveFrameAndBob(sprite({ id: 0, moving: false, facing: "side" }), 0);
    expect(down.frame).toBe("farmer/hoarder");
    expect(up.frame).toBe("farmer/hoarder/up");
    expect(side.frame).toBe("farmer/hoarder/side");
    // idle bob is generally non-zero (sine), and there is no walk suffix
    expect(down.frame).not.toMatch(/walk/);
  });

  it("walks a 4-phase stride: contact-a → passing → contact-b → passing", () => {
    // id 0, phase 0, 110ms per phase. Sample the middle of each phase window.
    const at = (t: number) => resolveFrameAndBob(sprite({ id: 0, moving: true, facing: "down" }), t).frame;
    expect(at(55)).toBe("farmer/hoarder/walk-a"); // phase 0
    expect(at(165)).toBe("farmer/hoarder"); // phase 1 — neutral passing pose
    expect(at(275)).toBe("farmer/hoarder/walk-b"); // phase 2
    expect(at(385)).toBe("farmer/hoarder"); // phase 3 — passing
    expect(at(495)).toBe("farmer/hoarder/walk-a"); // wraps to phase 0
  });

  it("inserts the facing segment before the walk suffix", () => {
    const up = resolveFrameAndBob(sprite({ id: 0, moving: true, facing: "up" }), 55);
    const side = resolveFrameAndBob(sprite({ id: 0, moving: true, facing: "side" }), 55);
    expect(up.frame).toBe("farmer/hoarder/up/walk-a");
    expect(side.frame).toBe("farmer/hoarder/side/walk-a");
  });

  it("phase-shifts the stride per entity id", () => {
    const a = resolveFrameAndBob(sprite({ id: 0, moving: true, facing: "down" }), 55).frame;
    const b = resolveFrameAndBob(sprite({ id: 1, moving: true, facing: "down" }), 55).frame;
    expect(a).not.toBe(b);
  });

  it("action takes priority over the walk cycle", () => {
    const f = resolveFrameAndBob(sprite({ id: 0, moving: true, action: "till" }), 0).frame;
    expect(f).toBe("farmer/hoarder/till");
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
