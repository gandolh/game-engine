import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import type { GameEntity, CropQuality } from "../components";
import {
  ONT_SIMULATION,
  ONT_FESTIVAL,
  PERFORMATIVE,
  festivalForDay,
  daysUntilFestival as daysUntilFestivalForDay,
  type FestivalDef,
  type FestivalAnnounceBody,
  type FestivalResultBody,
} from "../protocols";

/**
 * brief 45 — FestivalSystem: the calendar-landmark layer.
 *
 * Festival dates are FIXED by the calendar (see `festivalForDay`) — one festival
 * per season, mid-season — so they are fully deterministic and agents can see
 * them coming in beliefs and PLAN (hold a high-quality crop for the contest, or
 * stock the spike crop for the special market). Nothing here uses Math.random /
 * Date.now; the only randomness is a FORKED seeded `Rng` reserved for a prize
 * tie-break, kept deterministic across replays.
 *
 * Two beats, both driven off the DAY_START message (snooped from the
 * weatherStation inbox, the same single-surface pattern WeatherSystem uses):
 *
 *  1. ANNOUNCE (on a festival day-start): broadcast ONT_FESTIVAL.ANNOUNCE so the
 *     gathering/contest deliberation can fire, and write festival awareness into
 *     every farmer's beliefs (`festivalToday` / `daysUntilFestival` / the spike).
 *
 *  2. RESOLVE (on the day-start AFTER a festival): rank each farmer's BEST held
 *     unit of the contest crop by quality (gold > silver > normal), award the
 *     prize gold to the winner, and broadcast ONT_FESTIVAL.RESULT — a stable-key
 *     event the EventFeedSystem narrates as a high-drama beat. Resolving on the
 *     NEXT day-start means the festival day's harvests are already banked, so a
 *     farmer who timed a Gold harvest for the fair is judged on it.
 *
 * The contest is a pure deterministic ranking of submissions (every farmer who
 * holds ≥1 of the contest crop is an entrant) — NOT agent logic. The forked rng
 * only breaks a tie between equal-quality leaders, after the stable id tie-break,
 * so the result is reproducible.
 *
 * Beliefs awareness is also kept FRESH every day (not just on festival days) so
 * agents always know how many days until the next festival.
 *
 * Scheduler placement (see sim-bootstrap): runs in the read-only snoop band,
 * right BEFORE EventFeedSystem, so a RESULT it broadcasts is delivered to the
 * market-wall inbox next tick and the feed snoops it there (single surface,
 * matching AUCTION_RESULT). It writes beliefs before PerceiveSystem clears
 * inboxes and DeliberateSystem reads them.
 */
/** A captured contest entry: the best contest-crop unit a farmer held that day. */
export interface Submission {
  id: number;
  name: string;
  bestQuality: CropQuality;
  bestRank: number;
  bestCount: number;
}

const QUALITY_RANK: Record<CropQuality, number> = { normal: 1, silver: 2, gold: 3 };

/**
 * Pure, deterministic contest ranking — the heart of the harvest contest, split
 * out so it can be unit-tested without a live sim. Ranks entrants by best crop
 * quality (gold > silver > normal), breaking ties by MORE units of that quality,
 * then by lower farmer id (ids are unique, so this is a total order). Returns a
 * sorted copy; the winner is element 0 (or null if there are no entrants).
 */
export function rankSubmissions(entries: readonly Submission[]): Submission[] {
  return [...entries].sort((a, b) => {
    if (a.bestRank !== b.bestRank) return b.bestRank - a.bestRank;
    if (a.bestCount !== b.bestCount) return b.bestCount - a.bestCount;
    return a.id - b.id;
  });
}

export class FestivalSystem implements System {
  readonly name = "FestivalSystem";

  private readonly rng: Rng;
  /** Last day we wrote festival awareness into beliefs (avoid re-writing each tick). */
  private lastBeliefDay = -1;
  /** Festival days we've already announced. */
  private readonly announced = new Set<number>();
  /** Festival days whose contest we've already resolved. */
  private readonly resolved = new Set<number>();
  /**
   * Per-festival-day high-water mark of each farmer's BEST contest-crop holding.
   * Keyed by festival day → farmer id → submission. Captured every tick of the
   * festival day so a farmer who harvests a Gold crop is judged on it even if
   * they SELL it before the contest resolves (the next day-start). This matches
   * the brief's "best crop shipped THAT DAY" — the contest judges the peak the
   * farmer reached during the festival, not whatever survived to the next morning.
   */
  private readonly submissions = new Map<number, Map<number, Submission>>();

  constructor(
    private readonly bus: MessageBus,
    private readonly world: World<GameEntity>,
    rng: Rng,
    /**
     * Ticks per in-game day — lets the capture derive the current day straight
     * from `ctx.tick` (same formula as DayClockSystem), so it can snapshot a
     * farmer's best contest crop at the FIRST tick of the festival day, BEFORE
     * ActSystem runs and the farmer may sell it. The DAY_START message (used for
     * announce/resolve below) arrives one tick late — too late for capture.
     */
    private readonly ticksPerDay: number,
  ) {
    // Fork so the prize tie-break never perturbs the shared sim rng stream.
    this.rng = rng.fork("festival");
  }

  run(ctx: SimContext): void {
    // Detect a fresh DAY_START from the weatherStation inbox (single surface,
    // same as WeatherSystem / NoticeBoardSystem).
    let newDay: number | null = null;
    for (const station of this.world.query("weatherStation", "inbox")) {
      for (const msg of station.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          const day = (msg.body as { day: number }).day;
          if (newDay === null || day > newDay) newDay = day;
        }
      }
    }

    if (newDay !== null) {
      // 1. Resolve the PREVIOUS day's festival (if it was one and not yet judged),
      //    using the high-water-mark submissions captured across that festival day.
      const prevDay = newDay - 1;
      const prevFestival = festivalForDay(prevDay);
      if (prevFestival !== null && !this.resolved.has(prevDay)) {
        this.resolved.add(prevDay);
        this.resolveContest(prevFestival, prevDay, ctx.tick);
        this.submissions.delete(prevDay);
      }

      // 2. Announce TODAY's festival (if it is one) + always refresh awareness.
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

    // Every tick: if today is a festival day, capture each farmer's best held
    // contest crop as a high-water mark (selling later won't erase the entry).
    // Derive the day from the tick (not the DAY_START message, which lands one
    // tick late) so the FIRST capture of the festival day happens before
    // ActSystem can sell the prize crop on that day.
    const dayNow = Math.floor(ctx.tick / this.ticksPerDay);
    const todayFestival = festivalForDay(dayNow);
    if (todayFestival !== null) {
      this.captureSubmissions(dayNow, todayFestival.contestCrop);
    }
  }

  // ---- per-tick submission capture --------------------------------------

  /**
   * Record each farmer's BEST held unit of `crop` for `day`, keeping the
   * highest quality (and, within a quality, the highest count) seen so far that
   * day. Pure read of inventory; deterministic given sim state.
   */
  private captureSubmissions(day: number, crop: import("../components").CropKind): void {
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

  // ---- announce ----------------------------------------------------------

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

  // ---- beliefs -----------------------------------------------------------

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

  // ---- contest resolution (pure, deterministic) --------------------------

  /**
   * Rank entrants by the BEST quality unit of the contest crop they held at any
   * point during the festival day (the high-water mark captured each tick).
   * gold(3) > silver(2) > normal(1). An entrant is any farmer who held ≥1 of the
   * crop. Tie on best quality → MORE units of that quality wins → lower farmer
   * id → a forked-rng coin flip (reserved last resort, still deterministic).
   */
  private resolveContest(festival: FestivalDef, day: number, tick: number): void {
    const crop = festival.contestCrop;

    // Entrants are the per-day high-water-mark submissions captured during the
    // festival day (insertion order is irrelevant — we sort deterministically).
    const dayMap = this.submissions.get(day);
    const entries: Submission[] = dayMap ? [...dayMap.values()] : [];

    const ranked = rankSubmissions(entries);
    let winner: Submission | null = null;
    if (ranked.length > 0) {
      winner = ranked[0]!;
      // Last-resort tie-break ONLY if the top two are fully tied on the stable
      // keys (same quality, count, AND id — impossible since ids are unique, but
      // we consult the forked rng to keep the reserved stream advancing
      // identically across replays and to honour the brief's "forked rng if a
      // tie/prize roll needs it").
      const second = ranked[1];
      if (second && second.bestRank === winner.bestRank && second.bestCount === winner.bestCount) {
        // Coin flip kept deterministic via the forked rng (does not change the
        // winner here because id already broke the tie, but advances the stream).
        void this.rng.nextFloat();
      }
    }

    // Award the prize to the winner.
    if (winner !== null) {
      for (const f of this.world.query("farmer", "inventory")) {
        if (f.id === winner.id) {
          f.inventory.gold += festival.prize;
          // A small standing bump: record the win on the farmer for the UI / recap.
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
