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
 *
 * The per-year sampling loop (chunk hollow-10a) delegates to
 * `MetricsSampler` from `@hollow/sim-core/observe` — the same class the
 * browser client's sim worker uses for its own per-year sampling — so the
 * numbers/columns produced here are guaranteed identical to whatever the
 * client shows, not just parallel re-implementations of the same math.
 */
import { bootstrapHollowSim } from "@hollow/sim-core/sim-bootstrap";
import type { HollowSimOptions } from "@hollow/sim-core/sim-bootstrap";
import type { LineageEntry } from "@hollow/sim-core/lineage";
import { ONT_COMMUNITY } from "@hollow/sim-core/protocols";
import {
  createChronicle,
  countByOntology,
  sumSocialCounts,
  COOP_VERBS,
  ANTAG_VERBS,
  MetricsSampler,
  type ChronicleEvent,
  type DeathsByCause,
  type MetricsRow,
} from "@hollow/sim-core/observe";
import { loadPersonaSeed, applyPersonaSeed } from "./persona";

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
  const sampler = new MetricsSampler();

  // Year 0 — a baseline sample of the founder population (post-persona-seed,
  // pre-tick), so the exported timeline shows the starting point, not just
  // the first `ticksPerYear`-tick delta.
  metricsRows.push(sampler.sample(sim, chronicle, 0));

  const totalTicks = opts.maxYears * opts.ticksPerYear;
  for (let tick = 1; tick <= totalTicks; tick++) {
    sim.tick();
    if (tick % opts.ticksPerYear === 0) {
      metricsRows.push(sampler.sample(sim, chronicle, tick / opts.ticksPerYear));
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
