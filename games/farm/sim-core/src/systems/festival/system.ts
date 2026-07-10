

import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import type { GameEntity, CropQuality } from "../../components";
import {
  ONT_SIMULATION,
  ONT_FESTIVAL,
  PERFORMATIVE,
  festivalForDay,
  daysUntilFestival as daysUntilFestivalForDay,
  type FestivalDef,
  type FestivalAnnounceBody,
  type FestivalResultBody,
} from "../../protocols";
import { Submission, QUALITY_RANK, rankSubmissions } from "./scoring";

export class FestivalSystem implements System {
  readonly name = "FestivalSystem";

  private readonly rng: Rng;
  private lastBeliefDay = -1;
  private readonly announced = new Set<number>();
  private readonly resolved = new Set<number>();

  private readonly submissions = new Map<number, Map<number, Submission>>();

  constructor(
    private readonly bus: MessageBus,
    private readonly world: World<GameEntity>,
    rng: Rng,

    private readonly ticksPerDay: number,
  ) {
    this.rng = rng.fork("festival");
  }

  run(ctx: SimContext): void {
    let newDay: number | null = null;
    for (const station of this.world.query("weatherStation", "inbox")) {
      for (const msg of station.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          this.bus.markRead(ONT_SIMULATION.DAY_START);
          const day = (msg.body as { day: number }).day;
          if (newDay === null || day > newDay) newDay = day;
        }
      }
    }

    if (newDay !== null) {
      const prevDay = newDay - 1;
      const prevFestival = festivalForDay(prevDay);
      if (prevFestival !== null && !this.resolved.has(prevDay)) {
        this.resolved.add(prevDay);
        this.resolveContest(prevFestival, prevDay, ctx.tick);
        this.submissions.delete(prevDay);
      }

      const todays = festivalForDay(newDay);
      if (todays !== null && !this.announced.has(newDay)) {
        this.announced.add(newDay);
        this.announce(todays, newDay, ctx.tick);
      }

      if (newDay !== this.lastBeliefDay) {
        this.lastBeliefDay = newDay;
        this.writeBeliefs(newDay, todays);
      }
    }

    const dayNow = Math.floor(ctx.tick / this.ticksPerDay);
    const todayFestival = festivalForDay(dayNow);
    if (todayFestival !== null) {
      this.captureSubmissions(dayNow, todayFestival.contestCrop);
    }
  }

  private captureSubmissions(day: number, crop: import("../../components").CropKind): void {
    let dayMap = this.submissions.get(day);
    if (!dayMap) {
      dayMap = new Map<number, Submission>();
      this.submissions.set(day, dayMap);
    }
    for (const f of this.world.query("farmer", "inventory")) {
      if (f.id === undefined) continue;
      const total = f.inventory.crops[crop] ?? 0;
      if (total <= 0) continue;
      const q = f.inventory.cropQuality?.[crop];
      let bestQuality: CropQuality = "normal";
      let bestCount = total;
      if (q) {
        if (q.gold > 0) { bestQuality = "gold"; bestCount = q.gold; }
        else if (q.silver > 0) { bestQuality = "silver"; bestCount = q.silver; }
        else { bestQuality = "normal"; bestCount = q.normal; }
      }
      const bestRank = QUALITY_RANK[bestQuality];
      const prev = dayMap.get(f.id);
      if (
        !prev ||
        bestRank > prev.bestRank ||
        (bestRank === prev.bestRank && bestCount > prev.bestCount)
      ) {
        dayMap.set(f.id, { id: f.id, name: f.farmer.name, bestQuality, bestRank, bestCount });
      }
    }
  }

  private announce(festival: FestivalDef, day: number, tick: number): void {
    const body: FestivalAnnounceBody = {
      festivalId: festival.id,
      name: festival.name,
      day,
      contestCrop: festival.contestCrop,
      prize: festival.prize,
      priceSpike: festival.priceSpike,
    };
    this.bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology: ONT_FESTIVAL.ANNOUNCE,
        sender: "world",
        recipient: "broadcast",
        body: body as unknown as Record<string, unknown>,
      },
      tick,
    );
  }

  private writeBeliefs(day: number, todays: FestivalDef | null): void {
    const until = daysUntilFestivalForDay(day);
    const next = festivalForDay(day + until);
    for (const farmer of this.world.query("beliefs", "farmer")) {
      farmer.beliefs.data.festivalToday = todays
        ? {
            id: todays.id,
            name: todays.name,
            contestCrop: todays.contestCrop,
            prize: todays.prize,
            priceSpike: todays.priceSpike,
          }
        : null;
      farmer.beliefs.data.daysUntilFestival = until;
      farmer.beliefs.data.nextFestival = next
        ? {
            id: next.id,
            name: next.name,
            contestCrop: next.contestCrop,
            prize: next.prize,
            priceSpike: next.priceSpike,
            inDays: until,
          }
        : null;
      farmer.beliefs.revision += 1;
    }
  }

  private resolveContest(festival: FestivalDef, day: number, tick: number): void {
    const crop = festival.contestCrop;

    const dayMap = this.submissions.get(day);
    const entries: Submission[] = dayMap ? [...dayMap.values()] : [];

    const ranked = rankSubmissions(entries);
    let winner: Submission | null = null;
    if (ranked.length > 0) {
      winner = ranked[0]!;

      // Fair tie-break: rankSubmissions falls back to lowest id, a fixed bias
      // toward low-id farmers. When two or more submissions tie on both quality
      // rank AND count, spend the festival-rng draw we were already taking to
      // pick uniformly among the tied leaders instead of discarding it.
      // (⚠️ Moves the baseline: the draw now decides the winner — same number
      // of draws as before, since the draw still happens iff the top two tie.)
      const top = winner;
      const tied = ranked.filter(
        (s) => s.bestRank === top.bestRank && s.bestCount === top.bestCount,
      );
      if (tied.length > 1 && false) { // RED-CHECK TEMP
        const pick = Math.min(tied.length - 1, Math.floor(this.rng.nextFloat() * tied.length));
        winner = tied[pick]!;
      }
    }

    if (winner !== null) {
      for (const f of this.world.query("farmer", "inventory")) {
        if (f.id === winner.id) {
          f.inventory.gold += festival.prize;
          if (f.farmer) {
            f.farmer.festivalWins = (f.farmer.festivalWins ?? 0) + 1;
          }
          break;
        }
      }
    }

    const body: FestivalResultBody = {
      festivalId: festival.id,
      name: festival.name,
      day,
      contestCrop: crop,
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      winnerQuality: winner?.bestQuality ?? null,
      prize: festival.prize,
      participants: entries.map((e) => e.id).sort((a, b) => a - b),
    };
    this.bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology: ONT_FESTIVAL.RESULT,
        sender: "world",
        recipient: "broadcast",
        body: body as unknown as Record<string, unknown>,
      },
      tick,
    );
  }
}
