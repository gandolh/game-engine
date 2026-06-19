import type { SimContext, System, World, MessageBus } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_SIMULATION } from "../protocols";
import type { EventFeedSystem, EventEntry } from "./event-feed";

const GOSSIP_WINDOW = 12;

export class TavernSystem implements System {
  readonly name = "TavernSystem";

  private lastDayProcessed = -1;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly eventFeed: EventFeedSystem,
    private readonly bus?: MessageBus,
  ) {}

  run(_ctx: SimContext): void {
    const tavern = this.findTavern();
    if (!tavern || !tavern.inbox || !tavern.tavern) return;

    let newDay: number | null = null;
    for (const msg of tavern.inbox.messages) {
      if (msg.ontology === ONT_SIMULATION.DAY_START) {
        this.bus?.markRead(ONT_SIMULATION.DAY_START);
        const day = (msg.body as { day: number }).day;
        if (day > this.lastDayProcessed) newDay = day;
      }
    }
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

export function pickGossip(feed: readonly EventEntry[]): string | undefined {
  if (feed.length === 0) return undefined;
  const window = feed.slice(Math.max(0, feed.length - GOSSIP_WINDOW));
  let best: EventEntry | undefined;
  for (const e of window) {
    if (best === undefined) { best = e; continue; }
    if (e.drama > best.drama) { best = e; continue; }
    if (e.drama < best.drama) continue;

    if (e.tick > best.tick) { best = e; continue; }
    if (e.tick < best.tick) continue;
    if (e.key < best.key) best = e;
  }
  if (!best) return undefined;
  return `"${best.text}," says the barkeep.`;
}
