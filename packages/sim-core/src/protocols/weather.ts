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

// Each season biases the per-day weather draw (see systems/weather.ts).
export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASON_ORDER: ReadonlyArray<Season> = [
  "spring",
  "summer",
  "autumn",
  "winter",
];

/** Days in each season. The cycle repeats if the run exceeds 4 seasons. */
export const SEASON_LENGTH = 25;

/** Deterministic: day 1 = first day of spring; cycle repeats for runs longer than 4 seasons. Day 0 = spring. */
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
