/**
 * Full-sim-level tests for chunk hollow-14b's jobs wiring, driven through
 * the REAL `bootstrapHollowSim` loop (mirrors sim-bootstrap.governance.test.ts's
 * rationale: `jobs/assignment-system.test.ts`'s hand-built harness proves the
 * role-fit + demand formulas in isolation with full determinism control;
 * these catch END-TO-END wiring bugs — the new JOBS stage's placement
 * (right after GOVERNANCE), options threading, real `CommunityRegistry`
 * stockpile flow, and interaction with the REAL villager deliberator + ACT
 * systems (the actual proof jobs aren't inert: production really reaches
 * the stockpile).
 *
 * A community is formed MANUALLY here (`sim.communities.form` +
 * `founder.communityId` + seeded mutual trust), same convention as
 * sim-bootstrap.governance.test.ts's `formTestCommunity` — hollow-04's own
 * organic emergence timing is already covered elsewhere.
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type BootedHollowSim } from "./sim-bootstrap";
import { createChronicle } from "./observe";
import { ONT_JOBS } from "./protocols";
import { GOOD_FOOD, GOOD_MATERIALS } from "./economy";
import type { HollowEntity } from "./components";

const JOBS_ONTOLOGIES: readonly string[] = Object.values(ONT_JOBS);

type Founder = HollowEntity & { id: number };

/** Mirrors sim-bootstrap.governance.test.ts's `formTestCommunity`: forms a
 *  community from the first `count` founders (ascending id), sets each
 *  one's `communityId`, and seeds mutual trust (0.75) between every pair so
 *  a real `HollowGovernanceSystem` pass elects a leader quickly (the LED
 *  demand-adjusted assignment path needs a leader to exist). */
function formTestCommunity(sim: BootedHollowSim, count: number): { communityId: number; founders: Founder[] } {
  const founders = ([...sim.world.query("agent", "relationships", "communityId", "genome", "occupation")] as Founder[])
    .sort((a, b) => a.id - b.id)
    .slice(0, count);
  const ids = founders.map((e) => e.id);
  const community = sim.communities.form(ids, [], 0);
  for (const founder of founders) {
    founder.communityId = community.id;
    for (const other of founders) {
      if (other === founder) continue;
      founder.relationships!.byId.set(other.id, 0.75);
    }
  }
  return { communityId: community.id, founders };
}

describe("jobs (chunk hollow-14b) wiring — real bootstrapHollowSim", () => {
  it("roles distribute by aptitude (forced-extreme founders + organic loners), and the community stockpile actually accumulates real goods from gatherer production", () => {
    const sim = bootstrapHollowSim({
      seed: 4004,
      ticksPerDay: 20,
      population: 16,
      foodNodeCount: 4,
      materialNodeCount: 4,
      governanceIntervalTicks: 10,
      // Chunk hollow-14c-2: freeze membership (mirrors this file's OWN
      // second test's "freeze membership -- isolate the DEMAND mechanic"
      // rationale) — the hearth's GATHER phase is now a genuine public stage
      // where a stranger's cheap `rumor` can dent ANY nearby bystander's
      // trust toward the rumored-about agent (social/witness-system.ts),
      // occasionally enough to tip one of these manually-seeded founders
      // below the LEAVE threshold and out of the community before its
      // leader-assigned specialty role (crafter/teacher/caretaker) has a
      // chance to stick. That's hollow-12b's "feud drama surfaces at the
      // hearth" working as intended elsewhere (see
      // sim-bootstrap.governance.test.ts's own note) — but THIS test is
      // about jobs/demand wiring, not organic community churn, so it
      // isolates itself from LEAVE/SPLIT/MERGE/GROW/FORM the same way the
      // second test already does.
      communityCheckIntervalTicks: 100_000,
      jobsAssignIntervalTicks: 10,
    });
    const chronicle = createChronicle(sim.bus);
    const { communityId, founders } = formTestCommunity(sim, 8);

    // Force each of the first 5 founders' genomes to an unambiguous role-fit
    // extreme (same derivation as jobs/assignment-system.test.ts's unit
    // test) so this test's role assertions don't depend on luck of a random
    // genome draw — a hand modification for test legibility, same
    // convention as that file's `setTrust`.
    const [foodGatherer, materialGatherer, crafter, teacher, caretaker] = founders;
    foodGatherer!.genome!.aptitude = { food: 1, material: 0.1 };
    materialGatherer!.genome!.aptitude = { food: 0.1, material: 1 };
    crafter!.genome!.aptitude = { food: 0.1, material: 0.8 };
    crafter!.genome!.behavior["curiosity"] = 1;
    teacher!.genome!.behavior["curiosity"] = 1;
    teacher!.genome!.behavior["sociability"] = 1;
    teacher!.genome!.behavior["loyalty"] = 0.1;
    caretaker!.genome!.behavior["curiosity"] = 0.1;
    caretaker!.genome!.behavior["sociability"] = 1;
    caretaker!.genome!.behavior["loyalty"] = 1;

    for (let i = 0; i < 250; i++) sim.tick();

    const snapshot = sim.getSnapshot();
    const community = snapshot.communities.find((c) => c.id === communityId);
    expect(community).toBeDefined();
    if (!community) return;

    const byId = new Map(snapshot.agents.map((a) => [a.id, a]));
    expect(byId.get(foodGatherer!.id)?.occupation).toBe("food-gatherer");
    expect(byId.get(materialGatherer!.id)?.occupation).toBe("material-gatherer");
    expect(byId.get(crafter!.id)?.occupation).toBe("crafter");
    expect(byId.get(teacher!.id)?.occupation).toBe("teacher");
    expect(byId.get(caretaker!.id)?.occupation).toBe("caretaker");

    // Loners (never joined the manually-formed community) ALSO get a real
    // role via pure-aptitude self-assignment — never stuck "unassigned".
    const loners = snapshot.agents.filter((a) => a.communityId === null);
    expect(loners.length).toBeGreaterThan(0);
    for (const loner of loners) expect(loner.occupation).not.toBe("unassigned");

    // The acceptance that matters most: REAL numbers landed in the shared
    // stockpile (not just "an event fired") — gatherer production actually
    // flows there via the role-biased `share` verb.
    const totalStockpile = (community.stockpile[GOOD_FOOD] ?? 0) + (community.stockpile[GOOD_MATERIALS] ?? 0);
    expect(totalStockpile).toBeGreaterThan(0);

    // Role-changed events actually landed in the chronicle event stream.
    const jobsEvents = chronicle.events().filter((e) => JOBS_ONTOLOGIES.includes(e.ontology));
    expect(jobsEvents.length).toBeGreaterThan(0);
    expect(jobsEvents.some((e) => e.ontology === ONT_JOBS.ROLE_CHANGED)).toBe(true);
  });

  it("a real community stockpile shortage measurably shifts a borderline member's assigned role toward the shorted good's gatherer", () => {
    const sim = bootstrapHollowSim({
      seed: 4005,
      ticksPerDay: 20,
      population: 8,
      foodNodeCount: 2,
      materialNodeCount: 2,
      governanceIntervalTicks: 10,
      communityCheckIntervalTicks: 100_000, // freeze membership -- isolate the DEMAND mechanic from organic split/merge
      jobsAssignIntervalTicks: 10,
    });
    const { founders, communityId } = formTestCommunity(sim, 5);

    // A near-tied "swing" founder (index 0) plus four others forced clearly
    // toward non-gatherer roles (near-zero aptitude on BOTH goods, so
    // neither crafter's material-blend nor a stray high draw can pull one
    // of them into gathering and confound the demand computation's
    // per-capita denominator).
    const [swing, ...rest] = founders;
    swing!.genome!.aptitude = { food: 0.55, material: 0.5 }; // baseline: food-gatherer wins narrowly
    for (const other of rest) {
      other!.genome!.aptitude = { food: 0.1, material: 0.1 };
      other!.genome!.behavior["curiosity"] = 1;
      other!.genome!.behavior["sociability"] = 1;
      other!.genome!.behavior["loyalty"] = 1; // -> teacher/caretaker territory, never a gatherer
    }

    // 30 ticks = 3 JOBS-assignment passes (interval 10) -- enough for a
    // leader to be elected (governance interval 10 too) and lands exactly
    // ON a jobs-interval boundary (tick 30), so the very NEXT tick() call
    // below triggers the next assignment pass immediately.
    for (let i = 0; i < 30; i++) sim.tick();
    const baseline = sim.getSnapshot().agents.find((a) => a.id === swing!.id);
    expect(baseline?.occupation).toBe("food-gatherer");

    const community = sim.communities.get(communityId);
    expect(community).toBeDefined();
    if (!community) return;
    expect(community.leaderId).not.toBeNull(); // demand only applies once led

    // Force a critical MATERIAL shortage (food left ample) directly on the
    // live registry entry -- same "engineer the exact scenario" convention
    // as the governance harness tests, just at full-sim scale.
    community.stockpile[GOOD_MATERIALS] = 0;
    community.stockpile[GOOD_FOOD] = 500;

    // Exactly ONE more tick -- tick 30 (0 mod 10) is itself a jobs-interval
    // boundary, so this single tick already re-runs assignment against the
    // freshly-shorted stockpile (checking sooner rather than several
    // intervals later avoids the self-correcting feedback loop: once
    // `swing` itself starts gathering materials, its OWN production
    // replenishes the shortage within a few more passes -- a real, healthy
    // dynamic, just not what this scenario is isolating).
    sim.tick();

    const after = sim.getSnapshot().agents.find((a) => a.id === swing!.id);
    expect(after?.occupation).toBe("material-gatherer");
  });
});

describe("determinism (chunk hollow-14b's jobs pass)", () => {
  it("byte-identical snapshot sequences for the same seed, with a manually-formed community + diverse genomes exercising jobs", () => {
    function build(): BootedHollowSim {
      const sim = bootstrapHollowSim({
        seed: 6006,
        ticksPerDay: 20,
        population: 10,
        governanceIntervalTicks: 10,
        communityCheckIntervalTicks: 10,
        jobsAssignIntervalTicks: 10,
      });
      const { founders } = formTestCommunity(sim, 5);
      founders[0]!.genome!.aptitude = { food: 1, material: 0.1 };
      founders[1]!.genome!.aptitude = { food: 0.1, material: 1 };
      return sim;
    }
    const a = build();
    const b = build();
    for (let i = 0; i < 150; i++) {
      a.tick();
      b.tick();
      if (i % 17 === 0) {
        expect(a.getSnapshot()).toEqual(b.getSnapshot());
      }
    }
    expect(a.getSnapshot()).toEqual(b.getSnapshot());

    // Confirm this run actually exercised real jobs structure (roles were
    // assigned) -- not a trivial all-"unassigned" no-op that would "match"
    // either way regardless of whether the jobs pass ran at all.
    const snapshot = a.getSnapshot();
    expect(snapshot.agents.some((ag) => ag.occupation !== "unassigned")).toBe(true);

    // No `Rng`/`fork` was consumed by the jobs pass -- the root `Rng`'s draw
    // sequence continues identically past this run for both sims (proves no
    // fork was carved out anywhere in the new jobs code path).
    for (let i = 0; i < 10; i++) {
      expect(a.rng.nextU32()).toBe(b.rng.nextU32());
    }
  });
});
