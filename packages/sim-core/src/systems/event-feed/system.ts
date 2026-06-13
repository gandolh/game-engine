// EventFeedSystem — read-only snoop; must run BEFORE PerceiveSystem clears inboxes and before MarketSystem drains the wall.
// MUST NOT consume or mutate messages. No Math.random/Date.now. Events sorted by key before append for deterministic replay.
// Snoop surface: market-wall inbox (TRADE_COMPLETED, AUCTION_RESULT, SHOCK) + farmer inboxes (ENCOUNTER.ACCEPT).

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
import { ONT_CORAL, type CoralCaughtBody } from "../../protocols/coral";
import type { DayClockSystem } from "../day-clock";
import type { RivalrySystem } from "../rivalry";
import type { RunHistorySystem } from "../run-history";
import { dramaScore } from "../drama";
import { type EventEntry, type TradeCompletedBody, EVENT_FEED_CAP } from "./types";

export class EventFeedSystem implements System {
  readonly name = "EventFeedSystem";

  private readonly events: EventEntry[] = []; // newest-LAST, capped at EVENT_FEED_CAP
  private readonly seen = new Set<string>(); // dedup re-observed inbox messages across ticks
  private readonly fresh: EventEntry[] = []; // reused per-tick scratch

  private lastTopFarmerId: number | null = null; // rank-1 as of last check day
  private lastRankCheckDay = -1;

  private raceOnEmitted = false; // one-shot per run

  constructor(
    private readonly world: World<GameEntity>,
    private readonly dayClock: DayClockSystem,
    private readonly rivalry?: RivalrySystem,
    private readonly runHistory?: RunHistorySystem,
  ) {}

  run(ctx: SimContext): void {
    const day = this.dayClock.day;
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
    for (const entry of fresh) this.events.push(entry);
    if (this.events.length > EVENT_FEED_CAP) {
      this.events.splice(0, this.events.length - EVENT_FEED_CAP);
    }
  }

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
          case ONT_CORAL.CAUGHT:
            this.captureCoralCatch(
              msg.body as unknown as CoralCaughtBody,
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
    const key = `death:${body.day}:${body.ownerId}:${body.crop}`; // same-day same-crop collapses to one line
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

  private captureCoralCatch(
    body: CoralCaughtBody,
    tick: number,
    day: number,
    out: EventEntry[],
  ): void {
    if (typeof body.farmerId !== "number") return;
    // Keyed by farmer+tick: two lobsters on same day each get a line; re-snoop deduped.
    const key = `coral:${body.farmerId}:${tick}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    out.push({
      tick,
      day,
      key,
      text: `${body.farmerName} hauled in a coral-reef ${body.fish} (${body.value}g)!`,
      drama: dramaScore("coral-catch", { day, maxDays: this.dayClock.maxDays }),
      farmerId: body.farmerId,
    });
  }

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

  private snoopRivalrySystem(tick: number, day: number, out: EventEntry[]): void {
    if (!this.rivalry) return;
    for (const formed of this.rivalry.freshlyFormedThisTick()) {
      const aId = formed.aId;
      const bId = formed.bId;
      if (formed.kind === "rivalry") {
        // Directional (aId's trust toward bId dropped). The RivalrySystem owns
        // hysteresis (latch + re-arm), so we do NOT permanently dedup here — a
        // genuine re-rivalry after recovery is allowed to surface again. Key is
        // per-tick-unique to satisfy EventEntry without suppressing re-fires.
        const nameA = this.nameOf(aId);
        const nameB = this.nameOf(bId);
        out.push({
          tick,
          day,
          key: `rivalry-formed:${aId}->${bId}:${tick}`,
          text: `A rivalry is brewing: ${nameA} resents ${nameB}`,
          drama: dramaScore("rivalry", { day, maxDays: this.dayClock.maxDays }),
          farmerId: null,
        });
      } else {
        const pairStr = `${aId}:${bId}`;
        const key = `alliance-formed:${pairStr}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        const nameA = this.nameOf(aId);
        const nameB = this.nameOf(bId);
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

  private snoopRankChange(tick: number, day: number, out: EventEntry[]): void {
    if (!this.runHistory) return;
    if (day === this.lastRankCheckDay) return;
    this.lastRankCheckDay = day;

    const history = this.runHistory.history();
    let currentLeaderId: number | null = null;
    for (const row of history) {
      if (row.day === day && row.rank === 1) {
        currentLeaderId = row.farmerId;
        break;
      }
    }
    if (currentLeaderId === null) return;

    const prevLeaderId = this.lastTopFarmerId;
    this.lastTopFarmerId = currentLeaderId;

    if (prevLeaderId === null) return; // no previous to compare on first day
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

  // One-shot: day ≥ 90% of maxDays AND top-2 gold gap ≤ 8%.
  private snoopRaceOn(tick: number, day: number, out: EventEntry[]): void {
    if (this.raceOnEmitted) return;
    if (!this.runHistory) return;

    const maxDays = this.dayClock.maxDays;
    const threshold = Math.ceil(maxDays * 0.9);
    if (day < threshold) return;

    const history = this.runHistory.history();
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
    if (gapPct > 8) return;

    const key = "raceon:run";
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.raceOnEmitted = true;

    const leaderName = this.nameOf(leadRow.farmerId);
    const secondName = this.nameOf(secondRow.farmerId);
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

  private nameOf(id: number): string {
    for (const f of this.world.query("farmer")) {
      if (f.id === id) return f.farmer.name;
    }
    return `#${id}`;
  }

  /** Returns a defensive copy of the feed (newest-LAST / chronological). */
  recent(): readonly EventEntry[] {
    return this.events.slice();
  }
}
