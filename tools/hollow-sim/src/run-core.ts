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
  /** Optional override for the CLI's chronicle cap (default
   *  `HOLLOW_CLI_CHRONICLE_CAP`) — exists so a test can drive a short, cheap
   *  run past a tiny cap without paying for a run long enough to overflow
   *  250,000 for real. Production callers should never set this. */
  chronicleCap?: number;
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
  /** `chronicle.droppedCount()` at the end of the run (audit-32) — the exact
   *  number of captured events evicted because the CLI's own chronicle
   *  buffer (`HOLLOW_CLI_CHRONICLE_CAP` below) was full. 0 for any run that
   *  never reached the cap. Always present (never omitted) so a consumer of
   *  `events.jsonl` can't mistake a truncated export for a complete one —
   *  see this file's header and `summaryJson` in `./export`. */
  readonly droppedEventCount: number;
}

/**
 * The headless research CLI's own chronicle cap (audit-32) — deliberately
 * separate from `@hollow/sim-core/observe`'s `CHRONICLE_CAP` (50,000, sized
 * for a browser session sharing memory with a live DOM + 3D scene). This
 * process has no DOM to share memory with, and a research run is often
 * asked to run far longer than a look-in browser session (many sim-years,
 * `MAX_YEARS`/`TICKS_PER_YEAR` are both env-overridable — see `env.ts`), so
 * reusing the client's cap would make long CLI runs silently lossy well
 * before the CLI's own resource budget was actually threatened.
 *
 * 250,000 — 5x the client cap — keeps the buffer's footprint in the tens of
 * megabytes (flat, few-field event objects; see `CHRONICLE_CAP`'s own sizing
 * note) while still being a hard, finite bound: this project runs on
 * constrained hardware, and an unbounded buffer trades a truncated-but-
 * honest export for a run that OOM-kills itself instead (the ruling
 * explicitly rejects that trade — see corpus audit-32). A run that
 * genuinely exceeds this now reports the exact drop via
 * `droppedEventCount` rather than silently truncating.
 */
export const HOLLOW_CLI_CHRONICLE_CAP = 250_000;

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
  const chronicle = createChronicle(sim.bus, opts.chronicleCap ?? HOLLOW_CLI_CHRONICLE_CAP);

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
    // Chunk hollow-13c: `sim.rationalizer` is `null` unless
    // `HollowSimOptions.rationalizer` was set (the default), so this is a
    // no-op — no drain, no allocation, no chronicle write — for every run
    // that doesn't opt in, keeping seam-OFF output byte-identical. When set,
    // `drainDecisions()` hands over (and clears) whatever resolved since the
    // last drain; feeding it to the chronicle right after `tick()` keeps
    // rationalizer events in the same dispatch-order stream as everything
    // else this tick produced.
    const decisions = sim.rationalizer?.drainDecisions();
    if (decisions !== undefined && decisions.length > 0) {
      chronicle.captureRationalizerDecisions(decisions);
    }
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
      droppedEventCount: chronicle.droppedCount(),
    },
  };
}
