/**
 * snapshot-builder/events.ts — buildEvents and buildMeets from system state.
 */

import type { MeetIndicatorSystem } from "../systems/meet-indicator";
import type { EventFeedSystem } from "../systems/event-feed";
import type { SnapshotMeet, SnapshotEvent } from "../snapshot";
import { EVENT_SNAPSHOT_CAP } from "./constants";

// ---------------------------------------------------------------------------
// Meet indicators
// ---------------------------------------------------------------------------

export function buildMeets(meetIndicators: MeetIndicatorSystem, tick: number): SnapshotMeet[] {
  return meetIndicators.active(tick).map((entry) => ({ farmerId: entry.farmerId }));
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

// Reused output buffer for buildEvents — the events feed is rebuilt every tick,
// so we avoid the previous slice()+map() double allocation by mutating a pooled
// array in place (records reused; trimmed to the live count).
//
// ⚠️ ALIASING: the returned array is reused across calls. In production this is
// safe because the snapshot is structured-cloned by postMessage before the next
// build, so the main thread holds an independent copy. Callers that invoke
// buildRenderSnapshot twice ON THE SAME THREAD (tests, headless run-sim) must
// not retain and compare `snapshot.events` across the two calls — copy first.
// (Current same-thread callers only compare observer/leaderboard, never events.)
const eventsScratch: SnapshotEvent[] = [];

export function buildEvents(eventFeed: EventFeedSystem): SnapshotEvent[] {
  // recent() is oldest-first; ship only the newest EVENT_SNAPSHOT_CAP lines.
  const all = eventFeed.recent();
  const start = Math.max(0, all.length - EVENT_SNAPSHOT_CAP);
  const n = all.length - start;
  const out = eventsScratch;
  for (let i = 0; i < n; i += 1) {
    const e = all[start + i]!;
    const rec = out[i];
    if (rec === undefined) {
      out[i] = { day: e.day, text: e.text, drama: e.drama, farmerId: e.farmerId ?? null };
    } else {
      rec.day = e.day;
      rec.text = e.text;
      rec.drama = e.drama;
      rec.farmerId = e.farmerId ?? null;
    }
  }
  if (out.length !== n) out.length = n;
  return out;
}
