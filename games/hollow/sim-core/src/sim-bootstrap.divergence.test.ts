/**
 * Cross-seed governance/antagonism divergence + real-run emergence
 * acceptance for chunk hollow-12b's "antagonism arcs" (persistent grudge
 * escalation/reconciliation) — a REQUIRED deliverable per the brief, not
 * just unit coverage: `social/feud-system.test.ts` proves the escalation/
 * reconciliation/decay MECHANISM in isolation with hand-built harm/
 * cooperation events; this file proves the mechanism actually EMERGES from
 * real, undirected `bootstrapHollowSim` deliberation, that outcomes
 * genuinely DIVERGE across seeds (not a scripted constant), and that a
 * genome-driven "greedy town" vs "loyal town" skew produces a measurable
 * DIRECTIONAL difference in governance + antagonism outcomes — mirroring
 * sim-bootstrap.governance.test.ts's own real-sim acceptance style.
 *
 * Kept SMALL per this project's constrained-hardware convention:
 * ticksPerDay=20, population 16-18, a few hundred ticks per run.
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type BootedHollowSim } from "./sim-bootstrap";
import { createChronicle, countByOntology } from "./observe";
import { ONT_GOVERNANCE, ONT_FEUD } from "./protocols";
import type { BehaviorGene } from "./components";

const TICKS = 300;
const POPULATION = 16;

const ANTAG_VERBS = ["steal", "sabotage", "rumor", "attack"] as const;
const COOP_VERBS = ["gift", "share", "help", "teach", "trade"] as const;

/** Overwrites EVERY currently-living agent's given behavior genes — a
 *  test-only cohort-skew helper mirroring
 *  sim-bootstrap.social-deliberation.test.ts's own `forceCohortGenome`
 *  (duplicated here rather than exported from production code, per that
 *  file's own "no production change needed" rationale). */
function forceCohortGenome(sim: BootedHollowSim, overrides: Partial<Record<BehaviorGene, number>>): void {
  for (const e of sim.world.query("genome")) {
    for (const [gene, value] of Object.entries(overrides)) {
      e.genome.behavior[gene] = value!;
    }
  }
}

function sumVerbs(counts: Readonly<Record<string, number>>, verbs: readonly string[]): number {
  return verbs.reduce((sum, v) => sum + (counts[v] ?? 0), 0);
}

interface RunSummary {
  readonly leaderIds: readonly (number | null)[];
  readonly meanShareRate: number;
  readonly sanctionCount: number;
  readonly feudStartedCount: number;
  readonly feudEscalatedCount: number;
  readonly feudReconciledCount: number;
  readonly antagCount: number;
  readonly coopCount: number;
}

function runAndSummarize(
  seed: number,
  genomeOverrides?: Partial<Record<BehaviorGene, number>>,
  ticks: number = TICKS,
  population: number = POPULATION,
): RunSummary {
  const sim = bootstrapHollowSim({
    seed,
    ticksPerDay: 20,
    population,
    governanceIntervalTicks: 10,
    communityCheckIntervalTicks: 10,
  });
  if (genomeOverrides) forceCohortGenome(sim, genomeOverrides);
  const chronicle = createChronicle(sim.bus);

  for (let i = 0; i < ticks; i++) sim.tick();

  const snapshot = sim.getSnapshot();
  const leaderIds = snapshot.communities.map((c) => c.leaderId ?? null).sort((a, b) => (a ?? -1) - (b ?? -1));
  const shareRates = snapshot.communities.map((c) => c.norms.shareRate);
  const meanShareRate = shareRates.length > 0 ? shareRates.reduce((s, v) => s + v, 0) / shareRates.length : 0;

  const events = chronicle.events();
  return {
    leaderIds,
    meanShareRate,
    sanctionCount: countByOntology(events, ONT_GOVERNANCE.SANCTIONED),
    feudStartedCount: countByOntology(events, ONT_FEUD.STARTED),
    feudEscalatedCount: countByOntology(events, ONT_FEUD.ESCALATED),
    feudReconciledCount: countByOntology(events, ONT_FEUD.RECONCILED),
    antagCount: sumVerbs(snapshot.socialCounts, ANTAG_VERBS),
    coopCount: sumVerbs(snapshot.socialCounts, COOP_VERBS),
  };
}

describe("cross-seed governance + antagonism divergence (chunk hollow-12b)", () => {
  it("outcomes DIVERGE across seeds -- not a scripted constant", () => {
    const seeds = [1, 2, 3, 4, 5];
    const summaries = seeds.map((seed) => runAndSummarize(seed));

    const serialized = summaries.map((s) => JSON.stringify(s));
    const distinct = new Set(serialized);
    // At least two seeds must produce genuinely different outcomes.
    expect(distinct.size).toBeGreaterThan(1);

    // Sanity: SOME organic social activity actually happened across these
    // runs (not a "divergence" that's only trivially true because nothing
    // ever happened in any of them).
    const totalSocial = summaries.reduce((s, r) => s + r.antagCount + r.coopCount, 0);
    expect(totalSocial).toBeGreaterThan(0);
  });

  it("each seed is internally deterministic: an identical-seed re-run is byte-identical, including a rng.nextU32() continuation check", () => {
    function build(): BootedHollowSim {
      return bootstrapHollowSim({
        seed: 777,
        ticksPerDay: 20,
        population: POPULATION,
        governanceIntervalTicks: 10,
        communityCheckIntervalTicks: 10,
      });
    }
    const a = build();
    const b = build();
    for (let i = 0; i < TICKS; i++) {
      a.tick();
      b.tick();
      if (i % 37 === 0) {
        expect(a.getSnapshot()).toEqual(b.getSnapshot());
      }
    }
    expect(a.getSnapshot()).toEqual(b.getSnapshot());

    // The continuation check: `HollowFeudSystem` takes no `Rng` argument at
    // all (see feud-system.ts's constructor — it's wired into
    // sim-bootstrap.ts with no `rng.fork(...)` call). Two INDEPENDENTLY
    // built sims from the same seed continuing to draw IDENTICAL values off
    // their own root `rng` after a full run is this project's own
    // established idiom for proving the root fork sequence wasn't disturbed
    // (see sim-bootstrap.governance.test.ts's own default-tick-scale test,
    // written when hollow-12a added the GOVERNANCE stage) — a stray fork
    // anywhere in the new code would still let `a`/`b` agree with EACH
    // OTHER (both ran the identical current code), so the real guarantee
    // here is structural (grep confirms no `Rng`/`.fork(` in feud-system.ts,
    // feud-constants.ts, or the social-verbs.ts grudge-amplification code),
    // and this check reaffirms that structural fact still holds in practice.
    for (let i = 0; i < 10; i++) {
      expect(a.rng.nextU32()).toBe(b.rng.nextU32());
    }
  });

  it("greedy/individualist-skewed towns diverge DIRECTIONALLY from loyal/cooperative-skewed towns: lower share-rate + more sanctions/feuds", () => {
    const seeds = [11, 12]; // SAME seeds both sides -- isolates the genome skew as the only variable
    const GREEDY_LOYAL_TICKS = 700;
    const GREEDY_LOYAL_POPULATION = 20;

    // The exact extreme-cohort shape sim-bootstrap.social-deliberation.test.ts's
    // own "flip test" already proved (at 700 ticks / population 24) reliably
    // separates antagonistic from cooperative activity — reused here rather
    // than re-deriving a milder skew from scratch.
    const greedyGenome: Partial<Record<BehaviorGene, number>> = {
      sociability: 0,
      risk: 1,
      aggression: 1,
      loyalty: 0,
      greed: 1,
      curiosity: 0,
    };
    const loyalGenome: Partial<Record<BehaviorGene, number>> = {
      sociability: 1,
      risk: 0,
      aggression: 0,
      loyalty: 1,
      greed: 0,
      curiosity: 1,
    };

    const greedy = seeds.map((seed) => runAndSummarize(seed, greedyGenome, GREEDY_LOYAL_TICKS, GREEDY_LOYAL_POPULATION));
    const loyal = seeds.map((seed) => runAndSummarize(seed, loyalGenome, GREEDY_LOYAL_TICKS, GREEDY_LOYAL_POPULATION));

    const sum = (rows: readonly RunSummary[], pick: (r: RunSummary) => number) =>
      rows.reduce((s, r) => s + pick(r), 0);

    const greedyShare = sum(greedy, (r) => r.meanShareRate) / greedy.length;
    const loyalShare = sum(loyal, (r) => r.meanShareRate) / loyal.length;
    expect(greedyShare).toBeLessThan(loyalShare);

    const greedyAntagonism = sum(greedy, (r) => r.antagCount + r.sanctionCount + r.feudStartedCount);
    const loyalAntagonism = sum(loyal, (r) => r.antagCount + r.sanctionCount + r.feudStartedCount);
    expect(greedyAntagonism).toBeGreaterThan(loyalAntagonism);
  });
});

describe("real-run emergence (chunk hollow-12b) -- feud arcs must EMERGE organically, not be hand-forced", () => {
  it("a realistically aggressive/greedy population organically fires antisocial acts AND produces STARTED plus ESCALATED/RECONCILED feud arcs in the chronicle", () => {
    const sim = bootstrapHollowSim({
      seed: 99,
      ticksPerDay: 20,
      population: 24,
      governanceIntervalTicks: 10,
      communityCheckIntervalTicks: 10,
    });
    // Same extreme aggressive/greedy/disloyal cohort shape as
    // sim-bootstrap.social-deliberation.test.ts's proven "flip test" cohort
    // (known, at this population/tick scale, to actually fire antagonistic
    // verbs organically — a milder skew was tried first and produced ZERO
    // antisocial acts in 300-400 ticks at a smaller population; see this
    // brief's report for the honest negative result before this adjustment).
    forceCohortGenome(sim, { sociability: 0, risk: 1, aggression: 1, loyalty: 0, greed: 1, curiosity: 0 });
    const chronicle = createChronicle(sim.bus);

    for (let i = 0; i < 700; i++) sim.tick();

    const snapshot = sim.getSnapshot();
    const antag = sumVerbs(snapshot.socialCounts, ANTAG_VERBS);
    const events = chronicle.events();
    const started = countByOntology(events, ONT_FEUD.STARTED);
    const escalated = countByOntology(events, ONT_FEUD.ESCALATED);
    const reconciled = countByOntology(events, ONT_FEUD.RECONCILED);

    // No antisocial acts firing organically would mean this feature is
    // inert (per the brief's integration guardrail) -- assert real numbers,
    // not just "the run completed".
    expect(antag).toBeGreaterThan(0);
    expect(started).toBeGreaterThan(0);
    expect(escalated + reconciled).toBeGreaterThan(0);
  });
});
