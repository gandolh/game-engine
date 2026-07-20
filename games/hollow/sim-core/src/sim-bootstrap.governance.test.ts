/**
 * Full-sim-level tests for chunk hollow-12a's governance wiring, driven
 * through the REAL `bootstrapHollowSim` loop (mirrors
 * sim-bootstrap.community.test.ts's rationale: `governance/governance-
 * system.test.ts`'s hand-built harness proves the four sub-passes in
 * isolation with full determinism control; these catch END-TO-END wiring
 * bugs — the new GOVERNANCE stage's placement, options threading, and
 * interaction with the REAL `HollowCommunitySystem`/chronicle).
 *
 * A community is formed MANUALLY here (`sim.communities.form` + setting
 * each founder's `communityId`) rather than waiting for organic
 * crystallization — hollow-04's own emergence timing is already covered by
 * sim-bootstrap.community.test.ts; this file only needs SOME community to
 * exist so the governance pass has something to operate on.
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type BootedHollowSim } from "./sim-bootstrap";
import { createChronicle } from "./observe";
import { ONT_GOVERNANCE } from "./protocols";
import {
  NORM_SHARE_RATE_MIN,
  NORM_SHARE_RATE_MAX,
  NORM_COOPERATION_EXPECTATION_MIN,
  NORM_COOPERATION_EXPECTATION_MAX,
  NORM_ADMISSION_POLICY_MIN,
  NORM_ADMISSION_POLICY_MAX,
} from "./governance";

const GOVERNANCE_ONTOLOGIES: readonly string[] = Object.values(ONT_GOVERNANCE);

/**
 * Forms a community from the first `count` founders (ascending id), sets
 * each one's `communityId`, and seeds mutual trust (0.75, well above
 * `COMMUNITY_LEAVE_TRUST_THRESHOLD`) between every pair — `CommunityRegistry
 * .form` only builds the `Community.members` roster, it doesn't touch the
 * ECS entities or their (neutral, 0.5-default) trust ledgers (see
 * registry.ts's header), and a community placed at neutral trust would get
 * every member LEFT (and the whole thing DISSOLVED) by the very next real
 * `HollowCommunitySystem` pass — see community/constants.ts's
 * `COMMUNITY_LEAVE_TRUST_THRESHOLD` doc for why neutral already sits below
 * that floor. Returns the new community's id. */
function formTestCommunity(sim: BootedHollowSim, count: number): number {
  const founders = [...sim.world.query("agent", "relationships", "communityId")]
    .sort((a, b) => (a.id as number) - (b.id as number))
    .slice(0, count);
  const ids = founders.map((e) => e.id as number);
  const community = sim.communities.form(ids, [], 0);
  for (const founder of founders) {
    founder.communityId = community.id;
    for (const other of founders) {
      if (other === founder) continue;
      founder.relationships!.byId.set(other.id as number, 0.75);
    }
  }
  return community.id;
}

describe("governance (chunk hollow-12a) wiring — real bootstrapHollowSim", () => {
  it("a manually-formed community gets a leader + standing + in-bounds norms after a few governance passes, and governance events land in the chronicle", () => {
    const sim = bootstrapHollowSim({
      seed: 42,
      ticksPerDay: 20,
      population: 10,
      governanceIntervalTicks: 10,
      communityCheckIntervalTicks: 10,
    });
    const chronicle = createChronicle(sim.bus);
    const communityId = formTestCommunity(sim, 5);

    for (let i = 0; i < 60; i++) sim.tick();

    const snapshot = sim.getSnapshot();
    const community = snapshot.communities.find((c) => c.id === communityId);
    expect(community).toBeDefined();
    if (!community) return;

    expect(community.leaderId).not.toBeNull();
    expect(community.members).toContain(community.leaderId);
    expect(Object.keys(community.standing ?? {}).length).toBeGreaterThan(0);

    expect(community.norms.shareRate).toBeGreaterThanOrEqual(NORM_SHARE_RATE_MIN);
    expect(community.norms.shareRate).toBeLessThanOrEqual(NORM_SHARE_RATE_MAX);
    expect(community.norms.cooperationExpectation).toBeGreaterThanOrEqual(NORM_COOPERATION_EXPECTATION_MIN);
    expect(community.norms.cooperationExpectation).toBeLessThanOrEqual(NORM_COOPERATION_EXPECTATION_MAX);
    expect(community.norms.admissionPolicy ?? -1).toBeGreaterThanOrEqual(NORM_ADMISSION_POLICY_MIN);
    expect(community.norms.admissionPolicy ?? -1).toBeLessThanOrEqual(NORM_ADMISSION_POLICY_MAX);

    // The acceptance: governance events actually land in the chronicle event
    // stream, not just on the bus in the abstract.
    const governanceEvents = chronicle.events().filter((e) => GOVERNANCE_ONTOLOGIES.includes(e.ontology));
    expect(governanceEvents.length).toBeGreaterThan(0);
    expect(governanceEvents.some((e) => e.ontology === ONT_GOVERNANCE.LEADER_CHANGED)).toBe(true);
  });

  it("existing hollow-04/05/06 full-sim behavior is unaffected: communities still emerge organically with governance wired in", () => {
    const sim = bootstrapHollowSim({ seed: 1, ticksPerDay: 20, population: 20 });
    let sawAnyCommunity = false;
    for (let i = 0; i < 600; i++) {
      sim.tick();
      if (sim.getSnapshot().communities.length > 0) sawAnyCommunity = true;
    }
    expect(sawAnyCommunity).toBe(true);
  });
});

describe("determinism (chunk hollow-12a's governance pass)", () => {
  it("byte-identical snapshot sequences for the same seed, with a manually-formed community exercising governance", () => {
    function build(): BootedHollowSim {
      const sim = bootstrapHollowSim({
        seed: 555,
        ticksPerDay: 20,
        population: 12,
        governanceIntervalTicks: 10,
        communityCheckIntervalTicks: 10,
      });
      formTestCommunity(sim, 6);
      return sim;
    }
    const a = build();
    const b = build();
    for (let i = 0; i < 200; i++) {
      a.tick();
      b.tick();
      if (i % 17 === 0) {
        expect(a.getSnapshot()).toEqual(b.getSnapshot());
      }
    }
    expect(a.getSnapshot()).toEqual(b.getSnapshot());

    // Confirm this run actually exercised real governance structure (a
    // leader was elected) — not a trivial all-null no-op that would
    // "match" either way regardless of whether governance ran at all.
    const community = a.getSnapshot().communities[0];
    expect(community).toBeDefined();
    expect(community!.leaderId).not.toBeNull();
  });

  it("byte-identical snapshot sequences at the DEFAULT tick scale (ticksPerDay=1200), sampled — governance's default cadence under real pacing", () => {
    function build(): BootedHollowSim {
      const sim = bootstrapHollowSim({ seed: 321, ticksPerDay: 1200, population: 15 });
      formTestCommunity(sim, 6);
      return sim;
    }
    const a = build();
    const b = build();
    for (let i = 0; i < 400; i++) {
      a.tick();
      b.tick();
      if (i % 53 === 0) {
        expect(a.getSnapshot()).toEqual(b.getSnapshot());
      }
    }
    expect(a.getSnapshot()).toEqual(b.getSnapshot());
    for (let i = 0; i < 10; i++) {
      expect(a.rng.nextU32()).toBe(b.rng.nextU32());
    }
  });
});
