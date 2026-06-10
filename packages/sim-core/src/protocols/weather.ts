export const ONT_WEATHER = {
  NOW: "weather-now",
  FORECAST: "weather-forecast",
} as const;

export type WeatherOntology = (typeof ONT_WEATHER)[keyof typeof ONT_WEATHER];

export type WeatherCondition = "sunny" | "normal" | "rainy" | "storm";

export const WEATHER_MULTIPLIER: Record<WeatherCondition, number> = {
  sunny: 1.2,
  normal: 1.0,
  rainy: 0.8,
  storm: 0.5,
};

/**
 * Seasons divide the 100-day run into 4 quarters (see `seasonForDay`).
 * Each season biases the per-day weather draw (see `systems/weather.ts`).
 */
export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASON_ORDER: ReadonlyArray<Season> = [
  "spring",
  "summer",
  "autumn",
  "winter",
];

/** Days in each season. The cycle repeats if the run exceeds 4 seasons. */
export const SEASON_LENGTH = 25;

/**
 * Pure function of the day index -> Season. Deterministic; no RNG, no clock.
 * Day 1 is the first day of spring. Days are grouped in `SEASON_LENGTH`-day
 * blocks and the four-season cycle repeats for runs longer than 100 days.
 * Day 0 (pre-start) is treated as spring.
 */
export function seasonForDay(day: number): Season {
  const d = Math.max(0, Math.floor(day) - 1);
  const idx = Math.floor(d / SEASON_LENGTH) % SEASON_ORDER.length;
  return SEASON_ORDER[idx]!;
}

export interface WeatherNowBody {
  condition: WeatherCondition;
  multiplier: number;
  day: number;
  season: Season;
  /** Human-readable hint at the season's weather bias, for agent planning. */
  trend: string;
}

export interface WeatherForecastBody {
  forDay: number;
  predicted: WeatherCondition;
  confidence: number;
  season: Season;
}
