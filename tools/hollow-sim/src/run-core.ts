/**
 * Wires the Hollow research CLI together (chunk hollow-07): bootstrap the
 * sim, apply an optional persona seed, subscribe the chronicle, tick with
 * periodic sampling, and hand back everything `index.ts` needs to export —
 * mirrors `tools/run-sim/src/run-core.ts`'s `runOnce`/`RunResult` shape.
 *
 * The observer here (chronicle subscriptions + per-sample metric reads) is
 * entirely OFF the sim's own tick path: `sim.tick()` is called exactly once
 * per tick with no arguments threaded in from here, and every read
 * (`sim.getSnapshot()`, `readLivingAgents`, `chronicle.events()`) is
 * read-only. Nothing in this file perturbs determinism.
 */
import { bootstrapHollowSim } from "@hollow/sim-core/sim-bootstrap";
import type { HollowSimOptions } from "@hollow/sim-core/sim-bootstrap";
import type { LineageEntry } from "@hollow/sim-core/lineage";
import { ONT_COMMUNITY } from "@hollow/sim-core/protocols";
import { createChronicle, countByOntology, type ChronicleEvent, type DeathsByCause } from "./chronicle";
import { loadPersonaSeed, applyPersonaSeed } from "./persona";
import {
  readLivingAgents,
  meanPairwiseTrust,
  wealthGini,
  meanGenes,
  communityStats,
  sumSocialCounts,
  COOP_VERBS,
  ANTAG_VERBS,
} from "./metrics";
import type { MetricsRow } from "./export";

export interface RunOptions {
  simOptions: HollowSimOptions;
  /** Sampling window, in ticks — one metrics row per this many ticks. */
  ticksPerYear: number;
  /** Safety-capped run length, in years (`maxYears * ticksPerYear` ticks). */
  maxYears: number;
  /** Optional path to a JSON persona/genome-seed file (see `persona.ts`). */
  personaSeedPath?: string;
}

export interface RunSummary {
  readonly seed: number;
  readonly ticksRun: number;
  readonly generationsOfDescent: number;
  readonly finalPopulation: number;
  readonly totalBirths: number;
  readonly deathsByCause: Readonly<DeathsByCause>;
  readonly totalCoopEvents: number;
  readonly totalAntagEvents: number;
  readonly communitiesFormed: number;
  readonly communitiesDissolved: number;
}

export interface RunResult {
  readonly metricsRows: MetricsRow[];
  readonly events: ChronicleEvent[];
  readonly lineage: LineageEntry[];
  readonly summary: RunSummary;
}

export function runResearch(opts: RunOptions): RunResult {
  const sim = bootstrapHollowSim(opts.simOptions);
  const chronicle = createChronicle(sim.bus);

  // Persona seed (if any) is applied BEFORE the first tick — see
  // `persona.ts`'s header for why this stays deterministic.
  if (opts.personaSeedPath !== undefined) {
    const seed = loadPersonaSeed(opts.personaSeedPath);
    applyPersonaSeed(sim, seed);
  }

  const metricsRows: MetricsRow[] = [];
  let prevSocialCounts: Readonly<Record<string, number>> = sim.getSnapshot().socialCounts;
  let prevBornCum = 0;
  let prevDeathsCause: DeathsByCause = { oldAge: 0, starvation: 0, violence: 0 };

  // Samples one metrics row at the sim's CURRENT tick. Diffs every
  // "_window" field against the running `prev*` state captured by the
  // previous sample (or the zeroed initial state for year 0), then updates
  // that state for next time.
  const sampleRow = (year: number): void => {
    const snap = sim.getSnapshot();
    const agents = readLivingAgents(sim);
    const deathsCause = chronicle.deathsByCause();

    const coopCum = sumSocialCounts(snap.socialCounts, COOP_VERBS);
    const antagCum = sumSocialCounts(snap.socialCounts, ANTAG_VERBS);
    const prevCoopCum = sumSocialCounts(prevSocialCounts, COOP_VERBS);
    const prevAntagCum = sumSocialCounts(prevSocialCounts, ANTAG_VERBS);

    const deathsCumNow = deathsCause.oldAge + deathsCause.starvation + deathsCause.violence;
    const deathsCumPrev = prevDeathsCause.oldAge + prevDeathsCause.starvation + prevDeathsCause.violence;

    const community = communityStats(snap);

    metricsRows.push({
      tick: snap.tick,
      year,
      population: snap.aliveCount,
      births_cum: snap.bornCount,
      births_window: snap.bornCount - prevBornCum,
      deaths_window: deathsCumNow - deathsCumPrev,
      deaths_oldAge_window: deathsCause.oldAge - prevDeathsCause.oldAge,
      deaths_starvation_window: deathsCause.starvation - prevDeathsCause.starvation,
      deaths_violence_window: deathsCause.violence - prevDeathsCause.violence,
      community_count: community.count,
      community_mean_size: community.meanSize,
      mean_pairwise_trust: meanPairwiseTrust(agents),
      wealth_gini: wealthGini(agents),
      coop_window: coopCum - prevCoopCum,
      antag_window: antagCum - prevAntagCum,
      genes: meanGenes(agents),
    });

    prevSocialCounts = snap.socialCounts;
    prevBornCum = snap.bornCount;
    prevDeathsCause = { ...deathsCause };
  };

  // Year 0 — a baseline sample of the founder population (post-persona-seed,
  // pre-tick), so the exported timeline shows the starting point, not just
  // the first `ticksPerYear`-tick delta.
  sampleRow(0);

  const totalTicks = opts.maxYears * opts.ticksPerYear;
  for (let tick = 1; tick <= totalTicks; tick++) {
    sim.tick();
    if (tick % opts.ticksPerYear === 0) {
      sampleRow(tick / opts.ticksPerYear);
    }
  }

  const finalSnap = sim.getSnapshot();
  const events = [...chronicle.events()];
  const deathsByCause = { ...chronicle.deathsByCause() };

  return {
    metricsRows,
    events,
    lineage: sim.lineage.all(),
    summary: {
      seed: opts.simOptions.seed,
      ticksRun: finalSnap.tick,
      generationsOfDescent: sim.lineage.generationsOfDescent(),
      finalPopulation: finalSnap.aliveCount,
      totalBirths: finalSnap.bornCount,
      deathsByCause,
      totalCoopEvents: sumSocialCounts(finalSnap.socialCounts, COOP_VERBS),
      totalAntagEvents: sumSocialCounts(finalSnap.socialCounts, ANTAG_VERBS),
      communitiesFormed: countByOntology(events, ONT_COMMUNITY.FORMED),
      communitiesDissolved: countByOntology(events, ONT_COMMUNITY.DISSOLVED),
    },
  };
}
