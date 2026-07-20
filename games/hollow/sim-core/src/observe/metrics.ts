/**
 * Pure metric computations for Hollow's observability layer (promoted to
 * `@hollow/sim-core/observe` by chunk hollow-10a from the research CLI's
 * original `tools/hollow-sim/src/metrics.ts`, chunk hollow-07) — Gini,
 * mean-trust, mean-gene, and community aggregates, kept as PURE functions
 * over plain data so they're unit-testable without booting a sim (see
 * `metrics.test.ts`). `readLivingAgents` is the one function that actually
 * touches `sim.world` — a READ-ONLY query (never mutates a component,
 * never advances any `Rng`), mirroring `tools/run-sim/src/run-core.ts`'s
 * `summarize()` off-sim-path observer pattern.
 *
 * Single source of truth: both the headless CLI (`@tool/hollow-sim`, via a
 * thin re-export shim) and the browser client's sim worker import this
 * file directly, so the numbers are identical wherever they're computed.
 */
import { BEHAVIOR_GENES } from "../components";
import type { BootedHollowSim, HollowSnapshot } from "../sim-bootstrap";

/** One living agent's trait/relationship/wealth reading, used by every
 *  aggregate below. Plain data — no engine types leak past this file. */
export interface LivingAgentRead {
  readonly id: number;
  readonly wealth: number;
  readonly behavior: Readonly<Record<string, number>>;
  /** This agent's OWN relationship-ledger scores (one per known peer). */
  readonly relationshipScores: readonly number[];
}

/**
 * Reads every LIVING agent's wealth-need value, genome behavior genes, and
 * relationship-ledger scores directly off `sim.world` — none of this is on
 * `HollowSnapshot` (see hollow-07's brief). Read-only: `world.query` never
 * mutates, and nothing here writes back to any component. Sorted ascending
 * by id so every downstream aggregate is order-independent-safe and re-runs
 * diff byte-identically.
 */
export function readLivingAgents(sim: BootedHollowSim): LivingAgentRead[] {
  const out: LivingAgentRead[] = [];
  for (const e of sim.world.query("genome", "relationships", "needs")) {
    const wealthNeed = e.needs.byKind["wealth"];
    out.push({
      id: e.id ?? -1,
      wealth: wealthNeed ? wealthNeed.value : 0,
      behavior: e.genome.behavior,
      relationshipScores: [...e.relationships.byId.values()],
    });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

/**
 * Standard Gini coefficient over a set of non-negative values (the "sorted
 * ranks" formula: G = sum_i (2i - n - 1) * x_i / (n * sum x), 1-indexed
 * ascending sort). 0 for fewer than 2 values (nothing to compare) or when
 * every value is equal (all-equal cancels to a zero numerator); approaches
 * 1 as n grows for a single holder of all the wealth (exactly (n-1)/n for a
 * one-holder distribution at any finite n).
 */
export function gini(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let numerator = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = sorted[i]!;
    numerator += (2 * (i + 1) - n - 1) * x;
    sum += x;
  }
  if (sum === 0) return 0;
  return numerator / (n * sum);
}

/** Arithmetic mean, 0 for an empty input (nothing to average). */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Mean pairwise trust — flattens EVERY living agent's relationship-ledger
 *  entries into one array and averages it; an agent with no entries simply
 *  contributes none (not a zero) to that average. 0 if no entries exist
 *  anywhere (a fresh founder population before any trust has accrued). */
export function meanPairwiseTrust(agents: readonly LivingAgentRead[]): number {
  const all: number[] = [];
  for (const a of agents) {
    for (const score of a.relationshipScores) all.push(score);
  }
  return mean(all);
}

/** Wealth Gini over living agents' `wealth` need value. */
export function wealthGini(agents: readonly LivingAgentRead[]): number {
  return gini(agents.map((a) => a.wealth));
}

/** Mean of each `BEHAVIOR_GENES` gene over living agents, in
 *  `BEHAVIOR_GENES` order (the trait-drift signal) — a fixed-key record so
 *  the CSV/JSON columns stay stably ordered. Missing genes on a given agent
 *  (shouldn't happen post-spawn, but defensive) are skipped for that gene's
 *  mean rather than treated as 0. */
export function meanGenes(agents: readonly LivingAgentRead[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const gene of BEHAVIOR_GENES) {
    const values: number[] = [];
    for (const a of agents) {
      const v = a.behavior[gene];
      if (v !== undefined) values.push(v);
    }
    out[gene] = mean(values);
  }
  return out;
}

export interface CommunityStats {
  readonly count: number;
  readonly meanSize: number;
}

/** Community count + mean member-count over a snapshot's communities. */
export function communityStats(snapshot: HollowSnapshot): CommunityStats {
  const sizes = snapshot.communities.map((c) => c.members.length);
  return { count: snapshot.communities.length, meanSize: mean(sizes) };
}

/** Cooperative social verbs (per `HollowSnapshot.socialCounts`' vocabulary). */
export const COOP_VERBS = ["gift", "share", "help", "teach", "trade"] as const;
/** Antagonistic social verbs. */
export const ANTAG_VERBS = ["steal", "sabotage", "rumor", "attack"] as const;

/** Sums a snapshot's cumulative `socialCounts` over the given verb list —
 *  used both directly (for a running total) and diffed between two samples
 *  (for a per-window delta, see `sampler.ts`). */
export function sumSocialCounts(
  socialCounts: Readonly<Record<string, number>>,
  verbs: readonly string[],
): number {
  let total = 0;
  for (const verb of verbs) total += socialCounts[verb] ?? 0;
  return total;
}
