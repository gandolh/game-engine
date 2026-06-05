// EventFeedSystem — passive, read-only snoop that narrates notable economic
// moments into a capped, deterministic activity feed.
//
// Placement (see sim-bootstrap): runs between InboxDispatchSystem and
// PerceiveSystem, alongside TrustSystem, so it observes messages routed to
// inboxes (and the market wall inbox) BEFORE PerceiveSystem clears them and
// before MarketSystem drains the wall. It MUST NOT consume or mutate any
// message — it only reads `inbox.messages`. It adds no bus traffic.
//
// Determinism guarantees:
//   - No Date.now / Math.random / wall-clock.
//   - Each captured event carries a stable `key`; a Set of seen keys dedups
//     re-observation across ticks (an inbox message lives until PerceiveSystem
//     clears it, so the same message would otherwise be re-snooped).
//   - Within a single run() the freshly captured events are sorted by `key`
//     before being appended, so a replay produces a byte-identical feed.
//
// Snoop sources (single, deterministic surface per ontology to avoid
// double-counting broadcasts that fan out into every inbox):
//   - market wall inbox: ONT_MARKET.TRADE_COMPLETED, ONT_SHOP.AUCTION_RESULT,
//     ONT_SIMULATION.SHOCK (all broadcast/wall-routed; the wall is one entity).
//   - farmer inboxes:    ONT_ENCOUNTER.ACCEPT (peer seed deals).
//
// The worker's existing SHOCK bus-subscription (snapshot.shock) is left
// untouched; that surfaces a one-shot banner. We derive the feed line
// independently from the wall inbox and dedup it by (day,target), so the shock
// is not counted twice within the feed.

import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_ENCOUNTER, type AcceptBody } from "../protocols/encounter";
import { ONT_MARKET } from "../protocols/market";
import { ONT_SHOP, type AuctionResultBody } from "../protocols/shop";
import {
  ONT_SIMULATION,
  type ShockBody,
  type CropDeathBody,
} from "../protocols/simulation";
import type { DayClockSystem } from "./day-clock";

/** A single formatted feed entry. Internally the list is newest-LAST. */
export interface EventEntry {
  /** Sim tick the underlying message was observed on. */
  tick: number;
  /** Sim day for the "Day N —" prefix. */
  day: number;
  /** Human-readable narration line. */
  text: string;
  /** Stable per-event identity used for dedup + intra-tick ordering. */
  key: string;
}

/** Minimal TRADE_COMPLETED body shape we narrate (mirrors TrustSystem). */
interface TradeCompletedBody {
  offerId?: string;
  buyerId?: number;
  sellerId?: number;
  crop?: string;
  quantity?: number;
  pricePerUnit?: number;
}

/** Internal cap — the panel shows ~30; we keep a little extra history. */
export const EVENT_FEED_CAP = 50;

export class EventFeedSystem implements System {
  readonly name = "EventFeedSystem";

  /** Feed entries, newest-LAST. Capped at EVENT_FEED_CAP. */
  private readonly events: EventEntry[] = [];

  /** Keys already captured, so re-observed inbox messages aren't re-added. */
  private readonly seen = new Set<string>();

  /** Reused per-tick scratch for this tick's fresh entries (cleared each run)
   *  so the hot path doesn't allocate a new array every tick. */
  private readonly fresh: EventEntry[] = [];

  constructor(
    private readonly world: World<GameEntity>,
    private readonly dayClock: DayClockSystem,
  ) {}

  run(ctx: SimContext): void {
    const day = this.dayClock.day;
    // Collect this tick's fresh entries (reused scratch), then sort by stable
    // key before appending so replays are byte-identical regardless of query
    // order.
    const fresh = this.fresh;
    fresh.length = 0;

    this.snoopMarketWall(ctx.tick, day, fresh);
    this.snoopFarmerInboxes(ctx.tick, day, fresh);

    if (fresh.length === 0) return;
    fresh.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (const entry of fresh) {
      this.events.push(entry);
    }
    // Trim oldest (front) entries beyond the cap.
    if (this.events.length > EVENT_FEED_CAP) {
      this.events.splice(0, this.events.length - EVENT_FEED_CAP);
    }
  }

  // ---- market wall snoop -------------------------------------------------
  // TRADE_COMPLETED, AUCTION_RESULT and SHOCK all land in the (single) market
  // wall inbox: TRADE_COMPLETED is routed there by sellers, the other two are
  // broadcasts that InboxDispatchSystem fans into every inbox. Reading them
  // from the wall alone gives a single deterministic source per ontology.

  private snoopMarketWall(tick: number, day: number, out: EventEntry[]): void {
    for (const wall of this.world.query("marketWall", "inbox")) {
      for (const msg of wall.inbox.messages) {
        switch (msg.ontology) {
          case ONT_MARKET.TRADE_COMPLETED:
            this.captureTrade(msg.body as TradeCompletedBody, tick, day, out);
            break;
          case ONT_SHOP.AUCTION_RESULT:
            this.captureAuction(
              msg.body as unknown as AuctionResultBody,
              tick,
              day,
              out,
            );
            break;
          case ONT_SIMULATION.SHOCK:
            this.captureShock(msg.body as unknown as ShockBody, tick, day, out);
            break;
          case ONT_SIMULATION.CROP_DEATH:
            this.captureCropDeath(
              msg.body as unknown as CropDeathBody,
              tick,
              day,
              out,
            );
            break;
          default:
            break;
        }
      }
    }
  }

  // ---- farmer inbox snoop ------------------------------------------------
  // Peer seed deals: a recipient ACCEPTs an OFFER_SEED. ACCEPT lands in the
  // initiator's farmer inbox; sender is the accepting peer.

  private snoopFarmerInboxes(tick: number, day: number, out: EventEntry[]): void {
    for (const farmer of this.world.query("farmer", "inbox")) {
      if (farmer.id === undefined) continue;
      for (const msg of farmer.inbox.messages) {
        if (msg.ontology !== ONT_ENCOUNTER.ACCEPT) continue;
        if (typeof msg.sender !== "number") continue;
        const body = msg.body as unknown as AcceptBody;
        const key = `accept:${body.offerId}:${msg.sender}:${farmer.id}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        const accepter = this.nameOf(msg.sender);
        const initiator = this.nameOf(farmer.id);
        out.push({
          tick,
          day,
          key,
          text: `${accepter} accepted ${initiator}'s seed offer`,
        });
      }
    }
  }

  // ---- capture helpers ---------------------------------------------------

  private captureTrade(
    body: TradeCompletedBody,
    tick: number,
    day: number,
    out: EventEntry[],
  ): void {
    if (typeof body.buyerId !== "number" || typeof body.sellerId !== "number") return;
    const key = `trade:${body.offerId ?? `${body.buyerId}-${body.sellerId}`}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const buyer = this.nameOf(body.buyerId);
    const seller = this.nameOf(body.sellerId);
    let what = "goods";
    if (typeof body.quantity === "number" && typeof body.crop === "string") {
      what = `${body.quantity} ${body.crop}`;
    }
    const price =
      typeof body.pricePerUnit === "number" && typeof body.quantity === "number"
        ? ` (${body.pricePerUnit * body.quantity}g)`
        : "";
    out.push({
      tick,
      day,
      key,
      text: `${buyer} bought ${what} from ${seller}${price}`,
    });
  }

  private captureAuction(
    body: AuctionResultBody,
    tick: number,
    day: number,
    out: EventEntry[],
  ): void {
    if (typeof body.auctionId !== "string") return;
    const key = `auction:${body.auctionId}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (body.winnerId === null || body.winnerId === undefined) {
      out.push({ tick, day, key, text: "Auction closed with no winner" });
      return;
    }
    const winner = this.nameOf(body.winnerId);
    out.push({
      tick,
      day,
      key,
      text: `${winner} won the golden bean at ${body.paidPrice}g`,
    });
  }

  private captureShock(
    body: ShockBody,
    tick: number,
    day: number,
    out: EventEntry[],
  ): void {
    const key = `shock:${body.day}:${body.targetFarmerId}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const name = body.targetName ?? this.nameOf(body.targetFarmerId);
    const cropWord = body.plotsWiped === 1 ? "crop" : "crops";
    out.push({
      tick,
      day,
      key,
      text: `Drought! ${name} lost ${body.plotsWiped} ${cropWord}`,
    });
  }

  private captureCropDeath(
    body: CropDeathBody,
    tick: number,
    day: number,
    out: EventEntry[],
  ): void {
    // Collapse same-day deaths of the same crop for one owner into one line.
    const key = `death:${body.day}:${body.ownerId}:${body.crop}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const name = this.nameOf(body.ownerId);
    out.push({
      tick,
      day,
      key,
      text: `${name}'s ${body.crop} withered (no water)`,
    });
  }

  // ---- helpers -----------------------------------------------------------

  private nameOf(id: number): string {
    for (const f of this.world.query("farmer")) {
      if (f.id === id) return f.farmer.name;
    }
    return `#${id}`;
  }

  /**
   * Returns the feed, newest-LAST (chronological). The panel reverses for a
   * newest-first display. Returns a defensive copy.
   */
  recent(): readonly EventEntry[] {
    return this.events.slice();
  }
}
