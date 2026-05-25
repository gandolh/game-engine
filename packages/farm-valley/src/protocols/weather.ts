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

export interface WeatherNowBody {
  condition: WeatherCondition;
  multiplier: number;
  day: number;
}

export interface WeatherForecastBody {
  forDay: number;
  predicted: WeatherCondition;
  confidence: number;
}
