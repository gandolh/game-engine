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
    if (festivalDayForSeason(season) === dayInYear) return FESTIVALS[season];
  }
  return null;
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
