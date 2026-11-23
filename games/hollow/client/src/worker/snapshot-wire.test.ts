import { describe, it, expect } from "vitest";
import type { HollowAgentSnapshot, HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import { SnapshotBuffer } from "../render3d/interp";
import { agentPosition, packSnapshot } from "./snapshot-wire";

function agent(id: number, gx: number, gy: number, action = "walk"): HollowAgentSnapshot {
  return {
    id,
    kind: "villager",
    gx,
    gy,
    needs: { food: 0.5 },
    inventory: { grain: 2 },
    starving: false,
    communityId: 1,
    ageTicks: 10,
    stage: "adult",
    householdId: 3,
    appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBrown" },
    action,
    occupation: "farmer",
    diseased: false,
  };
}

function snapshot(agents: HollowAgentSnapshot[]): HollowSnapshot {
  return {
    tick: 7,
    aliveCount: agents.length,
    agents,
    resourceNodes: [],
    communities: [],
    bornCount: 0,
    diedCount: 0,
    householdCount: 1,
    socialCounts: { gift: 2 },
  };
}

describe("packSnapshot", () => {
  const agents = [agent(4, 12, 30), agent(9, 0, 5, "eat"), agent(2, 63, 63)];

  it("round-trips positions through a transferred array and keeps the strings in the object", () => {
    const packed = packSnapshot(snapshot(agents));
    const wire = structuredClone(packed, { transfer: [packed.agentPositions.buffer] });

    // jsdom's structuredClone builds the array in another realm, so `instanceof` would lie.
    expect(Object.prototype.toString.call(wire.agentPositions)).toBe("[object Float32Array]");
    wire.snapshot.agents.forEach((a, i) => {
      const src = agents[i] as HollowAgentSnapshot;
      expect(a.id).toBe(src.id);
      expect(a.action).toBe(src.action);
      expect(a.appearance).toEqual(src.appearance);
      expect("gx" in a).toBe(false);
      expect(agentPosition(wire.agentPositions, i)).toEqual({ gx: src.gx, gy: src.gy });
    });
    expect(wire.snapshot.tick).toBe(7);
    expect(wire.snapshot.socialCounts).toEqual({ gift: 2 });
  });

  it("detaches the source buffer, and a second pack allocates a fresh one", () => {
    const first = packSnapshot(snapshot(agents));
    structuredClone(first, { transfer: [first.agentPositions.buffer] });
    expect(first.agentPositions.byteLength).toBe(0);

    const second = packSnapshot(snapshot(agents));
    expect(second.agentPositions.buffer).not.toBe(first.agentPositions.buffer);
    expect(second.agentPositions.byteLength).toBe(agents.length * 2 * 4);
  });

  it("feeds the interpolation the same positions the plain snapshot held", () => {
    const buf = new SnapshotBuffer();
    const a = packSnapshot(snapshot([agent(1, 0, 0), agent(2, 8, 8)]));
    const b = packSnapshot(snapshot([agent(1, 10, 20), agent(2, 8, 8)]));
    const sent = [a, b].map((p) => structuredClone(p, { transfer: [p.agentPositions.buffer] }));
    sent.forEach((p, i) => buf.ingest(p.snapshot, p.agentPositions, i * 50));
    expect(buf.interpolatedAgentPositions(75).get(1)).toEqual({ x: 5, y: 10 });
    expect(buf.interpolatedAgentPositions(500).get(2)).toEqual({ x: 8, y: 8 });
  });

  it("handles a snapshot with no agents", () => {
    const packed = packSnapshot(snapshot([]));
    expect(packed.agentPositions.length).toBe(0);
    expect(packed.snapshot.agents).toEqual([]);
  });
});
