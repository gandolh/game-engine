import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import type { GameEntity } from "../../components";
import {
  ONT_WEATHER,
  WEATHER_MULTIPLIER,
  ONT_SIMULATION,
  PERFORMATIVE,
  seasonForDay,
} from "../../protocols";
import type {
  WeatherCondition,
  WeatherNowBody,
  WeatherForecastBody,
  Season,
} from "../../protocols";

type WeatherWeights = ReadonlyArray<{ condition: WeatherCondition; weight: number }>;

const SEASON_WEATHER_WEIGHTS: Record<Season, WeatherWeights> = {
  spring: [
    { condition: "sunny", weight: 0.35 },
    { condition: "normal", weight: 0.35 },
    { condition: "rainy", weight: 0.25 },
    { condition: "storm", weight: 0.05 },
  ],
  summer: [
    { condition: "sunny", weight: 0.55 },
    { condition: "normal", weight: 0.25 },
    { condition: "rainy", weight: 0.08 },
    { condition: "storm", weight: 0.12 },
  ],
  autumn: [
    { condition: "sunny", weight: 0.30 },
    { condition: "normal", weight: 0.40 },
    { condition: "rainy", weight: 0.25 },
    { condition: "storm", weight: 0.05 },
  ],
  winter: [
    { condition: "sunny", weight: 0.15 },
    { condition: "normal", weight: 0.25 },
    { condition: "rainy", weight: 0.35 },
    { condition: "storm", weight: 0.25 },
  ],
};

const SEASON_TREND: Record<Season, string> = {
  spring: "mild with frequent rain — good growing weather",
  summer: "hot and dry with the odd heat storm",
  autumn: "steady, cooler days ahead",
  winter: "harsh — expect storms and cold rain",
};

function forecastWeights(season: Season): WeatherWeights {
  const base = SEASON_WEATHER_WEIGHTS[season];
  const flat = 1 / base.length;
  const blend = 0.25; 
  return base.map((e) => ({
    condition: e.condition,
    weight: e.weight * (1 - blend) + flat * blend,
  }));
}

const FORECAST_DAYS = 3;

function rollWeighted(rng: Rng, weights: WeatherWeights): WeatherCondition {

  let total = 0;
  for (const entry of weights) total += entry.weight;
  const r = rng.nextFloat() * total;
  let cumulative = 0;
  for (const entry of weights) {
    cumulative += entry.weight;
    if (r < cumulative) return entry.condition;
  }

  return weights[weights.length - 1]!.condition;
}

export class WeatherSystem implements System {
  readonly name = "WeatherSystem";
  private lastDayProcessed = -1;

  constructor(
    private readonly bus: MessageBus,
    private readonly world: World<GameEntity>,
    private readonly rng: Rng,
  ) {}

  run(_ctx: SimContext): void {
    const stations = this.world.query("weatherStation", "inbox");
    for (const station of stations) {
      let newDay: number | null = null;
      for (const msg of station.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          const day = (msg.body as { day: number }).day;
          if (day > this.lastDayProcessed) {
            newDay = day;
          }
        }
      }

      if (newDay === null) continue;
      this.lastDayProcessed = newDay;

      const season = seasonForDay(newDay);
      const condition = rollWeighted(this.rng, SEASON_WEATHER_WEIGHTS[season]);
      const multiplier = WEATHER_MULTIPLIER[condition];

      station.weatherStation.current = condition;
      station.weatherStation.multiplier = multiplier;
      station.weatherStation.season = season;

      const forecast: Array<{ condition: WeatherCondition; confidence: number }> = [];
      for (let i = 1; i <= FORECAST_DAYS; i++) {
        const fcSeason = seasonForDay(newDay + i);
        const predicted = rollWeighted(this.rng, forecastWeights(fcSeason));
        const confidence = Math.max(0.4, 0.85 - (i - 1) * 0.15);
        forecast.push({ condition: predicted, confidence });
      }
      station.weatherStation.forecast = forecast;

      const nowBody: WeatherNowBody = {
        condition,
        multiplier,
        day: newDay,
        season,
        trend: SEASON_TREND[season],
      };
      this.bus.send(
        {
          performative: PERFORMATIVE.INFORM,
          ontology: ONT_WEATHER.NOW,
          sender: "world",
          recipient: "broadcast",
          body: nowBody as unknown as Record<string, unknown>,
        },
        _ctx.tick,
      );

      for (let i = 0; i < forecast.length; i++) {
        const fc = forecast[i]!;
        const forDay = newDay + i + 1;
        const forecastBody: WeatherForecastBody = {
          forDay,
          predicted: fc.condition,
          confidence: fc.confidence,
          season: seasonForDay(forDay),
        };
        this.bus.send(
          {
            performative: PERFORMATIVE.INFORM,
            ontology: ONT_WEATHER.FORECAST,
            sender: "world",
            recipient: "broadcast",
            body: forecastBody as unknown as Record<string, unknown>,
          },
          _ctx.tick,
        );
      }

      const farmers = this.world.query("beliefs", "farmer");
      for (const farmer of farmers) {
        farmer.beliefs.data.weatherNow = { condition, multiplier, day: newDay, season };
        farmer.beliefs.data.weatherSeason = season;
        farmer.beliefs.data.weatherForecast = forecast.map((fc, i) => ({
          forDay: newDay! + i + 1,
          predicted: fc.condition,
          confidence: fc.confidence,
          season: seasonForDay(newDay! + i + 1),
        }));
        farmer.beliefs.revision += 1;
      }
    }
  }
}
