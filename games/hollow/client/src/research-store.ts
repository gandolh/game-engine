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
 */
import type { ChronicleEvent, MetricsRow } from "@hollow/sim-core/observe";

type EventsListener = (delta: readonly ChronicleEvent[]) => void;
type MetricsListener = (row: MetricsRow) => void;

const events: ChronicleEvent[] = [];
const metricsRows: MetricsRow[] = [];
const eventsListeners = new Set<EventsListener>();
const metricsListeners = new Set<MetricsListener>();

/** Appends a new batch of chronicle events (the worker's per-tick delta,
 *  already new-only — see this file's header) to the accumulated buffer,
 *  in arrival order, then notifies subscribers with just the new batch.
 *  A no-op for an empty delta (nothing happened this tick). */
export function ingestEvents(delta: readonly ChronicleEvent[]): void {
  if (delta.length === 0) return;
  events.push(...delta);
  for (const listener of eventsListeners) listener(delta);
}

/** Appends one metrics row (one sim-year boundary) to the accumulated time
 *  series, then notifies subscribers with the new row. */
export function ingestMetricsRow(row: MetricsRow): void {
  metricsRows.push(row);
  for (const listener of metricsListeners) listener(row);
}

/** All chronicle events accumulated so far, in arrival order. */
export function getEvents(): readonly ChronicleEvent[] {
  return events;
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
  events.length = 0;
  metricsRows.length = 0;
  eventsListeners.clear();
  metricsListeners.clear();
}
