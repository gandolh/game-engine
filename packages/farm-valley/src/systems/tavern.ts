import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_SIMULATION } from "../protocols";
import type { EventFeedSystem, EventEntry } from "./event-feed";

/**
 * brief 44 — TavernSystem: the village social hub's barkeep.
 *
 * Responsibility here is the **gossip line**: each day-start the barkeep surfaces
 * one rumor drawn from the event feed (brief 20) onto the tavern entity, so the
 * village reads as informed/alive (diegetic narration). It is stamped on the
 * `tavern.gossip` field for the hover tooltip / observer panel.
 *
 * The other two tavern mechanics live elsewhere by design (mirroring how the
 * shop's order→fulfill split works):
 *   - **Hiring** a day-helper is an AP-gated `hire-help` ACT (see act.ts) that
 *     costs gold and grants an AP boost — handled where the farmer's gold/AP
 *     live, not here.
 *   - **Gathering** (idle/evening farmers pathing to the tavern) is queued by a
 *     deliberate helper (see watering.ts `deliberateTavernGather`) using the
 *     existing deterministic travel — the tavern is just a travel target.
 *
 * Determinism: the gossip pick is a PURE function of the event feed contents.
 * We pick the highest-drama recent entry, tie-broken by newest tick then by the
 * entry's stable `key` — no Math.random / Date.now. Detection of a new day
 * mirrors NoticeBoardSystem: snoop the tavern inbox for a fresh DAY_START.
 */

/** Window of recent feed entries the barkeep draws a rumor from. */
const GOSSIP_WINDOW = 12;

export class TavernSystem implements System {
  readonly name = "TavernSystem";

  private lastDayProcessed = -1;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly eventFeed: EventFeedSystem,
  ) {}

  run(_ctx: SimContext): void {
    const tavern = this.findTavern();
    if (!tavern || !tavern.inbox || !tavern.tavern) return;

    let newDay: number | null = null;
    for (const msg of tavern.inbox.messages) {
      if (msg.ontology === ONT_SIMULATION.DAY_START) {
        const day = (msg.body as { day: number }).day;
        if (day > this.lastDayProcessed) newDay = day;
      }
    }
    // The tavern inbox is cleared by nobody else, so drain it after snooping so a
    // stale DAY_START doesn't linger (it's broadcast-fanned each day).
    tavern.inbox.messages.length = 0;
    if (newDay === null) return;
    this.lastDayProcessed = newDay;

    const rumor = pickGossip(this.eventFeed.recent());
    tavern.tavern.gossip = rumor ?? "The valley is quiet today.";
    tavern.tavern.gossipDay = newDay;
  }

  private findTavern(): GameEntity | undefined {
    for (const e of this.world.query("tavern", "inbox")) return e;
    return undefined;
  }
}

/**
 * Deterministically pick a rumor line from the (newest-last) event feed: take the
 * most recent `GOSSIP_WINDOW` entries, choose the highest-drama one, tie-broken
 * by newest tick, then by stable key. Returns undefined when the feed is empty.
 * Exported for direct unit testing.
 */
export function pickGossip(feed: readonly EventEntry[]): string | undefined {
  if (feed.length === 0) return undefined;
  const window = feed.slice(Math.max(0, feed.length - GOSSIP_WINDOW));
  let best: EventEntry | undefined;
  for (const e of window) {
    if (best === undefined) { best = e; continue; }
    if (e.drama > best.drama) { best = e; continue; }
    if (e.drama < best.drama) continue;
    // Tie on drama: prefer newer tick; final tie-break on stable key.
    if (e.tick > best.tick) { best = e; continue; }
    if (e.tick < best.tick) continue;
    if (e.key < best.key) best = e;
  }
  if (!best) return undefined;
  return `"${best.text}," says the barkeep.`;
}
