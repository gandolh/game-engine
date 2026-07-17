import type { CropKind } from "../components";
import type { Season } from "./weather";
import { SEASON_LENGTH, SEASON_ORDER } from "./weather";

export const ONT_FESTIVAL = {

  ANNOUNCE: "festival-announce",

  RESULT: "festival-result",
} as const;

export type FestivalOntology = (typeof ONT_FESTIVAL)[keyof typeof ONT_FESTIVAL];

export type FestivalId =
  | "spring-planting-fair"
  | "summer-market-day"
  | "autumn-harvest-fair"
  | "winter-feast";

export interface FestivalDef {
  id: FestivalId;

  name: string;

  season: Season;

  contestCrop: CropKind;

  prize: number;

  priceSpike: number;
}

export const FESTIVAL_OFFSET_IN_SEASON = Math.floor(SEASON_LENGTH / 2);

/**
 * How many consecutive days a festival runs (2026-07-17 user decision resolving
 * the "festival attendance is geography-bound" open question). Farms sit 200+
 * tiles from the market-plaza podium at 8 ticks/tile against a 1200-tick day, so
 * a farmer who spends most of day 1 travelling still arrives to celebrate on
 * day 2. The window is FESTIVAL_DAYS days beginning at
 * `festivalDayForSeason(season)`.
 *
 * Default 2; **3 works by changing only this constant** — the window is
 * guaranteed to stay inside its season (never crossing a season/year boundary)
 * as long as `FESTIVAL_OFFSET_IN_SEASON + FESTIVAL_DAYS <= SEASON_LENGTH`
 * (with SEASON_LENGTH=25 that allows up to 13). All the multi-day plumbing
 * (announce-once, capture-across-days, resolve-once-at-the-end) is derived from
 * this constant, so no other file needs editing to widen the window.
 */
export const FESTIVAL_DAYS = 2;

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

export function festivalDayForSeason(season: Season): number {
  const seasonIndex = SEASON_ORDER.indexOf(season);
  return seasonIndex * SEASON_LENGTH + FESTIVAL_OFFSET_IN_SEASON + 1;
}

export function festivalForDay(day: number): FestivalDef | null {
  if (day < 1) return null;
  const yearLength = SEASON_LENGTH * SEASON_ORDER.length;
  const dayInYear = ((day - 1) % yearLength) + 1;
  for (const season of SEASON_ORDER) {
    const start = festivalDayForSeason(season);
    // Multi-day window [start, start + FESTIVAL_DAYS) — see FESTIVAL_DAYS. The
    // window never crosses a season boundary (guaranteed by the offset/length
    // invariant documented on FESTIVAL_DAYS), so a single per-season start
    // check is sufficient.
    if (dayInYear >= start && dayInYear < start + FESTIVAL_DAYS) return FESTIVALS[season];
  }
  return null;
}

/**
 * The absolute day the festival CONTAINING `day` began on, or null if `day` is
 * not a festival day. Multi-day submissions and the single end-of-festival
 * contest resolution are both keyed by this start day so the whole window
 * counts as one festival.
 */
export function festivalStartDayForDay(day: number): number | null {
  if (festivalForDay(day) === null) return null;
  let start = day;
  while (start > 1 && festivalForDay(start - 1) !== null) start -= 1;
  return start;
}

/** True iff `day` is the FIRST day of its festival window (announce once). */
export function isFestivalStartDay(day: number): boolean {
  return festivalForDay(day) !== null && festivalForDay(day - 1) === null;
}

/** True iff `day` is the LAST day of its festival window (resolve once). */
export function isFestivalLastDay(day: number): boolean {
  return festivalForDay(day) !== null && festivalForDay(day + 1) === null;
}

export function daysUntilFestival(day: number): number {
  if (day < 0) day = 0;
  const yearLength = SEASON_LENGTH * SEASON_ORDER.length;
  for (let ahead = 0; ahead <= yearLength; ahead++) {
    if (festivalForDay(day + ahead) !== null) return ahead;
  }
  return yearLength; 
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

  winnerId: number | null;

  winnerName: string | null;

  winnerQuality: import("../components").CropQuality | null;

  prize: number;

  participants: number[];
}
