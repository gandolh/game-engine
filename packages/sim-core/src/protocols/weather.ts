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

export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASON_ORDER: ReadonlyArray<Season> = [
  "spring",
  "summer",
  "autumn",
  "winter",
];

export const SEASON_LENGTH = 25;

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

  trend: string;
}

export interface WeatherForecastBody {
  forDay: number;
  predicted: WeatherCondition;
  confidence: number;
  season: Season;
}
