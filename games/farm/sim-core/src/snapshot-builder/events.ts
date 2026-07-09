import type { MeetIndicatorSystem } from "../systems/social/meet-indicator";
import type { EventFeedSystem } from "../systems/event-feed";
import type { SnapshotMeet, SnapshotEvent } from "../snapshot";
import { EVENT_SNAPSHOT_CAP } from "./constants";

export function buildMeets(meetIndicators: MeetIndicatorSystem, tick: number): SnapshotMeet[] {
  return meetIndicators.active(tick).map((entry) => ({ farmerId: entry.farmerId }));
}

const eventsScratch: SnapshotEvent[] = [];

export function buildEvents(eventFeed: EventFeedSystem): SnapshotEvent[] {
  const all = eventFeed.recent();
  const start = Math.max(0, all.length - EVENT_SNAPSHOT_CAP);
  const n = all.length - start;
  const out = eventsScratch;
  for (let i = 0; i < n; i += 1) {
    const e = all[start + i]!;
    const rec = out[i];
    if (rec === undefined) {
      out[i] = { tick: e.tick, day: e.day, text: e.text, drama: e.drama, farmerId: e.farmerId ?? null };
    } else {
      rec.tick = e.tick;
      rec.day = e.day;
      rec.text = e.text;
      rec.drama = e.drama;
      rec.farmerId = e.farmerId ?? null;
    }
  }
  if (out.length !== n) out.length = n;
  return out;
}
