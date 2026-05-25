import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import {
  ONT_WEATHER,
  WEATHER_MULTIPLIER,
  ONT_SIMULATION,
  PERFORMATIVE,
} from "../protocols";
import type { WeatherCondition, WeatherNowBody, WeatherForecastBody } from "../protocols";

/**
 * Weighted probabilities for weather conditions.
 * sunny: 0.45, normal: 0.30, rainy: 0.20, storm: 0.05
 */
const WEATHER_WEIGHTS: ReadonlyArray<{ condition: WeatherCondition; weight: number }> = [
  { condition: "sunny", weight: 0.45 },
  { condition: "normal", weight: 0.30 },
  { condition: "rainy", weight: 0.20 },
  { condition: "storm", weight: 0.05 },
];

/**
 * Slightly noisier weights for forecast (reduced confidence in extremes).
 */
const FORECAST_WEIGHTS: ReadonlyArray<{ condition: WeatherCondition; weight: number }> = [
  { condition: "sunny", weight: 0.40 },
  { condition: "normal", weight: 0.35 },
  { condition: "rainy", weight: 0.20 },
  { condition: "storm", weight: 0.05 },
];

const FORECAST_DAYS = 3;

function rollWeighted(
  rng: Rng,
  weights: ReadonlyArray<{ condition: WeatherCondition; weight: number }>,
): WeatherCondition {
  const r = rng.nextFloat();
  let cumulative = 0;
  for (const entry of weights) {
    cumulative += entry.weight;
    if (r < cumulative) return entry.condition;
  }
  // Fallback (floating-point edge): return last entry
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
    // Find the WeatherStation singleton
    const stations = this.world.query("weatherStation", "inbox");
    for (const station of stations) {
      // Scan inbox for a day-start message
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

      // 1. Roll new condition
      const condition = rollWeighted(this.rng, WEATHER_WEIGHTS);
      const multiplier = WEATHER_MULTIPLIER[condition];

      // 2. Update WeatherStation component
      station.weatherStation.current = condition;
      station.weatherStation.multiplier = multiplier;

      // 3. Generate 3-day forecast
      const forecast: Array<{ condition: WeatherCondition; confidence: number }> = [];
      for (let i = 1; i <= FORECAST_DAYS; i++) {
        const predicted = rollWeighted(this.rng, FORECAST_WEIGHTS);
        // Confidence decreases further into the future
        const confidence = Math.max(0.4, 0.85 - (i - 1) * 0.15);
        forecast.push({ condition: predicted, confidence });
      }
      station.weatherStation.forecast = forecast;

      // 4. Broadcast ONT_WEATHER.NOW
      const nowBody: WeatherNowBody = {
        condition,
        multiplier,
        day: newDay,
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

      // 4b. Broadcast ONT_WEATHER.FORECAST for each upcoming day
      for (let i = 0; i < forecast.length; i++) {
        const fc = forecast[i]!;
        const forecastBody: WeatherForecastBody = {
          forDay: newDay + i + 1,
          predicted: fc.condition,
          confidence: fc.confidence,
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

      // 5. Write into ALL farmers' beliefs
      const farmers = this.world.query("beliefs", "farmer");
      for (const farmer of farmers) {
        farmer.beliefs.data.weatherNow = { condition, multiplier, day: newDay };
        farmer.beliefs.data.weatherForecast = forecast.map((fc, i) => ({
          forDay: newDay! + i + 1,
          predicted: fc.condition,
          confidence: fc.confidence,
        }));
        farmer.beliefs.revision += 1;
      }
    }
  }
}
