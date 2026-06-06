import type { CropKind } from "../components";
import type { Season } from "./weather";
import { SEASON_LENGTH, SEASON_ORDER } from "./weather";

/**
 * brief 45 — festival ontology. Festival days are calendar landmarks anchored to
 * the season clock (see `festivalForDay`). On a festival day the FestivalSystem
 * announces the festival (so agents gather + plan) and, at end-of-day, resolves a
 * harvest contest into a FESTIVAL_RESULT broadcast that the event feed narrates.
 */
export const ONT_FESTIVAL = {
  /** Broadcast at the start of a festival day so agents know to participate. */
  ANNOUNCE: "festival-announce",
  /** Broadcast when the festival's contest resolves (a feed-narrated beat). */
  RESULT: "festival-result",
} as const;

export type FestivalOntology = (typeof ONT_FESTIVAL)[keyof typeof ONT_FESTIVAL];

/** Stable festival identity (one per season). */
export type FestivalId =
  | "spring-planting-fair"
  | "summer-market-day"
  | "autumn-harvest-fair"
  | "winter-feast";

export interface FestivalDef {
  id: FestivalId;
  /** Human-readable festival name (used in narration). */
  name: string;
  /** Season this festival belongs to. */
  season: Season;
  /**
   * The crop the harvest contest judges + the special-market spike targets.
   * Each festival celebrates a crop that's in-season for it, so a farmer who
   * planned around the season has a shot at winning.
   */
  contestCrop: CropKind;
  /** Gold prize awarded to the contest winner. */
  prize: number;
  /**
   * One-day shop SELL-price multiplier on `contestCrop` for the festival day
   * (the "special market" — a planning opportunity for agents who stocked up).
   */
  priceSpike: number;
}

/**
 * brief 45 — the festival calendar. One festival per season, anchored to the
 * MIDDLE of its season block so it lands inside a 100-day run for every season
 * and gives agents days of lead time to plan (they can see it coming in beliefs).
 *
 * `offsetInSeason` is days into the season (0-based) where the festival fires;
 * SEASON_LENGTH/2 = mid-season. Day numbers below assume SEASON_LENGTH=25:
 *   spring-planting-fair → day 13
 *   summer-market-day    → day 38
 *   autumn-harvest-fair  → day 63
 *   winter-feast         → day 88
 *
 * Determinism: dates are a pure function of the calendar — no RNG, no clock.
 */
export const FESTIVAL_OFFSET_IN_SEASON = Math.floor(SEASON_LENGTH / 2);

export const FESTIVALS: Readonly<Record<Season, FestivalDef>> = {
  spring: {
    id: "spring-planting-fair",
    name: "Spring Planting Fair",
    season: "spring",
    contestCrop: "wheat",
    prize: 60,
    priceSpike: 1.5,
  },
  summer: {
    id: "summer-market-day",
    name: "Summer Market Day",
    season: "summer",
    contestCrop: "tomato",
    prize: 90,
    priceSpike: 1.6,
  },
  autumn: {
    id: "autumn-harvest-fair",
    name: "Autumn Harvest Fair",
    season: "autumn",
    contestCrop: "pumpkin",
    prize: 120,
    priceSpike: 1.7,
  },
  winter: {
    id: "winter-feast",
    name: "Winter Feast",
    season: "winter",
    contestCrop: "winter-squash",
    prize: 100,
    priceSpike: 1.6,
  },
};

/**
 * The 1-based day on which the given season's festival fires.
 * spring → 13, summer → 38, autumn → 63, winter → 88 (at SEASON_LENGTH=25).
 */
export function festivalDayForSeason(season: Season): number {
  const seasonIndex = SEASON_ORDER.indexOf(season);
  // Day 1 is the first day of spring; each season is SEASON_LENGTH days.
  return seasonIndex * SEASON_LENGTH + FESTIVAL_OFFSET_IN_SEASON + 1;
}

/**
 * Pure function of the day index → the festival firing on that day, or null.
 * Deterministic; no RNG, no clock. Handles runs longer than one year by folding
 * the day into a year (the four-season cycle repeats).
 */
export function festivalForDay(day: number): FestivalDef | null {
  if (day < 1) return null;
  const yearLength = SEASON_LENGTH * SEASON_ORDER.length;
  const dayInYear = ((day - 1) % yearLength) + 1;
  for (const season of SEASON_ORDER) {
    if (festivalDayForSeason(season) === dayInYear) return FESTIVALS[season];
  }
  return null;
}

/**
 * Days until the next festival from `day` (0 if today is a festival, else the
 * count to the upcoming one). Looks ahead up to one full year. Deterministic.
 */
export function daysUntilFestival(day: number): number {
  if (day < 0) day = 0;
  const yearLength = SEASON_LENGTH * SEASON_ORDER.length;
  for (let ahead = 0; ahead <= yearLength; ahead++) {
    if (festivalForDay(day + ahead) !== null) return ahead;
  }
  return yearLength; // unreachable (every year has festivals)
}

export interface FestivalAnnounceBody {
  festivalId: FestivalId;
  name: string;
  day: number;
  contestCrop: CropKind;
  prize: number;
  priceSpike: number;
}

export interface FestivalResultBody {
  festivalId: FestivalId;
  name: string;
  day: number;
  contestCrop: CropKind;
  /** Winner farmer id, or null if no one entered a qualifying submission. */
  winnerId: number | null;
  /** Winner display name (for narration), or null. */
  winnerName: string | null;
  /** The quality tier the winner submitted ("gold" | "silver" | "normal"). */
  winnerQuality: import("../components").CropQuality | null;
  /** Gold prize awarded. */
  prize: number;
  /** Farmer ids who entered the contest. */
  participants: number[];
}
