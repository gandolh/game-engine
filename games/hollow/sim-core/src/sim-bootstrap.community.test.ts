/**
 * Full-sim-level tests for chunk hollow-04 — communities emerging from the
 * REAL villager-driven `bootstrapHollowSim` loop (not the hand-built harness
 * in community/dynamics.test.ts, which engineers specific co-location
 * patterns directly). These catch END-TO-END wiring bugs (scheduler stage
 * order, options threading) that a component-level test can't, and prove
 * the "no pre-drawn factions, emergence differs by seed" requirement.
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSnapshot } from "./sim-bootstrap";

/** Every community's membership must agree with each member's own
 *  `communityId`, and every non-null `communityId` must point at a
 *  community that actually exists in the snapshot. */
function assertCommunityConsistency(snapshot: HollowSnapshot): void {
  const byAgentId = new Map(snapshot.agents.map((a) => [a.id, a]));
  const communityIds = new Set(snapshot.communities.map((c) => c.id));

  for (const community of snapshot.communities) {
    expect(community.members.length).toBeGreaterThan(0);
    // Membership is always kept sorted ascending (determinism note).
    expect([...community.members].sort((a, b) => a - b)).toEqual(community.members);
    for (const memberId of community.members) {
      expect(byAgentId.get(memberId)?.communityId).toBe(community.id);
    }
  }
  for (const agent of snapshot.agents) {
    if (agent.communityId !== null) {
      expect(communityIds.has(agent.communityId)).toBe(true);
    }
  }
}

function communitySignature(snapshot: HollowSnapshot): string {
  return snapshot.communities
    .map((c) => c.members.join(","))
    .sort()
    .join("|");
}

describe("communities emerge from the real villager-driven sim (chunk hollow-04)", () => {
  it("at least one real community (>= 3 members) crystallizes over a few hundred ticks, and the snapshot is internally consistent throughout", () => {
    const sim = bootstrapHollowSim({ seed: 1, ticksPerDay: 20, population: 20 });
    let sawAnyCommunity = false;
    for (let i = 0; i < 600; i++) {
      sim.tick();
      const snapshot = sim.getSnapshot();
      assertCommunityConsistency(snapshot);
      if (snapshot.communities.length > 0) sawAnyCommunity = true;
    }
    const finalSnapshot = sim.getSnapshot();
    expect(sawAnyCommunity).toBe(true);
    expect(finalSnapshot.communities.length).toBeGreaterThanOrEqual(1);
    for (const community of finalSnapshot.communities) {
      expect(community.members.length).toBeGreaterThanOrEqual(3);
      expect(community.norms.shareRate).toBeGreaterThan(0);
      expect(community.norms.cooperationExpectation).toBeGreaterThan(0);
    }
    // Not everyone need be affiliated (no pre-drawn factions), but SOME
    // agents genuinely are — real structure, not a decorative empty array.
    const affiliated = finalSnapshot.agents.filter((a) => a.communityId !== null).length;
    expect(affiliated).toBeGreaterThan(0);
  });

  it("different seeds produce genuinely different community structures (emergence, not a fixed layout)", () => {
    const signatures = [1, 2, 3].map((seed) => {
      const sim = bootstrapHollowSim({ seed, ticksPerDay: 20, population: 20 });
      for (let i = 0; i < 600; i++) sim.tick();
      return communitySignature(sim.getSnapshot());
    });
    // All three distinct — not just "different counts", the actual member
    // groupings differ.
    expect(new Set(signatures).size).toBe(3);
  });

  it("community membership couples to belonging: affiliated agents trend toward a higher belonging need than unaffiliated ones", () => {
    const sim = bootstrapHollowSim({ seed: 1, ticksPerDay: 20, population: 20 });
    for (let i = 0; i < 600; i++) sim.tick();
    const snapshot = sim.getSnapshot();
    const affiliated = snapshot.agents.filter((a) => a.communityId !== null);
    const unaffiliated = snapshot.agents.filter((a) => a.communityId === null);
    expect(affiliated.length).toBeGreaterThan(0);
    expect(unaffiliated.length).toBeGreaterThan(0);
    const avg = (agents: typeof affiliated): number =>
      agents.reduce((sum, a) => sum + (a.needs.belonging ?? 0), 0) / agents.length;
    expect(avg(affiliated)).toBeGreaterThan(avg(unaffiliated));
  });
});

describe("determinism (chunk hollow-04's community/trust/belonging systems, both tick scales)", () => {
  it("byte-identical snapshot sequences for the same seed at a LOW tick scale (ticksPerDay=20, 300 ticks — several community-check cycles)", () => {
    const a = bootstrapHollowSim({ seed: 777, ticksPerDay: 20, population: 25 });
    const b = bootstrapHollowSim({ seed: 777, ticksPerDay: 20, population: 25 });
    for (let i = 0; i < 300; i++) {
      a.tick();
      b.tick();
      expect(a.getSnapshot()).toEqual(b.getSnapshot());
    }
    // Confirm the community system actually produced real structure over
    // this run — this determinism check has to exercise non-trivial state,
    // not an all-null no-op that would trivially "match" either way.
    const snap = a.getSnapshot();
    expect(snap.communities.length).toBeGreaterThan(0);
    expect(snap.agents.some((ag) => ag.communityId !== null)).toBe(true);
  });

  it("byte-identical snapshot sequences for the same seed at the DEFAULT tick scale (ticksPerDay=1200, 1200 ticks) — sampled, not just the final tick", () => {
    const a = bootstrapHollowSim({ seed: 777, ticksPerDay: 1200, population: 25 });
    const b = bootstrapHollowSim({ seed: 777, ticksPerDay: 1200, population: 25 });
    for (let i = 0; i < 1200; i++) {
      a.tick();
      b.tick();
      if (i % 97 === 0) {
        expect(a.getSnapshot()).toEqual(b.getSnapshot());
      }
    }
    expect(a.getSnapshot()).toEqual(b.getSnapshot());
    for (let i = 0; i < 10; i++) {
      expect(a.rng.nextU32()).toBe(b.rng.nextU32());
    }
  });
});
