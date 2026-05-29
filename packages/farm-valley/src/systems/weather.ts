import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import {
  ONT_WEATHER,
  WEATHER_MULTIPLIER,
  ONT_SIMULATION,
  PERFORMATIVE,
  seasonForDay,
} from "../protocols";
import type {
  WeatherCondition,
  WeatherNowBody,
  WeatherForecastBody,
  Season,
} from "../protocols";

type WeatherWeights = ReadonlyArray<{ condition: WeatherCondition; weight: number }>;

/**
 * Per-season weather distributions (game brief 22 — seasons / weather arcs).
 *
 * The 100-day run is divided into four 25-day seasons (see `seasonForDay`).
 * Each season biases the per-day weather draw to give the run a coherent arc.
 * Weights sum to 1.0 within each season. No Python source exists in this repo,
 * so the biases below are chosen for coherence and documented here:
 *
 *   spring — mild & growy: extra rain (good for the early radish push),
 *            storms rare.  sunny .35 / normal .35 / rainy .25 / storm .05
 *   summer — hot & drought-prone: lots of sun but heat-storm risk; little rain.
 *            sunny .55 / normal .25 / rainy .08 / storm .12
 *   autumn — the harvest balance: steady normal/rain, moderate everything.
 *            sunny .30 / normal .40 / rainy .25 / storm .05
 *   winter — harsh: sun is scarce, storms and cold rain dominate.
 *            sunny .15 / normal .25 / rainy .35 / storm .25
 *
 * Because sunny->1.2 and storm->0.5 multipliers feed crop-growth's weatherSum,
 * these biases also implicitly modulate yields: summer grows fast but is risky,
 * winter is a slow grind. No separate yield table is needed.
 */
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

/** One-line hint per season for the broadcast forecast so agents can plan. */
const SEASON_TREND: Record<Season, string> = {
  spring: "mild with frequent rain — good growing weather",
  summer: "hot and dry with the odd heat storm",
  autumn: "steady, cooler days ahead",
  winter: "harsh — expect storms and cold rain",
};

/**
 * Forecast weights soften the season bias slightly (pull a little toward the
 * mean) to model reduced confidence in the exact future condition while still
 * reflecting the season's trend.
 */
function forecastWeights(season: Season): WeatherWeights {
  const base = SEASON_WEATHER_WEIGHTS[season];
  const flat = 1 / base.length;
  const blend = 0.25; // 25% toward uniform
  return base.map((e) => ({
    condition: e.condition,
    weight: e.weight * (1 - blend) + flat * blend,
  }));
}

const FORECAST_DAYS = 3;

function rollWeighted(rng: Rng, weights: WeatherWeights): WeatherCondition {
  // Weights are not guaranteed to sum to exactly 1 (forecast blend), so scale r.
  let total = 0;
  for (const entry of weights) total += entry.weight;
  const r = rng.nextFloat() * total;
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

      // 0. Season is a pure function of the day index (deterministic, no clock).
      const season = seasonForDay(newDay);

      // 1. Roll new condition using this season's biased distribution.
      const condition = rollWeighted(this.rng, SEASON_WEATHER_WEIGHTS[season]);
      const multiplier = WEATHER_MULTIPLIER[condition];

      // 2. Update WeatherStation component
      station.weatherStation.current = condition;
      station.weatherStation.multiplier = multiplier;
      station.weatherStation.season = season;

      // 3. Generate 3-day forecast. Each forecast day uses ITS OWN season's
      //    softened weights, so a forecast that crosses a season boundary
      //    already reflects the upcoming trend.
      const forecast: Array<{ condition: WeatherCondition; confidence: number }> = [];
      for (let i = 1; i <= FORECAST_DAYS; i++) {
        const fcSeason = seasonForDay(newDay + i);
        const predicted = rollWeighted(this.rng, forecastWeights(fcSeason));
        // Confidence decreases further into the future
        const confidence = Math.max(0.4, 0.85 - (i - 1) * 0.15);
        forecast.push({ condition: predicted, confidence });
      }
      station.weatherStation.forecast = forecast;

      // 4. Broadcast ONT_WEATHER.NOW (includes the current season + trend hint)
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

      // 4b. Broadcast ONT_WEATHER.FORECAST for each upcoming day. The season
      //     on each message lets agents see when (and into what) the trend turns.
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

      // 5. Write into ALL farmers' beliefs
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
