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
import type { GameEntity } from "../../components";
import { ONT_ENCOUNTER, type AcceptBody } from "../../protocols/encounter";
import { ONT_MARKET } from "../../protocols/market";
import { ONT_SHOP, type AuctionResultBody } from "../../protocols/shop";
import { ONT_FESTIVAL, type FestivalResultBody } from "../../protocols/festival";
import {
  ONT_SIMULATION,
  type ShockBody,
  type CropDeathBody,
} from "../../protocols/simulation";
import {
  ONT_HARBOR,
  type ContractDeliveredBody,
  type ContractMissedBody,
} from "../../protocols/harbor";
import type { DayClockSystem } from "../day-clock";
import type { RivalrySystem } from "../rivalry";
import type { RunHistorySystem } from "../run-history";
import { dramaScore } from "../drama";
import { type EventEntry, type TradeCompletedBody, EVENT_FEED_CAP } from "./types";

export class EventFeedSystem implements System {
  readonly name = "EventFeedSystem";

  /** Feed entries, newest-LAST. Capped at EVENT_FEED_CAP. */
  private readonly events: EventEntry[] = [];

  /** Keys already captured, so re-observed inbox messages aren't re-added. */
  private readonly seen = new Set<string>();

  /** Reused per-tick scratch for this tick's fresh entries (cleared each run)
   *  so the hot path doesn't allocate a new array every tick. */
  private readonly fresh: EventEntry[] = [];

  // ---- rank-change detection state ----------------------------------------
  // Updated once per new day. Guards against re-detecting on every tick of the
  // same day. `lastTopFarmerId` is null until we have at least one history row.

  /** The farmer id that held rank 1 as of the last rank-check day. */
  private lastTopFarmerId: number | null = null;
  /** The last sim day on which we performed a rank-change check. */
  private lastRankCheckDay = -1;

  // ---- race-on state -------------------------------------------------------
  // One-shot: emitted at most once per run, guarded by the `seen` set plus this
  // boolean so we don't re-scan history on every tick after the first emit.

  /** True once the "race is on" line has been emitted for this run. */
  private raceOnEmitted = false;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly dayClock: DayClockSystem,
    private readonly rivalry?: RivalrySystem,
    private readonly runHistory?: RunHistorySystem,
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
    this.snoopHarborBoard(ctx.tick, day, fresh);
    this.snoopRivalrySystem(ctx.tick, day, fresh);
    this.snoopRankChange(ctx.tick, day, fresh);
    this.snoopRaceOn(ctx.tick, day, fresh);

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
          case ONT_FESTIVAL.RESULT:
            this.captureFestival(
              msg.body as unknown as FestivalResultBody,
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
          drama: dramaScore("accept", { day, maxDays: this.dayClock.maxDays }),
          farmerId: null,
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
      drama: dramaScore("trade", { day, maxDays: this.dayClock.maxDays }),
      farmerId: null,
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
      out.push({
        tick,
        day,
        key,
        text: "Auction closed with no winner",
        drama: dramaScore("auction", { day, maxDays: this.dayClock.maxDays }),
        farmerId: null,
      });
      return;
    }
    const winner = this.nameOf(body.winnerId);
    out.push({
      tick,
      day,
      key,
      text: `${winner} won the golden bean at ${body.paidPrice}g`,
      drama: dramaScore("auction", { day, maxDays: this.dayClock.maxDays }),
      farmerId: body.winnerId,
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
      drama: dramaScore("shock", { day, maxDays: this.dayClock.maxDays }),
      farmerId: body.targetFarmerId,
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
      drama: dramaScore("crop-death", { day, maxDays: this.dayClock.maxDays }),
      farmerId: body.ownerId,
    });
  }

  private captureFestival(
    body: FestivalResultBody,
    tick: number,
    day: number,
    out: EventEntry[],
  ): void {
    if (typeof body.festivalId !== "string") return;
    // One result per festival firing (keyed by festival id + the day it ran).
    const key = `festival:${body.festivalId}:${body.day}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    let text: string;
    if (body.winnerId === null || body.winnerName === null) {
      text = `${body.name} — no contest entries this year`;
    } else {
      const quality = body.winnerQuality ?? "normal";
      // e.g. "Autumn Harvest Fair — Atticus wins with a Gold pumpkin"
      const qLabel = quality.charAt(0).toUpperCase() + quality.slice(1);
      text = `${body.name} — ${body.winnerName} wins with a ${qLabel} ${body.contestCrop}`;
    }
    out.push({
      tick,
      day,
      key,
      text,
      drama: dramaScore("festival", { day, maxDays: this.dayClock.maxDays }),
      farmerId: body.winnerId,
    });
  }

  // ---- harbor board snoop (brief 46) -------------------------------------
  // CONTRACT_DELIVERED and CONTRACT_MISSED land as broadcasts. We snoop the
  // harbor board's inbox (single entity → single source, no double-counting).

  private snoopHarborBoard(tick: number, day: number, out: EventEntry[]): void {
    for (const board of this.world.query("harborBoard", "inbox")) {
      for (const msg of board.inbox.messages) {
        switch (msg.ontology) {
          case ONT_HARBOR.CONTRACT_DELIVERED:
            this.captureContractDelivered(
              msg.body as unknown as ContractDeliveredBody,
              tick,
              day,
              out,
            );
            break;
          case ONT_HARBOR.CONTRACT_MISSED:
            this.captureContractMissed(
              msg.body as unknown as ContractMissedBody,
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

  private captureContractDelivered(
    body: ContractDeliveredBody,
    tick: number,
    day: number,
    out: EventEntry[],
  ): void {
    const key = `contract-delivered:${body.contractId}:${body.farmerId}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    out.push({
      tick,
      day,
      key,
      text: `${body.farmerName} delivered a harbor contract — +${body.reward}g, +${body.reputationReward} rep`,
      drama: dramaScore("contract-delivered", { day, maxDays: this.dayClock.maxDays }),
      farmerId: body.farmerId,
    });
  }

  private captureContractMissed(
    body: ContractMissedBody,
    tick: number,
    day: number,
    out: EventEntry[],
  ): void {
    const key = `contract-missed:${body.contractId}:${body.farmerId}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    out.push({
      tick,
      day,
      key,
      text: `${body.farmerName} missed a harbor contract deadline — -${body.penaltyReputation} rep`,
      drama: dramaScore("contract-missed", { day, maxDays: this.dayClock.maxDays }),
      farmerId: body.farmerId,
    });
  }

  // ---- rivalry / alliance snoop ------------------------------------------
  // Read freshly-formed rivalries and alliances from RivalrySystem (which runs
  // BEFORE EventFeedSystem in the scheduler) and emit one-shot feed lines.
  // Dedup via the existing `seen` set with stable keys (`rivalry-formed:lo:hi`
  // and `alliance-formed:lo:hi`). The RivalrySystem manages its own one-shot
  // guard for announcements, but we double-dedup here in case of tick ordering
  // edge cases.

  private snoopRivalrySystem(tick: number, day: number, out: EventEntry[]): void {
    if (!this.rivalry) return;
    for (const formed of this.rivalry.freshlyFormedThisTick()) {
      const loId = formed.aId;
      const hiId = formed.bId;
      const pairStr = `${loId}:${hiId}`;
      if (formed.kind === "rivalry") {
        const key = `rivalry-formed:${pairStr}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        const nameA = this.nameOf(loId);
        const nameB = this.nameOf(hiId);
        out.push({
          tick,
          day,
          key,
          text: `A rivalry is brewing: ${nameA} vs. ${nameB}`,
          drama: dramaScore("rivalry", { day, maxDays: this.dayClock.maxDays }),
          farmerId: null,
        });
      } else {
        // "alliance"
        const key = `alliance-formed:${pairStr}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        const nameA = this.nameOf(loId);
        const nameB = this.nameOf(hiId);
        out.push({
          tick,
          day,
          key,
          text: `${nameA} and ${nameB} formed an alliance`,
          drama: dramaScore("alliance", { day, maxDays: this.dayClock.maxDays }),
          farmerId: null,
        });
      }
    }
  }

  // ---- rank-change detection -----------------------------------------------
  // Reads RunHistorySystem.history() once per new day (guarded by
  // lastRankCheckDay). If the rank-1 farmer changed since last check, pushes a
  // "X overtakes Y for 1st!" feed line with a stable dedup key.
  //
  // Source rationale: RunHistorySystem (brief 36, merged) provides per-day
  // rank rows already sorted by totalValue desc → farmerId asc. We look at rows
  // for the current day with rank===1 to find the current leader. If it differs
  // from the previously recorded leader we emit an event and update state.
  //
  // Note: RunHistorySystem records rows on DAY_START (snoops the weatherStation
  // inbox). EventFeedSystem also runs in the read-only snoop band AFTER
  // RunHistorySystem (see sim-bootstrap scheduler order), so same-day history
  // is available when we check.

  private snoopRankChange(tick: number, day: number, out: EventEntry[]): void {
    if (!this.runHistory) return;
    // Only check once per new day.
    if (day === this.lastRankCheckDay) return;
    this.lastRankCheckDay = day;

    const history = this.runHistory.history();
    // Find the current leader (rank === 1, day === current day).
    let currentLeaderId: number | null = null;
    for (const row of history) {
      if (row.day === day && row.rank === 1) {
        currentLeaderId = row.farmerId;
        break;
      }
    }
    if (currentLeaderId === null) return; // no history for this day yet

    const prevLeaderId = this.lastTopFarmerId;
    this.lastTopFarmerId = currentLeaderId;

    // No flip on the very first day we see a leader (no previous to compare).
    if (prevLeaderId === null) return;
    // Same leader — no flip.
    if (prevLeaderId === currentLeaderId) return;

    const newLeaderName = this.nameOf(currentLeaderId);
    const oldLeaderName = this.nameOf(prevLeaderId);
    const key = `rankflip:${day}:${currentLeaderId}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    out.push({
      tick,
      day,
      key,
      text: `${newLeaderName} overtakes ${oldLeaderName} for 1st!`,
      drama: dramaScore("rank-flip", { day, maxDays: this.dayClock.maxDays }),
      farmerId: currentLeaderId,
    });
  }

  // ---- race-on (final-stretch proximity) -----------------------------------
  // Emitted at most ONCE per run (one-shot, guarded by raceOnEmitted + seen).
  // Trigger: day ≥ ceil(maxDays * 0.9) AND the top-2 gold gap is within 8% of
  // the leader's totalValue.
  //
  // Gold source: the most recent day's RunHistorySystem rows for the top two
  // farmers (by rank 1 and rank 2). We use `gold` from the history row as a
  // proxy for wealth — it's the raw gold value recorded at day start, which is
  // stable and deterministic. The gap percentage is computed as:
  //   gapPct = (leader.gold - second.gold) / leader.gold * 100
  // clamped away from divide-by-zero. If leader.gold === 0 we skip.
  //
  // Key: `raceon:run` (one-shot per run, not per day). The `raceOnEmitted`
  // boolean provides an early-exit after first emission so we don't re-scan.

  private snoopRaceOn(tick: number, day: number, out: EventEntry[]): void {
    if (this.raceOnEmitted) return;
    if (!this.runHistory) return;

    const maxDays = this.dayClock.maxDays;
    const threshold = Math.ceil(maxDays * 0.9);
    if (day < threshold) return;

    const history = this.runHistory.history();
    // Find the most recently recorded day in history (could be current or prev).
    let latestHistDay = -1;
    for (const row of history) {
      if (row.day > latestHistDay) latestHistDay = row.day;
    }
    if (latestHistDay < 0) return;

    let leadRow: { farmerId: number; gold: number } | null = null;
    let secondRow: { farmerId: number; gold: number } | null = null;
    for (const row of history) {
      if (row.day !== latestHistDay) continue;
      if (row.rank === 1) leadRow = { farmerId: row.farmerId, gold: row.gold };
      else if (row.rank === 2) secondRow = { farmerId: row.farmerId, gold: row.gold };
    }
    if (leadRow === null || secondRow === null) return;
    if (leadRow.gold === 0) return;

    const gapPct = ((leadRow.gold - secondRow.gold) / leadRow.gold) * 100;
    // Threshold: ≤ 8% gap means the race is on.
    if (gapPct > 8) return;

    const key = "raceon:run";
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.raceOnEmitted = true;

    const leaderName = this.nameOf(leadRow.farmerId);
    const secondName = this.nameOf(secondRow.farmerId);
    // Round gap to one decimal for display.
    const gapStr = gapPct.toFixed(1);
    out.push({
      tick,
      day,
      key,
      text: `Final stretch — ${leaderName} and ${secondName} separated by ${gapStr}%`,
      drama: dramaScore("race-on", { day, maxDays }),
      farmerId: leadRow.farmerId,
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
