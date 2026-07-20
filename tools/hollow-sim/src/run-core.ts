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
 *
 * Chunk hollow-11a additionally lets a persona seed's own `seed`/density
 * fields (`personaSeedToSimOptions`) flow INTO `simOptions` before bootstrap
 * (a persona seed can now fully describe a scenario, not just gene biases),
 * and lets an optional recorded `interventionLog` replay onto the fresh sim
 * before the tick loop starts — see `intervention-log.ts` and
 * `sim-bootstrap.ts`'s `loadInterventionLog`.
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
import { loadPersonaSeed, applyPersonaSeed, personaSeedToSimOptions } from "./persona";
import { loadInterventionLog } from "./intervention-log";

export interface RunOptions {
  simOptions: HollowSimOptions;
  /** Sampling window, in ticks — one metrics row per this many ticks. */
  ticksPerYear: number;
  /** Safety-capped run length, in years (`maxYears * ticksPerYear` ticks). */
  maxYears: number;
  /** Optional path to a JSON persona/genome-seed file (see `persona.ts`). */
  personaSeedPath?: string;
  /** Optional path to a JSON `Intervention[]` log to REPLAY (chunk
   *  hollow-11a) — see `intervention-log.ts`. */
  interventionLogPath?: string;
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
  // Persona seed (if any) is loaded FIRST so its seed/density fields can
  // flow into `simOptions` before `bootstrapHollowSim` — see this file's
  // header. A legacy-only seed (no `seed`/density fields) contributes
  // nothing here (`personaSeedToSimOptions` returns `{}`), so `simOptions`
  // is unchanged from before this brief in that case.
  const personaSeed = opts.personaSeedPath !== undefined ? loadPersonaSeed(opts.personaSeedPath) : undefined;
  const simOptions: HollowSimOptions = personaSeed
    ? { ...opts.simOptions, ...personaSeedToSimOptions(personaSeed) }
    : opts.simOptions;

  const sim = bootstrapHollowSim(simOptions);
  const chronicle = createChronicle(sim.bus);

  // Gene overrides (if any) are applied BEFORE the first tick — see
  // `persona.ts`'s header for why this stays deterministic.
  if (personaSeed) applyPersonaSeed(sim, personaSeed);

  // Intervention-log REPLAY (chunk hollow-11a) — also seeded before the
  // first tick so every logged shock applies at its recorded tick boundary,
  // same as it did the first time (`shockSystem`'s pending queue is fresh on
  // a brand-new sim, so there's no "already past" entry to skip here).
  if (opts.interventionLogPath !== undefined) {
    sim.loadInterventionLog(loadInterventionLog(opts.interventionLogPath));
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
      seed: simOptions.seed,
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
