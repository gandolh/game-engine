# Game Task 02 — Weather, Crop Growth, Action Points

## Context

"Farm Valley" multi-agent sim. Three systems that the rest of the game depends on but aren't built yet:

1. **Weather** — broadcasts conditions on day boundaries; farmers consume via inbox.
2. **Crop growth** — advances `daysGrowing` and accumulates `weatherSum` for planted plots.
3. **Action Points** — enforces AP costs per intention; handles the "AP penalty" if a farmer over-spent while traveling.

## Files you OWN (create)

- `packages/farm-valley/src/agents/weather-station.ts` — spawner for the WeatherStation entity
- `packages/farm-valley/src/systems/weather.ts` — WeatherSystem (decides + broadcasts each day)
- `packages/farm-valley/src/systems/crop-growth.ts` — CropGrowthSystem (per day boundary)
- `packages/farm-valley/src/systems/ap.ts` — ApSystem (deducts AP, applies penalty)
- `packages/farm-valley/src/systems/weather.test.ts`
- `packages/farm-valley/src/systems/crop-growth.test.ts`
- `packages/farm-valley/src/systems/ap.test.ts`

## Files you must NOT touch

- `packages/farm-valley/src/main.ts` — integration is my job
- `packages/farm-valley/src/components.ts` — already pre-extended with `WeatherStation`, `ActionPoints`, and the new `PlotState.weatherSum` field
- `packages/farm-valley/src/world-setup.ts` — read-only
- `packages/farm-valley/src/protocols/**` — `weather.ts` already exists with all ontologies + bodies
- `packages/farm-valley/src/systems/{day-clock,perceive,deliberate,act,finish-day,harvest,inbox-dispatch}.ts` — read-only
- `packages/farm-valley/src/agents/{conservative,registry}.ts` — read-only
- `packages/engine/**`

## What to build

### `weather-station.ts`
- `spawnWeatherStation(world): GameEntity` — adds an entity with `weatherStation: { current: "normal", multiplier: 1.0, forecast: [] }` and an `inbox: { messages: [] }`. No personality, no transform, no sprite. Singleton tag entity.

### `WeatherSystem` (in `weather.ts`)
- Constructor: `(bus: MessageBus, world: World<GameEntity>, rng: Rng)`
- Tracks last-day-changed; when a new day starts (detected via `day-start` message in the WeatherStation's inbox), the system:
  1. Rolls a new condition using `WEATHER_WEIGHTS` (define your own deterministic weights: sunny 0.45, normal 0.30, rainy 0.20, storm 0.05)
  2. Updates `weatherStation.current` and `multiplier`
  3. Generates a 3-day forecast (slightly noisier weights for confidence)
  4. **Broadcasts** `ONT_WEATHER.NOW` with `WeatherNowBody`, and `ONT_WEATHER.FORECAST` with `WeatherForecastBody` per upcoming day
  5. Also writes the condition/forecast into ALL farmers' `beliefs.data.weatherNow` and `beliefs.data.weatherForecast` (this is the integration the personalities team will read)

### `CropGrowthSystem` (in `crop-growth.ts`)
- Constructor: `(world)`
- On day boundary (detect via DayStart message in the weather station inbox OR via a "previous day" cache held in the system itself — recommended: cache last day per-system), iterate all `plot` entities whose state is `"planted"`, and:
  - Increment `daysGrowing`
  - Read current weather multiplier from the WeatherStation singleton and add to `weatherSum`
- Don't touch the `HarvestSystem` — it handles maturity check
- Be deterministic: iterate entities in id order (sort once per tick)

### `ApSystem` (in `ap.ts`)
- Constructor: `(world)`
- Define AP costs as a constant map (mirror Python):
  ```ts
  const AP_COST = {
    plant: 1, harvest: 1, travel: 2, negotiate: 2,
    "read-offers": 1, "post-offer": 1, "buy-seed": 1,
    "sell-shopkeeper": 2, "buy-from-wall": 2,
    "cnp-initiate": 2, "cnp-respond-bid": 1,
    idle: 0,
  } as const;
  ```
- Each tick, for every farmer in state `ACT`, walk their `intentions.queue` BEFORE the ActSystem runs and:
  1. Compute total AP cost
  2. If `ap.current < cost`, drop low-priority intentions until cost fits (keep high-priority `sell-*` actions; document the rule in a one-line comment)
  3. Deduct AP
  4. If, after dropping, the farmer is `away` (any intent that costs `travel` was kept) and `ap.current === 0`, set `ap.penaltyPending = true`
- On `FINISH_DAY`, reset:
  - If `ap.penaltyPending`, set `ap.current = ap.penaltyCapacity` and clear `penaltyPending`
  - Else, set `ap.current = ap.max`
- **Important:** the existing `FinishDaySystem` already resets `ap.current = ap.max`. You must replace that behavior. You may not modify `finish-day.ts` directly — instead, your `ApSystem` runs AFTER `FinishDaySystem` and overwrites the value when penaltyPending is set, OR runs BEFORE `FinishDaySystem` and short-circuits. Document your choice in a top-of-file comment.

### Wire-up

You do NOT modify `main.ts`. Instead, expose a single helper from `weather-station.ts`:
```ts
export function setupWeatherFeature(world, bus, rng): {
  weatherSystem: WeatherSystem,
  cropGrowthSystem: CropGrowthSystem,
  apSystem: ApSystem,
}
```
that I will call from main.ts during integration. Each system in the returned object is a `System` from `@engine/core`.

### Tests

- `weather.test.ts`: with a seeded RNG and a fake bus, advancing a day causes (a) condition change broadcast, (b) WeatherStation state updated, (c) all farmers' beliefs updated
- `crop-growth.test.ts`: a planted plot's `daysGrowing` increments on day boundary; `weatherSum` accumulates multiplier
- `ap.test.ts`: AP cost is deducted; if not enough AP, lowest-priority intent is dropped; penaltyPending triggers reduced AP next day

## Acceptance criteria

- `npm run typecheck` passes
- `npm run test -w farm-valley` passes (your tests)
- `setupWeatherFeature` exported from `weather-station.ts`
- No `.js` import suffixes, no new deps

## Difficulty & subagent split

**MEDIUM** overall. AP logic with penalty is the trickiest part; weather + crop growth are mechanical.

Recommended split:
- **Junior (sonnet) subagent**: `weather-station.ts` + `weather.ts` + `crop-growth.ts` + their tests
- **Senior (opus) subagent**: `ap.ts` + `ap.test.ts` (the penalty interaction with FinishDay is subtle)
- Or do it solo with sonnet if you're confident — both halves are independent files anyway.
