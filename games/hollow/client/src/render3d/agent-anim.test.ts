import { describe, it, expect } from "vitest";
import { transformPoint } from "@engine/core/render3d";
import {
  walkPhase,
  gaitPoseFor,
  walkBob,
  poseForAgent,
  computeFacing,
  AgentFacingTracker,
  agentModelMatrix,
} from "./agent-anim";

describe("walkPhase", () => {
  it("is deterministic for the same (nowMs, agentId)", () => {
    expect(walkPhase(12345, 7)).toBe(walkPhase(12345, 7));
  });

  it("stays within [0, 1)", () => {
    for (const t of [0, 1, 999, 123456.7]) {
      const p = walkPhase(t, 3);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });

  it("gives different agents a different phase offset — not lockstep", () => {
    expect(walkPhase(0, 1)).not.toBe(walkPhase(0, 2));
  });
});

describe("gaitPoseFor", () => {
  it("alternates between walkA and walkB across a stride", () => {
    const poses = new Set<string>();
    for (let ms = 0; ms < 2000; ms += 50) poses.add(gaitPoseFor(ms, 5));
    expect(poses.has("walkA")).toBe(true);
    expect(poses.has("walkB")).toBe(true);
    expect(poses.size).toBe(2);
  });
});

describe("walkBob", () => {
  it("stays within [0, amplitude)", () => {
    for (let ms = 0; ms < 2000; ms += 37) {
      const b = walkBob(ms, 9);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(0.1);
    }
  });

  it("is deterministic for the same (nowMs, agentId)", () => {
    expect(walkBob(500, 11)).toBe(walkBob(500, 11));
  });
});

describe("poseForAgent", () => {
  it("uses the gait pose while moving, regardless of the coarse action label", () => {
    const pose = poseForAgent("idle", true, 0, 1);
    expect(["walkA", "walkB"]).toContain(pose);
  });

  it("uses the gait pose whenever action is 'walk', even if this frame reads as still", () => {
    const pose = poseForAgent("walk", false, 0, 1);
    expect(["walkA", "walkB"]).toContain(pose);
  });

  it("uses the static action pose when still and not walking", () => {
    expect(poseForAgent("eat", false, 0, 1)).toBe("eat");
    expect(poseForAgent("idle", false, 0, 1)).toBe("stand");
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
