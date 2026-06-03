# Game Task 29 — Irrigation & Crop Death (3d)

## Context

Today crops grow on weather/season multipliers alone — there is **no watering concept** anywhere in the codebase ([systems/crop-growth.ts](../../../../packages/farm-valley/src/systems/crop-growth.ts): each `DAY_START`, planted plots get `daysGrowing += 1` and `weatherSum += weatherMultiplier`). This brief makes **watering a hard growth requirement with crop death** — a deliberate, intentional change to the crop economy.

This is the **one exception** to Brief 27's "macro-economy stays day-denominated and untouched" rule: watering *does* change the crop economy. It was chosen explicitly over a softer "watering is a bonus" model — neglected crops should die.

## Goal

Crops must be watered (by an agent or by rain) to grow, and die if left dry too long. Watering becomes a real daily AP commitment (1 AP/crop, Brief 28), rain becomes strategically valuable, and drought/the shock get teeth.

## Design decisions (locked via grilling 2026-06-03)

### Dryness model — day-counted with a grace window

- Each planted plot tracks **`daysSinceWater`**.
- **Watering** a plot (the `water` action, 1 AP — Brief 28) **or rain** (weather = rainy **auto-waters all plots** that day) resets `daysSinceWater` to 0.
- **Growth gate:** `daysGrowing` / `weatherSum` only increment on days the plot was **watered or rained on**. Dry days = no growth progress.
- **Death:** if `daysSinceWater` exceeds a **grace threshold (2 dry days)**, the planted crop **dies** — the plot reverts to empty and the seed is lost. The grace window makes a single missed day recoverable, not instantly fatal.

### Agent reaction — survival reflex, personality-tuned

Watering is a **baseline survival priority for all four personalities**: in `deliberate*`, each waters its planted plots that are due (within the grace window) **before** discretionary actions, so no farm silently collapses. Personality flavors the *thresholds/timing*, not whether they water:

- Conservative (Cora) — waters early, never risks the grace window.
- Opportunist (Otto) — waters lazily (waits to day-2 of dryness), banking AP for trades.
- Aggressive (Atticus) — over-plants; may let marginal plots die to fund expansion.
- Hoarder (Hannah) — waters everything religiously.

Watering decisions surface in the `decisionTrace` "why" panel ("water radish: 1 day from wilting").

## Implementation notes

- Plug into the existing day loop in `crop-growth.ts`: gate the `daysGrowing`/`weatherSum` increment on a per-plot watered-today flag; advance `daysSinceWater`; revert plots past the grace threshold.
- The `water` intention + AP cost is defined in Brief 28; this brief consumes it.
- Rain detection: read the WeatherStation singleton (same signal `crop-growth.ts` already uses for the day boundary). On a rainy day, treat all plots as watered.
- Determinism: plot iteration stays id-ascending (as today). No `Math.random` — death is a pure function of `daysSinceWater`.

## Files in scope

- `packages/farm-valley/src/systems/crop-growth.ts` — watered-gate on growth, `daysSinceWater` advance, rain auto-water, death/revert past grace.
- `packages/farm-valley/src/components.ts` — `daysSinceWater` (and watered-today) on the plot state.
- `packages/farm-valley/src/systems/act.ts` — handle the `water` intent (mark the plot watered this day).
- `packages/farm-valley/src/agents/{aggressive,hoarder,opportunist,conservative}.ts` — survival-reflex watering with personality-tuned thresholds + decision-trace reasons.
- `packages/farm-valley/src/systems/event-feed.ts` — surface crop death ("Day N — Hannah's wheat withered") so the loss is legible.
- Matching `*.test.ts` — watered crop grows, dry crop doesn't, rain waters all, crop dies after grace, each personality waters before discretionary actions.

## Files you must NOT touch

- Weather roll cadence / season length (still day-denominated).
- Engine source.

## Dependencies

- **Requires Brief 28** for the `water` action's AP cost, and **Brief 27** for the long day in which watering across slots is meaningful. Sequence after both.

## Acceptance

- Unwatered, unrained crops stop growing and die after 2 dry days; watered/rained crops grow normally.
- All four farms stay viable (no mass collapse) because watering is a survival reflex; the Activity feed shows occasional crop deaths from neglect/drought.
- Rain visibly saves AP (no manual watering needed that day).
- `npm test` / `npm run typecheck` green; determinism harness MATCHes.
