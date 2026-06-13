# Game Task 02 — Weather, Crop Growth, Action Points

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Built three foundational systems: weather broadcasting, crop growth accumulation, and AP enforcement with an over-spend penalty.

## What shipped

- `agents/weather-station.ts` — `spawnWeatherStation(world)` spawns a singleton tag entity with `weatherStation: { current, multiplier, forecast }` and an inbox. Also exports `setupWeatherFeature(world, bus, rng)` returning all three systems.
- `systems/weather.ts` — `WeatherSystem`; detects day-start via WeatherStation inbox; rolls condition with `WEATHER_WEIGHTS` (sunny 0.45, normal 0.30, rainy 0.20, storm 0.05); updates `weatherStation.current/multiplier`; generates a 3-day forecast; broadcasts `ONT_WEATHER.NOW` and `ONT_WEATHER.FORECAST`; writes into all farmers' `beliefs.data.weatherNow/weatherForecast`.
- `systems/crop-growth.ts` — `CropGrowthSystem`; on day boundary iterates all `"planted"` plots in entity-id order (determinism); increments `daysGrowing`; adds weather multiplier to `weatherSum`.
- `systems/ap.ts` — `ApSystem`; `AP_COST` map: `plant/harvest/read-offers/post-offer/buy-seed=1`, `travel/negotiate/sell-shopkeeper/buy-from-wall/cnp-initiate=2`, `idle=0`. Pre-ACT: totals queue cost; drops lowest-priority intents until cost fits; deducts AP; sets `ap.penaltyPending=true` if farmer over-spent traveling with 0 AP. On `FINISH_DAY`: if `penaltyPending`, resets to `ap.penaltyCapacity` instead of `ap.max`; runs after `FinishDaySystem` and overwrites (documented in top-of-file comment).
- `CropGrowthSystem` does not touch `HarvestSystem` — maturity check stays there.
