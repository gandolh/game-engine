import type { CropKind } from "../components";
import type { Season } from "./weather";
import { SEASON_LENGTH, SEASON_ORDER } from "./weather";

// Festival days are calendar landmarks anchored to the season clock; FestivalSystem announces then resolves the harvest contest.
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
  /** In-season crop judged at the contest + targeted by the price spike. */
  contestCrop: CropKind;
  /** Gold prize for the contest winner. */
  prize: number;
  /** One-day shop sell-price multiplier on contestCrop (planning opportunity for agents who stocked up). */
  priceSpike: number;
}

/** Mid-season offset (SEASON_LENGTH/2): spring=day13, summer=day38, autumn=day63, winter=day88 at SEASON_LENGTH=25. Deterministic. */
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

/** 1-based day for the given season's festival (day 1 = first day of spring). */
export function festivalDayForSeason(season: Season): number {
  const seasonIndex = SEASON_ORDER.indexOf(season);
  return seasonIndex * SEASON_LENGTH + FESTIVAL_OFFSET_IN_SEASON + 1;
}

/** Returns the festival on `day`, or null. Deterministic; cycle repeats for runs longer than 4 seasons. */
export function festivalForDay(day: number): FestivalDef | null {
  if (day < 1) return null;
  const yearLength = SEASON_LENGTH * SEASON_ORDER.length;
  const dayInYear = ((day - 1) % yearLength) + 1;
  for (const season of SEASON_ORDER) {
    if (festivalDayForSeason(season) === dayInYear) return FESTIVALS[season];
  }
  return null;
}

/** Days until the next festival (0 if today). Deterministic. */
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
