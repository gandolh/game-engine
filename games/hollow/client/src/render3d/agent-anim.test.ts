import { describe, it, expect } from "vitest";
import { transformPoint } from "@engine/core/render3d";
import {
  advanceGaitPhase,
  initialGaitPhase,
  AgentGaitTracker,
  STRIDE_TILES,
  MAX_GAIT_HZ,
  gaitPoseFor,
  walkBob,
  poseForAgent,
  computeFacing,
  AgentFacingTracker,
  agentModelMatrix,
} from "./agent-anim";

describe("advanceGaitPhase", () => {
  it("leaves the phase unchanged when no ground is covered", () => {
    expect(advanceGaitPhase(0.37, 0, 0.016)).toBe(0.37);
  });

  it("advances by distance / stride", () => {
    expect(advanceGaitPhase(0.1, STRIDE_TILES * 0.05, 0.016)).toBeCloseTo(0.15, 10);
  });

  it("wraps into [0, 1)", () => {
    const p = advanceGaitPhase(0.9, STRIDE_TILES * 0.3, 1);
    expect(p).toBeCloseTo(0.2, 10);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
  });

  it("caps the cadence at MAX_GAIT_HZ at 8x ground speed", () => {
    // 1x walker: ~24.6 tiles/s. 8x: ~197 tiles/s, asking for ~12.8 Hz. One 60 fps frame of it:
    const dt = 1 / 60;
    const eightX = 24.6 * 8 * dt;
    const next = advanceGaitPhase(0, eightX, dt);
    expect(next).toBeCloseTo(MAX_GAIT_HZ * dt, 10);
    expect(next * 60).toBeLessThanOrEqual(MAX_GAIT_HZ + 1e-9);
  });

  it("keeps 1.6 Hz for a walker at the 1x ground speed", () => {
    const dt = 1 / 60;
    let phase = 0;
    let cycles = 0;
    for (let i = 0; i < 600; i++) {
      const next = advanceGaitPhase(phase, 24.6 * dt, dt);
      cycles += (next - phase + 1) % 1;
      phase = next;
    }
    expect(cycles / 10).toBeGreaterThan(1.6 * 0.9);
    expect(cycles / 10).toBeLessThan(1.6 * 1.1);
  });
});

describe("initialGaitPhase", () => {
  it("is in [0, 1) and deterministic", () => {
    const p = initialGaitPhase(3);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
    expect(initialGaitPhase(3)).toBe(p);
  });
});

describe("AgentGaitTracker", () => {
  function run(tracker: AgentGaitTracker, ids: number[], frames: number, tilesPerFrame: number): number[] {
    let phases: number[] = [];
    for (let f = 0; f < frames; f++) {
      tracker.beginFrame(f * 16);
      phases = ids.map((id) => tracker.update(id, { x: f * tilesPerFrame, y: 0 }));
    }
    return phases;
  }

  it("holds the phase when the agent does not move (paused)", () => {
    const t = new AgentGaitTracker();
    const [moving] = run(t, [4], 10, 0.4);
    t.beginFrame(1000);
    const held = t.update(4, { x: 9 * 0.4, y: 0 });
    t.beginFrame(1016);
    expect(t.update(4, { x: 9 * 0.4, y: 0 })).toBe(held);
    expect(held).not.toBe(initialGaitPhase(4));
    expect(moving).toBeDefined();
  });

  it("starts each agent from its own offset, so two agents covering the same ground stay out of step", () => {
    const t = new AgentGaitTracker();
    const [a, b] = run(t, [1, 2], 30, 0.4);
    expect(a).not.toBeCloseTo(b as number, 3);
  });

  it("drops pruned agents", () => {
    const t = new AgentGaitTracker();
    run(t, [1, 2], 5, 0.4);
    t.prune(new Set([1]));
    t.beginFrame(9999);
    expect(t.update(2, { x: 0, y: 0 })).toBe(initialGaitPhase(2));
  });
});

describe("gaitPoseFor", () => {
  it("is walkA in the first half of the cycle and walkB in the second", () => {
    expect(gaitPoseFor(0.1)).toBe("walkA");
    expect(gaitPoseFor(0.5)).toBe("walkB");
    expect(gaitPoseFor(0.99)).toBe("walkB");
  });
});

describe("walkBob", () => {
  it("stays within [0, amplitude)", () => {
    for (let i = 0; i < 100; i++) {
      const b = walkBob(i / 100);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(0.1);
    }
  });

  it("is deterministic and follows the phase", () => {
    expect(walkBob(0.3)).toBe(walkBob(0.3));
    expect(walkBob(0)).toBeCloseTo(0, 10);
    expect(walkBob(0.25)).toBeCloseTo(0.05, 10);
  });
});

describe("poseForAgent", () => {
  it("uses the gait pose while moving, regardless of the coarse action label", () => {
    const pose = poseForAgent("idle", true, 0.1);
    expect(["walkA", "walkB"]).toContain(pose);
  });

  it("uses the gait pose whenever action is 'walk', even if this frame reads as still", () => {
    const pose = poseForAgent("walk", false, 0.1);
    expect(["walkA", "walkB"]).toContain(pose);
  });

  it("uses the static action pose when still and not walking", () => {
    expect(poseForAgent("eat", false, 0.1)).toBe("eat");
    expect(poseForAgent("idle", false, 0.1)).toBe("stand");
  });
});

describe("computeFacing", () => {
  it("does not move a brand-new agent (no previous position) and keeps last facing", () => {
    const r = computeFacing(undefined, { x: 5, y: 5 }, 0.42);
    expect(r.moving).toBe(false);
    expect(r.facing).toBe(0.42);
  });

  it("faces the direction of travel when moved", () => {
    const r = computeFacing({ x: 0, y: 0 }, { x: 1, y: 0 }, 0);
    expect(r.moving).toBe(true);
    expect(r.facing).toBeCloseTo(0, 5); // +x direction => 0 rad
  });

  it("faces +y as PI/2", () => {
    const r = computeFacing({ x: 0, y: 0 }, { x: 0, y: 1 }, 0);
    expect(r.facing).toBeCloseTo(Math.PI / 2, 5);
  });

  it("keeps last facing when the agent hasn't moved (below the noise epsilon)", () => {
    const r = computeFacing({ x: 2, y: 2 }, { x: 2, y: 2 }, 1.23);
    expect(r.moving).toBe(false);
    expect(r.facing).toBe(1.23);
  });
});

describe("AgentFacingTracker", () => {
  it("tracks per-agent state across update() calls, independent per id", () => {
    const tracker = new AgentFacingTracker();
    const first = tracker.update(1, { x: 0, y: 0 });
    expect(first.moving).toBe(false); // first sighting, no prior position

    const second = tracker.update(1, { x: 0, y: 1 });
    expect(second.moving).toBe(true);
    expect(second.facing).toBeCloseTo(Math.PI / 2, 5); // +y direction

    const still = tracker.update(1, { x: 0, y: 1 });
    expect(still.moving).toBe(false);
    expect(still.facing).toBeCloseTo(Math.PI / 2, 5); // keeps last heading

    const other = tracker.update(2, { x: 9, y: 9 });
    expect(other.moving).toBe(false); // independent state — agent 1's history doesn't leak in
  });

  it("prune() drops state for ids no longer alive", () => {
    const tracker = new AgentFacingTracker();
    tracker.update(1, { x: 0, y: 0 });
    tracker.update(1, { x: 0, y: 1 });
    tracker.prune(new Set());
    // After pruning, agent 1 is treated as brand-new again (no prior position).
    const afterPrune = tracker.update(1, { x: 5, y: 5 });
    expect(afterPrune.moving).toBe(false);
  });
});

describe("agentModelMatrix", () => {
  const base = { pos: { x: 0, y: 0 }, groundZ: 0, facing: 0, heightGene: 1, buildGene: 1, stageScale: 1, bobOffset: 0 };

  it("places a local z=0 (foot) point exactly at groundZ + bobOffset, at the agent's world position", () => {
    const m = agentModelMatrix({
      pos: { x: 3, y: 4 },
      groundZ: 1.5,
      facing: 0.7,
      heightGene: 1.1,
      buildGene: 0.95,
      stageScale: 1,
      bobOffset: 0.02,
    });
    const p = transformPoint(m, [0, 0, 0]);
    expect(p[0]).toBeCloseTo(3, 5);
    expect(p[1]).toBeCloseTo(4, 5);
    expect(p[2]).toBeCloseTo(1.52, 5);
  });

  it("rotates facing as expected (0 = +x, PI/2 = +y)", () => {
    const forward = transformPoint(agentModelMatrix({ ...base, facing: 0 }), [1, 0, 0]);
    expect(forward[0]).toBeCloseTo(1, 5);
    expect(forward[1]).toBeCloseTo(0, 5);

    const turned = transformPoint(agentModelMatrix({ ...base, facing: Math.PI / 2 }), [1, 0, 0]);
    expect(turned[0]).toBeCloseTo(0, 5);
    expect(turned[1]).toBeCloseTo(1, 5);
  });

  it("a taller heightGene grows the z-extent (a point above the origin ends up higher)", () => {
    const short = transformPoint(agentModelMatrix({ ...base, heightGene: 0.9 }), [0, 0, 1]);
    const tall = transformPoint(agentModelMatrix({ ...base, heightGene: 1.3 }), [0, 0, 1]);
    expect(tall[2]).toBeGreaterThan(short[2]);
  });
});
