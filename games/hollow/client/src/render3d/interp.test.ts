import { describe, it, expect } from "vitest";
import type { HollowAgentSnapshot, HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import { lerpAgentPositions, SnapshotBuffer } from "./interp";

function makeAgent(id: number, gx: number, gy: number): HollowAgentSnapshot {
  return {
    id,
    kind: "villager",
    gx,
    gy,
    needs: {},
    inventory: {},
    starving: false,
    communityId: null,
    ageTicks: 0,
    stage: "adult",
    householdId: null,
    appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBrown" },
    action: "idle",
    occupation: "unassigned",
    diseased: false,
  };
}

function makeSnapshot(tick: number, agents: HollowAgentSnapshot[]): HollowSnapshot {
  return {
    tick,
    aliveCount: agents.length,
    agents,
    resourceNodes: [],
    communities: [],
    bornCount: 0,
    diedCount: 0,
    householdCount: 0,
    socialCounts: {},
  };
}

describe("lerpAgentPositions", () => {
  it("alpha=0 gives the prev position exactly", () => {
    const prev = [{ id: 1, gx: 0, gy: 0 }];
    const next = [{ id: 1, gx: 10, gy: 20 }];
    expect(lerpAgentPositions(prev, next, 0)).toEqual(new Map([[1, { x: 0, y: 0 }]]));
  });

  it("alpha=1 gives the next position exactly", () => {
    const prev = [{ id: 1, gx: 0, gy: 0 }];
    const next = [{ id: 1, gx: 10, gy: 20 }];
    expect(lerpAgentPositions(prev, next, 1)).toEqual(new Map([[1, { x: 10, y: 20 }]]));
  });

  it("alpha=0.5 gives the midpoint average of prev and next", () => {
    const prev = [{ id: 1, gx: 0, gy: 0 }];
    const next = [{ id: 1, gx: 10, gy: 20 }];
    const result = lerpAgentPositions(prev, next, 0.5);
    expect(result.get(1)).toEqual({ x: 5, y: 10 });
  });

  it("clamps out-of-range alpha into [0, 1]", () => {
    const prev = [{ id: 1, gx: 0, gy: 0 }];
    const next = [{ id: 1, gx: 10, gy: 0 }];
    expect(lerpAgentPositions(prev, next, -5).get(1)).toEqual({ x: 0, y: 0 });
    expect(lerpAgentPositions(prev, next, 5).get(1)).toEqual({ x: 10, y: 0 });
  });

  it("snaps a brand-new id (absent from prev) to its next position", () => {
    const prev: { id: number; gx: number; gy: number }[] = [];
    const next = [{ id: 7, gx: 4, gy: 4 }];
    expect(lerpAgentPositions(prev, next, 0.5).get(7)).toEqual({ x: 4, y: 4 });
  });

  it("drops an id present in prev but absent from next (despawned)", () => {
    const prev = [{ id: 1, gx: 0, gy: 0 }, { id: 2, gx: 1, gy: 1 }];
    const next = [{ id: 1, gx: 1, gy: 1 }];
    const result = lerpAgentPositions(prev, next, 0.5);
    expect(result.has(2)).toBe(false);
    expect(result.size).toBe(1);
  });
});

describe("SnapshotBuffer", () => {
  it("returns an empty position map before any snapshot has been ingested", () => {
    const buf = new SnapshotBuffer();
    expect(buf.getLatest()).toBeNull();
    expect(buf.interpolatedAgentPositions(0).size).toBe(0);
  });

  it("snaps to the first snapshot's positions (no history to lerp from yet)", () => {
    const buf = new SnapshotBuffer();
    buf.ingest(makeSnapshot(0, [makeAgent(1, 3, 4)]), 0);
    const pos = buf.interpolatedAgentPositions(0);
    expect(pos.get(1)).toEqual({ x: 3, y: 4 });
  });

  it("interpolates between the two latest snapshots as render time advances, never extrapolating past alpha=1", () => {
    const buf = new SnapshotBuffer();
    buf.ingest(makeSnapshot(0, [makeAgent(1, 0, 0)]), 0);
    buf.ingest(makeSnapshot(1, [makeAgent(1, 10, 0)]), 50); // measured interval: 50ms

    // Halfway through the measured interval since the latest snapshot arrived.
    expect(buf.alpha(75)).toBeCloseTo(0.5, 5);
    expect(buf.interpolatedAgentPositions(75).get(1)).toEqual({ x: 5, y: 0 });

    // Well past the interval (a stalled worker) — holds at latest, never overshoots.
    expect(buf.alpha(500)).toBe(1);
    expect(buf.interpolatedAgentPositions(500).get(1)).toEqual({ x: 10, y: 0 });
  });

  it("interpolatedTick eases prev.tick toward latest.tick by alpha", () => {
    const buf = new SnapshotBuffer();
    expect(buf.interpolatedTick(0)).toBe(0);
    buf.ingest(makeSnapshot(10, [makeAgent(1, 0, 0)]), 0);
    expect(buf.interpolatedTick(0)).toBe(10); // no history yet -> exact
    buf.ingest(makeSnapshot(11, [makeAgent(1, 0, 0)]), 50);
    expect(buf.interpolatedTick(75)).toBeCloseTo(10.5, 5);
    expect(buf.interpolatedTick(500)).toBe(11); // clamped, never past latest
  });

  it("getLatest() exposes the most recently ingested snapshot unmodified", () => {
    const buf = new SnapshotBuffer();
    const snap = makeSnapshot(3, [makeAgent(1, 1, 1)]);
    buf.ingest(snap, 0);
    expect(buf.getLatest()).toBe(snap);
  });
});
