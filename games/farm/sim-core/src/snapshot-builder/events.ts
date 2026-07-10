import type { MeetIndicatorSystem } from "../systems/social/meet-indicator";
import type { EventFeedSystem } from "../systems/event-feed";
import type { SnapshotMeet, SnapshotEvent } from "../snapshot";
import { EVENT_SNAPSHOT_CAP } from "./constants";

export function buildMeets(meetIndicators: MeetIndicatorSystem, tick: number): SnapshotMeet[] {
  return meetIndicators.active(tick).map((entry) => ({ farmerId: entry.farmerId }));
}

export function buildEvents(eventFeed: EventFeedSystem): SnapshotEvent[] {
  const all = eventFeed.recent();
  const start = Math.max(0, all.length - EVENT_SNAPSHOT_CAP);
  const out: SnapshotEvent[] = [];
  for (let i = start; i < all.length; i += 1) {
    const e = all[i]!;
    out.push({ tick: e.tick, day: e.day, text: e.text, drama: e.drama, farmerId: e.farmerId ?? null });
  }
  return out;
}
