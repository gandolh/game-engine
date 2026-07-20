import { describe, it, expect } from "vitest";
import { boundsOf } from "@engine/core/render3d";
import type { HollowAgentSnapshot, HollowCommunitySnapshot, HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import { householdLayout, householdMemberCounts, homeMeshFor } from "./household-layout";

function makeAgent(
  id: number,
  householdId: number | null,
  communityId: number | null,
): HollowAgentSnapshot {
  return {
    id,
    kind: "villager",
    gx: 0,
    gy: 0,
    needs: {},
    inventory: {},
    starving: false,
    communityId,
    ageTicks: 0,
    stage: "adult",
    householdId,
    appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBrown" },
    action: "idle",
  };
}

function makeCommunity(id: number, territory: readonly { gx: number; gy: number }[]): HollowCommunitySnapshot {
  return { id, members: [], territory, stockpile: {}, norms: { shareRate: 0, cooperationExpectation: 0 } };
}

function makeSnapshot(
  agents: HollowAgentSnapshot[],
  communities: HollowCommunitySnapshot[] = [],
): HollowSnapshot {
  return {
    tick: 0,
    aliveCount: agents.length,
    agents,
    resourceNodes: [],
    communities,
    bornCount: 0,
    diedCount: 0,
    householdCount: new Set(agents.map((a) => a.householdId).filter((h) => h !== null)).size,
    socialCounts: {},
  };
}

describe("householdMemberCounts", () => {
  it("tallies member count per household, ignoring unaffiliated agents", () => {
    const snap = makeSnapshot([
      makeAgent(1, 10, null),
      makeAgent(2, 10, null),
      makeAgent(3, 11, null),
      makeAgent(4, null, null),
    ]);
    const counts = householdMemberCounts(snap);
    expect(counts.get(10)).toBe(2);
    expect(counts.get(11)).toBe(1);
    expect(counts.size).toBe(2);
  });
});

describe("householdLayout", () => {
  it("is stable across two snapshots with identical content (different object instances)", () => {
    const communities = [makeCommunity(1, [{ gx: 10, gy: 10 }, { gx: 12, gy: 10 }])];
    const agents = [makeAgent(1, 100, 1), makeAgent(2, 100, 1)];
    const snapA = makeSnapshot([...agents], [...communities]);
    const snapB = makeSnapshot(
      agents.map((a) => ({ ...a })),
      communities.map((c) => ({ ...c, territory: [...c.territory] })),
    );

    const layoutA = householdLayout(snapA);
    const layoutB = householdLayout(snapB);
    expect(layoutA.get(100)).toEqual(layoutB.get(100));
  });

  it("anchors a household near its majority community's territory centroid", () => {
    const communities = [
      makeCommunity(1, [{ gx: 5, gy: 5 }, { gx: 7, gy: 5 }]), // centroid (6, 5)
      makeCommunity(2, [{ gx: 50, gy: 50 }]),
    ];
    const agents = [makeAgent(1, 100, 1), makeAgent(2, 100, 1)];
    const layout = householdLayout(makeSnapshot(agents, communities));
    const pos = layout.get(100)!;
    // Anchored near (6, 5), not (50, 50) or the grid center — allow for the
    // small deterministic per-household fan-out offset.
    expect(Math.hypot(pos.x - 6, pos.y - 5)).toBeLessThan(12);
  });

  it("falls back to the grid center for a household with no affiliated community", () => {
    const agents = [makeAgent(1, 200, null)];
    const layout = householdLayout(makeSnapshot(agents, []));
    const pos = layout.get(200)!;
    // GRID_SIZE is 64 -> center (32, 32), plus a small fan-out offset.
    expect(Math.hypot(pos.x - 32, pos.y - 32)).toBeLessThan(12);
  });

  it("gives distinct households distinct positions (no stacking)", () => {
    const agents = [makeAgent(1, 100, null), makeAgent(2, 101, null)];
    const layout = householdLayout(makeSnapshot(agents, []));
    expect(layout.get(100)).not.toEqual(layout.get(101));
  });
});

describe("homeMeshFor", () => {
  it("grows the footprint (boundsOf extent) with member count", () => {
    const small = boundsOf(homeMeshFor(1));
    const big = boundsOf(homeMeshFor(6));
    const extentX = (b: { min: readonly [number, number, number]; max: readonly [number, number, number] }) =>
      b.max[0] - b.min[0];
    expect(extentX(big)).toBeGreaterThan(extentX(small));
  });

  it("adds structural detail (more triangles) for a bigger family", () => {
    const small = homeMeshFor(1);
    const mid = homeMeshFor(3); // crosses the "extra window" threshold
    const big = homeMeshFor(6); // crosses the "second wing" threshold
    expect(mid.tris.length).toBeGreaterThan(small.tris.length);
    expect(big.tris.length).toBeGreaterThan(mid.tris.length);
  });

  it("is deterministic for a given member count", () => {
    expect(homeMeshFor(4)).toEqual(homeMeshFor(4));
  });
});
