/**
 * `MetricsSampler` — the per-year `MetricsRow` builder promoted out of the
 * Hollow research CLI's `run-core.ts` (chunk hollow-07) by chunk hollow-10a,
 * so both the headless CLI and the browser client's sim worker can sample
 * IDENTICAL rows off a live `BootedHollowSim` + `Chronicle` pair without
 * duplicating the windowing/cumulative-diff bookkeeping.
 *
 * Read-only / off-sim-path: `sample()` only calls `sim.getSnapshot()`,
 * `readLivingAgents(sim)` (a read-only world query), and
 * `chronicle.deathsByCause()` (a read of the chronicle's own running
 * tally) — nothing here mutates the world, advances a tick, or draws an
 * `Rng`.
 *
 * Stateful ONLY in the "previous sample" bookkeeping needed to turn each
 * snapshot's CUMULATIVE counters (`socialCounts`, `bornCount`,
 * `chronicle.deathsByCause()`) into this sample's WINDOW deltas — mirrors
 * `run-core.ts`'s original `prevSocialCounts`/`prevBornCum`/
 * `prevDeathsCause` closure variables field-for-field, so the numbers stay
 * byte-identical to the CLI's pre-promotion output (see `sample()`'s doc
 * below for why the zeroed initial state is numerically equivalent to the
 * original's "read the tick-0 snapshot before the first sample" ordering).
 */
import type { BootedHollowSim } from "../sim-bootstrap";
import type { Chronicle, DeathsByCause } from "./chronicle";
import type { MetricsRow } from "./export";
import {
  readLivingAgents,
  meanPairwiseTrust,
  wealthGini,
  meanGenes,
  communityStats,
  sumSocialCounts,
  activeFeudCount,
  COOP_VERBS,
  ANTAG_VERBS,
} from "./metrics";

export class MetricsSampler {
  private prevSocialCounts: Readonly<Record<string, number>> = {};
  private prevBornCum = 0;
  private prevDeathsCause: DeathsByCause = { oldAge: 0, starvation: 0, violence: 0 };

  /**
   * Samples one `MetricsRow` at `sim`'s CURRENT tick/snapshot, diffing
   * every "_window" field against the state captured by the PREVIOUS call
   * (or the zeroed initial state for the very first call — e.g. the
   * research CLI's "year 0" baseline sample, taken before the first
   * `tick()`). `sumSocialCounts` defaults every missing verb key to 0, and
   * `bornCum`/`deathsCause` are genuinely 0 before any tick has run, so an
   * empty/zeroed initial state produces the exact same year-0 window (0)
   * that the original `run-core.ts` got by reading a real (but still
   * all-zero) tick-0 snapshot before its first sample.
   */
  sample(sim: BootedHollowSim, chronicle: Chronicle, year: number): MetricsRow {
    const snap = sim.getSnapshot();
    const agents = readLivingAgents(sim);
    const deathsCause = chronicle.deathsByCause();

    const coopCum = sumSocialCounts(snap.socialCounts, COOP_VERBS);
    const antagCum = sumSocialCounts(snap.socialCounts, ANTAG_VERBS);
    const prevCoopCum = sumSocialCounts(this.prevSocialCounts, COOP_VERBS);
    const prevAntagCum = sumSocialCounts(this.prevSocialCounts, ANTAG_VERBS);

    const deathsCumNow = deathsCause.oldAge + deathsCause.starvation + deathsCause.violence;
    const deathsCumPrev =
      this.prevDeathsCause.oldAge + this.prevDeathsCause.starvation + this.prevDeathsCause.violence;

    const community = communityStats(snap);

    const row: MetricsRow = {
      tick: snap.tick,
      year,
      population: snap.aliveCount,
      births_cum: snap.bornCount,
      births_window: snap.bornCount - this.prevBornCum,
      deaths_window: deathsCumNow - deathsCumPrev,
      deaths_oldAge_window: deathsCause.oldAge - this.prevDeathsCause.oldAge,
      deaths_starvation_window: deathsCause.starvation - this.prevDeathsCause.starvation,
      deaths_violence_window: deathsCause.violence - this.prevDeathsCause.violence,
      community_count: community.count,
      community_mean_size: community.meanSize,
      mean_pairwise_trust: meanPairwiseTrust(agents),
      wealth_gini: wealthGini(agents),
      coop_window: coopCum - prevCoopCum,
      antag_window: antagCum - prevAntagCum,
      feud_active_dyads: activeFeudCount(agents),
      genes: meanGenes(agents),
    };

    this.prevSocialCounts = snap.socialCounts;
    this.prevBornCum = snap.bornCount;
    this.prevDeathsCause = { ...deathsCause };

    return row;
  }
}
