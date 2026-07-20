/**
 * Hollow sim worker — chunk hollow-01 scaffolding, extended by chunk
 * hollow-09c with a click-to-inspect round trip, by chunk hollow-10a with
 * the chronicle-event + per-year-metrics feed, and by chunk hollow-11b with
 * the director-role protocol: persona-seed boot, time controls (pure
 * pacing), shocks, and the intervention-log round trip.
 *
 * Drives `bootstrapHollowSim()` at a fixed 20 Hz base cadence and posts a
 * snapshot after each batch of ticks, mirroring @citadel/client's src/worker/
 * sim-worker.ts (the Worker/postMessage pattern this file follows). `@engine/
 * core` has no `FixedStepClock` abstraction — the 20 Hz real-time cadence is
 * this transport's own pacing (a `setInterval`), same as Citadel's worker;
 * the sim-core `tick()` call itself only advances a tick counter.
 *
 * `"inspect"` (chunk hollow-09c): a READ-ONLY query of live sim state for
 * one agent id, answered from the SAME `simResult` this loop already ticks
 * — never mutates the world, never advances a tick, draws no `Rng` (see
 * `worker/inspect.ts`'s header for the sim/render determinism boundary this
 * upholds). The actual assembly lives in `worker/inspect.ts` (kept out of
 * this file so it's unit-testable without a Worker global).
 *
 * `"events"`/`"metrics"` (chunk hollow-10a): the sim runs IN this worker, so
 * this is the only place with `bus`/`world` access for the research CLI's
 * promoted observability layer (`@hollow/sim-core/observe`, chunk
 * hollow-10a) — a `Chronicle` (subscribed once at `"init"`, same
 * `createChronicle(sim.bus)` the CLI's `run-core.ts` calls) and a
 * `MetricsSampler` (the exact per-year row builder `run-core.ts` uses,
 * promoted so the client's numbers are byte-identical to the CLI's). Both
 * are read-only/off-sim-path — see `@hollow/sim-core/observe`'s header —
 * so plumbing them through changes nothing about tick determinism.
 * `"events"` posts only the NEW chronicle events since the last post (a
 * delta, not the whole growing buffer); `"metrics"` posts one row per
 * `tick % ticksPerDay === 0` boundary, matching the CLI's per-year cadence
 * (`ticksPerDay` doubles as the worker's sampling window — there's no
 * separate `ticksPerYear` knob here), plus one baseline row right after
 * init (mirroring the CLI's own "year 0" pre-tick sample).
 *
 * `"requestLineage"` (chunk hollow-10b): a READ-ONLY query mirroring
 * `"inspect"`'s own round-trip contract — `sim.lineage.all()` is a plain
 * read of the permanent `LineageRegistry` (see `@hollow/sim-core/lineage`'s
 * header), never mutated here. Exists because `lineage.json`'s export data
 * (chunk hollow-10b's export panel) isn't in the client-side research store
 * (only the chronicle/metrics streams are) — the registry itself lives in
 * this worker's `simResult`, so a request/response round trip is the only
 * way for the client to read it.
 *
 * ── chunk hollow-11b: director-role protocol ─────────────────────────────
 * `"init"` gains optional `persona`/`replayLog`: on init, `persona`'s fields
 * are merged into the bootstrap options via `personaSeedToSimOptions`, then
 * `applyPersonaSeed(sim, persona)` runs ONCE right after `bootstrapHollowSim`
 * and BEFORE the first `tick()` (hollow-11a's contract); if `replayLog` is
 * given, `sim.loadInterventionLog(replayLog)` seeds the shock system's
 * pending queue from a prior run's exact log, so replaying the same
 * seed+persona+log reproduces the same town (see `run-descriptor.ts`).
 *
 * Time controls (`"setPaused"`/`"setSpeed"`/`"step"`) are PURE PACING — see
 * `startLoop`/`tickBatch` below: `paused` just skips the whole tick batch on
 * an interval fire, and `speedMultiplier` (`../time-control.ts`'s
 * `SPEED_OPTIONS`, snapped via `normalizeSpeedMultiplier`) is simply how many
 * `sim.tick()` calls happen per fixed-cadence interval fire — the interval
 * PERIOD itself never changes, so pacing never depends on wall-clock jitter
 * across different multipliers. `"step"` calls `tickBatch(1)` directly
 * (works whether paused or not, but is the only way to advance while
 * paused). NONE of this changes what a tick computes — determinism (CLAUDE.md)
 * is untouched.
 *
 * `"shock"` (chunk hollow-11b): the ONLY path that ever calls
 * `sim.scheduleShock` — never called from anywhere else in this file, so a
 * shock only ever enters the sim through the one documented, logged,
 * tick-boundary-applied entry point (hollow-11a's `HollowShockSystem`).
 * After scheduling, and on `"requestInterventions"`, this worker posts the
 * FULL current `interventionLog` (small — a handful of director actions per
 * run) so `main.ts`'s "Share" button can embed it in a run descriptor.
 *
 * Shock events reaching the chronicle: `@hollow/sim-core/observe`'s
 * `Chronicle` (hollow-10a) does NOT subscribe to `ONT_SHOCK.*` (that
 * ontology postdates it, hollow-11a) and this package's edit surface is
 * client-only (CLAUDE.md layering — `@hollow/sim-core` is out of scope for
 * hollow-11b), so this file subscribes to `ONT_SHOCK.*` directly on
 * `sim.bus` (same read-only `subscribeOntology` pattern `createChronicle`
 * itself uses) into a small local buffer, and `postNewEvents` below merges
 * that buffer's new-since-last-post entries with the chronicle's own delta
 * (sorted by tick) before posting — so a fired shock shows up in the
 * client's chronicle/dashboard without touching sim-core.
 */
import { bootstrapHollowSim } from "@hollow/sim-core/sim-bootstrap";
import type { HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import { createChronicle, MetricsSampler, type ChronicleEvent, type MetricsRow } from "@hollow/sim-core/observe";
import type { LineageEntry } from "@hollow/sim-core/lineage";
import { personaSeedToSimOptions, applyPersonaSeed, type PersonaSeed } from "@hollow/sim-core/persona";
import { ONT_SHOCK, type Shock, type Intervention } from "@hollow/sim-core/protocols";
import type { InspectDetail } from "../inspect-detail";
import { buildInspectDetail } from "./inspect";
import { normalizeSpeedMultiplier, type SpeedMultiplier } from "../time-control";

export interface WorkerInitMessage {
  type: "init";
  seed: number;
  ticksPerDay: number;
  /** Director-authored founding population/world (chunk hollow-11b) — see
   *  this file's header for the merge/apply order. Omitted entirely for a
   *  legacy plain-seed boot (byte-identical to pre-11b behavior). */
  persona?: PersonaSeed;
  /** A prior run's exact `interventionLog` — replays every shock at its
   *  original (tick, seq), see `sim.loadInterventionLog`'s doc
   *  (hollow-11a). */
  replayLog?: Intervention[];
}

export interface WorkerInspectMessage {
  type: "inspect";
  agentId: number;
}

/** Chunk hollow-10b: request every ever-recorded lineage entry (living or
 *  dead) for the export panel's `lineage.json` button — see this file's
 *  header. */
export interface WorkerRequestLineageMessage {
  type: "requestLineage";
}

/** Chunk hollow-11b: pure pacing — pause/resume the tick loop without
 *  touching tick logic (see this file's header). */
export interface WorkerSetPausedMessage {
  type: "setPaused";
  paused: boolean;
}

/** Chunk hollow-11b: pure pacing — how many ticks run per fixed-cadence
 *  interval fire. Snapped to the nearest `SPEED_OPTIONS` entry via
 *  `normalizeSpeedMultiplier` (see this file's header). */
export interface WorkerSetSpeedMessage {
  type: "setSpeed";
  multiplier: number;
}

/** Chunk hollow-11b: advance exactly one tick — the only way to move the
 *  sim forward while `paused`, but works unpaused too. */
export interface WorkerStepMessage {
  type: "step";
}

/** Chunk hollow-11b: schedule an environmental shock — the ONLY message
 *  that ever calls `sim.scheduleShock` (see this file's header). */
export interface WorkerShockMessage {
  type: "shock";
  shock: Shock;
}

/** Chunk hollow-11b: request the current `interventionLog` (also posted
 *  automatically after `"shock"`) — backs the "Share" button's run
 *  descriptor. */
export interface WorkerRequestInterventionsMessage {
  type: "requestInterventions";
}

export type WorkerInbound =
  | WorkerInitMessage
  | WorkerInspectMessage
  | WorkerRequestLineageMessage
  | WorkerSetPausedMessage
  | WorkerSetSpeedMessage
  | WorkerStepMessage
  | WorkerShockMessage
  | WorkerRequestInterventionsMessage;

export type WorkerOutbound =
  | { type: "ready" }
  | { type: "snapshot"; snapshot: HollowSnapshot }
  | { type: "inspectResult"; agentId: number; detail: InspectDetail | null }
  /** New chronicle events since the LAST `"events"` post — a delta, not
   *  the full accumulated buffer (see this file's header). Chunk hollow-11b:
   *  also carries any new `ONT_SHOCK.*` events, merged in and sorted by tick. */
  | { type: "events"; events: ChronicleEvent[] }
  /** One per-year(-boundary) metrics sample — see this file's header for
   *  the `tick % ticksPerDay === 0` cadence. */
  | { type: "metrics"; row: MetricsRow }
  /** Reply to `"requestLineage"` — every entry `sim.lineage.all()` has ever
   *  recorded, sorted ascending by id (see that method's own doc). */
  | { type: "lineage"; entries: LineageEntry[] }
  /** Chunk hollow-11b: the full current `interventionLog`, sent after a
   *  live `"shock"` schedule and on `"requestInterventions"`. */
  | { type: "interventions"; log: Intervention[] };

const BASE_TICK_HZ = 20;
const BASE_MS_PER_TICK = 1000 / BASE_TICK_HZ;

let intervalId: ReturnType<typeof setInterval> | null = null;
let simResult: ReturnType<typeof bootstrapHollowSim> | null = null;
let chronicle: ReturnType<typeof createChronicle> | null = null;
let metricsSampler: MetricsSampler | null = null;
let ticksPerDay = 0;
/** Count of chronicle events already posted — `chronicle.events()` is a
 *  monotonically-growing buffer; slicing from this index each tick yields
 *  exactly the new-since-last-post delta. */
let postedEventCount = 0;

// --- chunk hollow-11b: pure pacing state ------------------------------------
let paused = false;
let speedMultiplier: SpeedMultiplier = 1;

// --- chunk hollow-11b: local ONT_SHOCK capture (see this file's header) ----
const shockEventBuffer: ChronicleEvent[] = [];
let postedShockEventCount = 0;

function bodyTick(body: Record<string, unknown>): number {
  const t = body["tick"];
  return typeof t === "number" ? t : 0;
}

function subscribeShockEvents(): void {
  if (simResult === null) return;
  for (const ontology of Object.values(ONT_SHOCK)) {
    simResult.bus.subscribeOntology(ontology, (msg) => {
      shockEventBuffer.push({ tick: bodyTick(msg.body), ontology, ...msg.body });
    });
  }
}

function postSnapshot(): void {
  if (simResult === null) return;
  const snapshot = simResult.getSnapshot();
  self.postMessage({ type: "snapshot", snapshot } satisfies WorkerOutbound);
}

/** Posts only the chronicle + shock events appended since the last call — a
 *  plain read of `chronicle.events()`/`shockEventBuffer` (never mutates the
 *  world, draws no `Rng`; see this file's header). No-op (no message) when
 *  nothing new happened since the last post, so quiet ticks don't spam empty
 *  messages. Merges the two sources sorted by tick (chunk hollow-11b) so a
 *  shock lands in chronological order alongside ordinary sim events. */
function postNewEvents(): void {
  if (chronicle === null) return;
  const chronicleEvents = chronicle.events();
  const newChronicle = chronicleEvents.length > postedEventCount ? chronicleEvents.slice(postedEventCount) : [];
  postedEventCount = chronicleEvents.length;

  const newShock = shockEventBuffer.length > postedShockEventCount ? shockEventBuffer.slice(postedShockEventCount) : [];
  postedShockEventCount = shockEventBuffer.length;

  if (newChronicle.length === 0 && newShock.length === 0) return;
  const merged = [...newChronicle, ...newShock].sort((a, b) => a.tick - b.tick);
  self.postMessage({ type: "events", events: merged } satisfies WorkerOutbound);
}

/** Samples + posts one `MetricsRow` at `tick` via the shared
 *  `MetricsSampler` (same class/numbers `@tool/hollow-sim`'s `run-core.ts`
 *  uses) — read-only, see `@hollow/sim-core/observe`'s header. */
function sampleAndPostMetrics(year: number): void {
  if (simResult === null || chronicle === null || metricsSampler === null) return;
  const row = metricsSampler.sample(simResult, chronicle, year);
  self.postMessage({ type: "metrics", row } satisfies WorkerOutbound);
}

/** Posts the full current `interventionLog` (chunk hollow-11b) — small (a
 *  handful of director actions per run), so no delta bookkeeping needed. */
function postInterventions(): void {
  if (simResult === null) return;
  self.postMessage({ type: "interventions", log: [...simResult.interventionLog] } satisfies WorkerOutbound);
}

/** Advances the sim exactly `count` ticks (never more, never fewer — pure
 *  pacing, see this file's header), sampling metrics at every `ticksPerDay`
 *  boundary crossed WITHIN the batch (not just the batch's final tick, so a
 *  high `speedMultiplier` never skips a per-year sample). Does NOT post a
 *  snapshot/events itself — callers batch that once after the whole count. */
function tickBatch(count: number): void {
  if (simResult === null) return;
  for (let i = 0; i < count; i++) {
    simResult.tick();
    const tick = simResult.getSnapshot().tick;
    if (ticksPerDay > 0 && tick % ticksPerDay === 0) sampleAndPostMetrics(tick / ticksPerDay);
  }
}

function startLoop(): void {
  if (simResult === null) return;
  if (intervalId !== null) clearInterval(intervalId);
  // Fixed-cadence interval (chunk hollow-11b: NEVER re-periodized by speed —
  // see this file's header for why `speedMultiplier` instead changes how
  // many ticks run per fire).
  intervalId = setInterval(() => {
    if (paused) return;
    tickBatch(speedMultiplier);
    postSnapshot();
    postNewEvents();
  }, BASE_MS_PER_TICK);
}

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init": {
      const baseOpts = { seed: msg.seed, ticksPerDay: msg.ticksPerDay };
      const personaOpts = msg.persona ? personaSeedToSimOptions(msg.persona) : {};
      simResult = bootstrapHollowSim({ ...baseOpts, ...personaOpts });
      if (msg.persona) applyPersonaSeed(simResult, msg.persona);
      if (msg.replayLog) simResult.loadInterventionLog(msg.replayLog);

      ticksPerDay = msg.ticksPerDay;
      paused = false;
      speedMultiplier = 1;
      chronicle = createChronicle(simResult.bus);
      metricsSampler = new MetricsSampler();
      postedEventCount = 0;
      shockEventBuffer.length = 0;
      postedShockEventCount = 0;
      subscribeShockEvents();

      const ready: WorkerOutbound = { type: "ready" };
      self.postMessage(ready);
      // Year-0 baseline sample (post-bootstrap, pre-tick) — mirrors
      // `run-core.ts`'s own baseline `sampleRow(0)` call.
      sampleAndPostMetrics(0);
      postInterventions();
      startLoop();
      break;
    }
    case "inspect": {
      if (simResult === null) break;
      // Read-only — `getSnapshot().tick` just reads the tick counter this
      // loop already maintains; `buildInspectDetail` itself never mutates
      // `simResult` (see worker/inspect.ts's header).
      const currentTick = simResult.getSnapshot().tick;
      const detail = buildInspectDetail(simResult, currentTick, msg.agentId);
      self.postMessage({ type: "inspectResult", agentId: msg.agentId, detail } satisfies WorkerOutbound);
      break;
    }
    case "requestLineage": {
      if (simResult === null) break;
      // Read-only — see this file's header.
      const entries = simResult.lineage.all();
      self.postMessage({ type: "lineage", entries } satisfies WorkerOutbound);
      break;
    }
    case "setPaused": {
      paused = msg.paused;
      break;
    }
    case "setSpeed": {
      speedMultiplier = normalizeSpeedMultiplier(msg.multiplier);
      break;
    }
    case "step": {
      tickBatch(1);
      postSnapshot();
      postNewEvents();
      break;
    }
    case "shock": {
      if (simResult === null) break;
      // The ONLY call site for scheduleShock in this file — see header.
      simResult.scheduleShock(msg.shock);
      postInterventions();
      break;
    }
    case "requestInterventions": {
      postInterventions();
      break;
    }
  }
};
