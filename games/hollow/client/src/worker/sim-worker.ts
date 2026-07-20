/**
 * Hollow sim worker — chunk hollow-01 scaffolding, extended by chunk
 * hollow-09c with a click-to-inspect round trip, and by chunk hollow-10a
 * with the chronicle-event + per-year-metrics feed.
 *
 * Drives `bootstrapHollowSim()` at 20 ticks/sec and posts a snapshot after
 * each tick, mirroring @citadel/client's src/worker/sim-worker.ts (the
 * Worker/postMessage pattern this file follows). `@engine/core` has no
 * `FixedStepClock` abstraction — the 20 Hz real-time cadence is this
 * transport's own pacing (a `setInterval`), same as Citadel's worker; the
 * sim-core `tick()` call itself only advances a tick counter.
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
 */
import { bootstrapHollowSim } from "@hollow/sim-core/sim-bootstrap";
import type { HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import { createChronicle, MetricsSampler, type ChronicleEvent, type MetricsRow } from "@hollow/sim-core/observe";
import type { LineageEntry } from "@hollow/sim-core/lineage";
import type { InspectDetail } from "../inspect-detail";
import { buildInspectDetail } from "./inspect";

export interface WorkerInitMessage {
  type: "init";
  seed: number;
  ticksPerDay: number;
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

export type WorkerInbound = WorkerInitMessage | WorkerInspectMessage | WorkerRequestLineageMessage;

export type WorkerOutbound =
  | { type: "ready" }
  | { type: "snapshot"; snapshot: HollowSnapshot }
  | { type: "inspectResult"; agentId: number; detail: InspectDetail | null }
  /** New chronicle events since the LAST `"events"` post — a delta, not
   *  the full accumulated buffer (see this file's header). */
  | { type: "events"; events: ChronicleEvent[] }
  /** One per-year(-boundary) metrics sample — see this file's header for
   *  the `tick % ticksPerDay === 0` cadence. */
  | { type: "metrics"; row: MetricsRow }
  /** Reply to `"requestLineage"` — every entry `sim.lineage.all()` has ever
   *  recorded, sorted ascending by id (see that method's own doc). */
  | { type: "lineage"; entries: LineageEntry[] };

const TICK_HZ = 20;

let intervalId: ReturnType<typeof setInterval> | null = null;
let simResult: ReturnType<typeof bootstrapHollowSim> | null = null;
let chronicle: ReturnType<typeof createChronicle> | null = null;
let metricsSampler: MetricsSampler | null = null;
let ticksPerDay = 0;
/** Count of chronicle events already posted — `chronicle.events()` is a
 *  monotonically-growing buffer; slicing from this index each tick yields
 *  exactly the new-since-last-post delta. */
let postedEventCount = 0;

function postSnapshot(): void {
  if (simResult === null) return;
  const snapshot = simResult.getSnapshot();
  self.postMessage({ type: "snapshot", snapshot } satisfies WorkerOutbound);
}

/** Posts only the chronicle events appended since the last call — a plain
 *  read of `chronicle.events()` (never mutates the world, draws no `Rng`;
 *  see this file's header). No-op (no message) when nothing new happened
 *  this tick, so quiet ticks don't spam empty-array messages. */
function postNewEvents(): void {
  if (chronicle === null) return;
  const events = chronicle.events();
  if (events.length <= postedEventCount) return;
  const delta = events.slice(postedEventCount);
  postedEventCount = events.length;
  self.postMessage({ type: "events", events: delta } satisfies WorkerOutbound);
}

/** Samples + posts one `MetricsRow` at `tick` via the shared
 *  `MetricsSampler` (same class/numbers `@tool/hollow-sim`'s `run-core.ts`
 *  uses) — read-only, see `@hollow/sim-core/observe`'s header. */
function sampleAndPostMetrics(year: number): void {
  if (simResult === null || chronicle === null || metricsSampler === null) return;
  const row = metricsSampler.sample(simResult, chronicle, year);
  self.postMessage({ type: "metrics", row } satisfies WorkerOutbound);
}

function startLoop(): void {
  if (simResult === null) return;
  if (intervalId !== null) clearInterval(intervalId);
  const result = simResult;
  const msPerTick = 1000 / TICK_HZ;
  intervalId = setInterval(() => {
    result.tick();
    postSnapshot();
    postNewEvents();
    const tick = result.getSnapshot().tick;
    if (ticksPerDay > 0 && tick % ticksPerDay === 0) {
      sampleAndPostMetrics(tick / ticksPerDay);
    }
  }, msPerTick);
}

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init": {
      simResult = bootstrapHollowSim({ seed: msg.seed, ticksPerDay: msg.ticksPerDay });
      ticksPerDay = msg.ticksPerDay;
      chronicle = createChronicle(simResult.bus);
      metricsSampler = new MetricsSampler();
      postedEventCount = 0;
      const ready: WorkerOutbound = { type: "ready" };
      self.postMessage(ready);
      // Year-0 baseline sample (post-bootstrap, pre-tick) — mirrors
      // `run-core.ts`'s own baseline `sampleRow(0)` call.
      sampleAndPostMetrics(0);
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
  }
};
