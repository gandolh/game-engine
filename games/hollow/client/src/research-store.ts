/**
 * research-store.ts — client-side accumulator for Hollow's research
 * observability feed (chunk hollow-10a). The sim worker
 * (`worker/sim-worker.ts`) posts a chronicle "events" delta (new events
 * only, since the last post) and a per-year "metrics" row on each sim-year
 * boundary — see that file's header. This module just accumulates both
 * into plain in-memory arrays and exposes read accessors + a subscribe
 * hook.
 *
 * Deliberately NO DOM, NO rendering — this is only the data-availability
 * seam chunk hollow-10a is scoped to. The chronicle list, dashboard
 * charts, and export buttons that actually CONSUME this store are
 * hollow-10b's job.
 *
 * `main.ts` wires the worker's `onmessage` "events"/"metrics" cases to
 * `ingestEvents`/`ingestMetricsRow` below; "snapshot"/"inspectResult"
 * messages are untouched, still routed straight to the app/inspect-panel
 * as before.
 *
 * `events` is capped at `CHRONICLE_CAP` (audit-12) — this is the SECOND of
 * Hollow's two chronicle heaps (the sim-side `Chronicle` in
 * `@hollow/sim-core/observe` is the first, capped the same way and for the
 * same reason — see that module's header). Before this, only the DOM
 * (`chronicle-panel.ts`'s `MAX_ROWS`) was ever bounded, so this array grew
 * for the life of the page even though the worker only ever posts NEW
 * events (never asks for a replay), which is exactly what made a long or
 * fast-forwarded session's main-thread heap grow unbounded. Reuses the same
 * `CHRONICLE_CAP` constant as the sim-side buffer (one number, one audit
 * finding, one reasoning — see `chronicle.ts`) rather than picking an
 * independent client-side number.
 *
 * Bounded the same way `chronicle.ts` bounds its own buffer, and for the
 * same reason: a fixed-capacity ring (O(1) eviction), not an
 * `Array.splice`/`shift` per ingest, which would cost O(`CHRONICLE_CAP`)
 * shifted elements EVERY time the worker posts a delta once the cap is
 * reached (this runs on the browser's main thread — the exact kind of
 * per-event synchronous cost `chronicle-panel.ts`'s own `MAX_ROWS` comment
 * already names as what makes a fast-forwarded session's tab freeze). The
 * ring is materialized into a plain array lazily, only when `getEvents()`
 * is actually read, and cached until the next ingest. */
import { CHRONICLE_CAP, type ChronicleEvent, type MetricsRow } from "@hollow/sim-core/observe";

type EventsListener = (delta: readonly ChronicleEvent[]) => void;
type MetricsListener = (row: MetricsRow) => void;

let ring: (ChronicleEvent | undefined)[] = new Array(CHRONICLE_CAP);
let head = 0; // index of the oldest retained event, once `size === CHRONICLE_CAP`
let size = 0; // number currently retained, 0 <= size <= CHRONICLE_CAP
let droppedEventCount = 0;
let materialized: readonly ChronicleEvent[] | null = null;

const metricsRows: MetricsRow[] = [];
const eventsListeners = new Set<EventsListener>();
const metricsListeners = new Set<MetricsListener>();

function pushEvent(ev: ChronicleEvent): void {
  if (size < CHRONICLE_CAP) {
    ring[size] = ev;
    size++;
  } else {
    // Full: overwrite the oldest slot and advance `head` past it — O(1)
    // eviction regardless of `CHRONICLE_CAP`, see this file's header.
    ring[head] = ev;
    head = (head + 1) % CHRONICLE_CAP;
    droppedEventCount++;
  }
  materialized = null;
}

function materializeEvents(): readonly ChronicleEvent[] {
  if (materialized) return materialized;
  const out: ChronicleEvent[] = new Array(size);
  for (let i = 0; i < size; i++) {
    out[i] = ring[(head + i) % CHRONICLE_CAP] as ChronicleEvent;
  }
  materialized = out;
  return out;
}

/** Appends a new batch of chronicle events (the worker's per-tick delta,
 *  already new-only — see this file's header) to the accumulated buffer,
 *  in arrival order, then notifies subscribers with just the new batch (the
 *  FULL delta, even any part of it that's immediately evicted below — a
 *  subscriber like the DOM panel wants to see everything that just
 *  happened, and applies its own much smaller display cap independently).
 *  A no-op for an empty delta (nothing happened this tick). Once the
 *  accumulated buffer would exceed `CHRONICLE_CAP`, the OLDEST entries are
 *  evicted to make room — `getDroppedEventCount()` tallies exactly how
 *  many, so a consumer that needs to know whether `getEvents()` is the
 *  complete history (e.g. an export) doesn't have to assume it is. */
export function ingestEvents(delta: readonly ChronicleEvent[]): void {
  if (delta.length === 0) return;
  for (const ev of delta) pushEvent(ev);
  for (const listener of eventsListeners) listener(delta);
}

/** Appends one metrics row (one sim-year boundary) to the accumulated time
 *  series, then notifies subscribers with the new row. */
export function ingestMetricsRow(row: MetricsRow): void {
  metricsRows.push(row);
  for (const listener of metricsListeners) listener(row);
}

/** The most recent chronicle events accumulated so far, oldest first —
 *  bounded to at most `CHRONICLE_CAP` (see this file's header); once the cap
 *  has been reached this is NOT the complete history — check
 *  `getDroppedEventCount()`. */
export function getEvents(): readonly ChronicleEvent[] {
  return materializeEvents();
}

/** Count of events evicted from the accumulated buffer because
 *  `CHRONICLE_CAP` was reached — 0 for any session that never hit the cap.
 *  `export-panel.ts` surfaces this so an `events.jsonl` export past the cap
 *  states honestly that it's missing the oldest N events, rather than
 *  silently exporting a truncated history as if it were complete. */
export function getDroppedEventCount(): number {
  return droppedEventCount;
}

/** All metrics rows accumulated so far, in sample order (index 0 is the
 *  year-0 baseline — see `worker/sim-worker.ts`'s header). */
export function getMetrics(): readonly MetricsRow[] {
  return metricsRows;
}

/** Subscribes to each NEW batch of chronicle events as it's ingested (NOT
 *  replayed for history already accumulated — call `getEvents()` first for
 *  that). Returns an unsubscribe function. */
export function onEvents(listener: EventsListener): () => void {
  eventsListeners.add(listener);
  return () => eventsListeners.delete(listener);
}

/** Subscribes to each NEW metrics row as it's ingested. Returns an
 *  unsubscribe function. */
export function onMetricsRow(listener: MetricsListener): () => void {
  metricsListeners.add(listener);
  return () => metricsListeners.delete(listener);
}

/** Clears all accumulated events/rows/listeners — exists for tests (this
 *  module is a singleton; a real page load only ever gets one fresh
 *  instance, so nothing in production code calls this). */
export function resetResearchStore(): void {
  ring = new Array(CHRONICLE_CAP);
  head = 0;
  size = 0;
  droppedEventCount = 0;
  materialized = null;
  metricsRows.length = 0;
  eventsListeners.clear();
  metricsListeners.clear();
}
