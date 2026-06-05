# Game Task 45 — Seasonal Visual Identity + Festival Events

## Context

This is the **art-style / world-design** brief. Two findings from the world analysis:

1. **The four seasons are mechanically real but visually invisible.** Weather biases crop growth ([weather.ts](../../../../packages/farm-valley/src/systems/weather.ts)), and there's a day/night + seasonal *color wash* ([render/day-night.ts](../../../../packages/farm-valley/src/render/day-night.ts)), but the **tiles never change** — same grass, ocean, and trees in spring and winter. There's no rain animation, no snow, no autumn leaves. The genre treats the seasonal transition as "an emotionally resonant moment even after dozens of playthroughs"; right now you only know the season from the HUD label.

2. **The calendar has no landmarks.** No festivals, fairs, or scheduled events — the genre's calendar landmarks ("players anticipate and plan around" festivals) are absent. The village has an auction podium + town square that only host the golden-bean auction.

Both are high perceived-quality and fit the established procedural-recipe + EDG32 pipeline.

## Goal

### Part A — Seasonal visual identity
1. **Season-variant ground tiles**: render grass/foliage with a per-season treatment — spring (fresh green + flecks), summer (deeper/dry), autumn (golden/orange), winter (snow-dusted). Cheapest path that respects the baked-static-layer architecture: either (a) season-tinted bakes of the ground-noise layer, or (b) a small set of season tile variants selected in `backdropFrame`. Pick the one that fits [render-systems.ts](../../../../packages/farm-valley/src/render-systems.ts) `bakeStaticLayer` cleanly — re-bake on season change (4× per run, cheap).
2. **Weather particle overlays**: extend the existing `ParticleSystem` (already used for coins/dirt/leaves) with **rain** (rainy/storm days) and **snow** (winter) ambient overlays — render-only, wall-clock animated like the foam/forge effects, EDG palette only.
3. **Seasonal foliage**: trees show autumn-colored / bare-winter variants (the orchard work in brief 42 makes this even more visible). Cheap recipe variants.

### Part B — Festivals (calendar landmarks)
4. **Scheduled festival days** anchored to the season clock (e.g. a Spring planting fair, a mid-Summer market day, an Autumn harvest fair, a Winter feast). On a festival day:
   - Farmers **gather in the village** (reuse the tavern/town-square gathering from brief 44; the auction podium is the stage).
   - A **festival mechanic** with stakes (pick cheap, high-drama options): a **harvest contest** (the farmer who ships the best crop/quality that day wins a gold prize + a trust/standing bump), or a **special market** (one-day price spike on a crop → a planning opportunity agents can exploit).
   - It's a **dramatic beat** for the spectator (feeds the event feed brief 20 + drama scoring brief 38 + the recap brief 36): "Harvest Fair — Atticus wins with a Gold pumpkin."
5. **Deterministic + planned**: festival dates are fixed by the calendar (agents can see them coming in beliefs, like the weather forecast) so personalities can *plan* for them — a strategic layer, not just a cutscene.

## Agent wiring

- Festival awareness in beliefs (a `daysUntilFestival` / `festivalToday` signal from the day-clock). Personalities may hold back a high-quality crop for the contest, or plant for the price-spike day. `decisionTrace` reasons ("holding Gold pumpkin for Harvest Fair").
- Gathering/contest participation is a festival-day intention; the contest resolution is a **system** (pure, deterministic ranking of submissions), not agent logic.

## Files in scope

- `tools/atlas-builder/src/recipes.ts` — season ground-tile variants and/or tint anchors; autumn/bare-tree variants; any festival dressing (banners, stalls). `npm run atlas`; update frame-count test.
- `packages/farm-valley/src/render-systems.ts` — season-aware `backdropFrame`/`bakeStaticLayer`; re-bake on season change. **Render-only.**
- `packages/farm-valley/src/render/` (particles / a new weather-fx module) + `main.ts` — rain/snow ambient overlays driven by current weather/season. **Render-only.**
- `packages/farm-valley/src/systems/festival.ts` — NEW: calendar of festival days, gathering trigger, contest/special-market resolution, event emission. Registered in [sim-bootstrap.ts](../../../../packages/farm-valley/src/sim-bootstrap.ts).
- `packages/farm-valley/src/systems/day-clock.ts` — expose `festivalToday`/`daysUntilFestival`.
- `packages/farm-valley/src/systems/act.ts` + [ap.ts](../../../../packages/farm-valley/src/systems/ap.ts) — festival participation action(s).
- `packages/farm-valley/src/agents/*.ts` — festival planning deliberation.
- `packages/farm-valley/src/systems/event-feed.ts` — narrate festival results (a stable-key, drama-scored entry).
- Matching `*.test.ts`: a festival fires on its calendar day; the contest ranks submissions deterministically and awards the prize; render tests assert season tile variants bake; the feed gets a festival line.

## Files you must NOT touch

- Engine source (use the existing renderer/particle APIs; rain/snow are new *content* in the game's render layer, not engine changes).
- The crop/auction resolution logic except to read crop quality for the contest.

## Determinism guarantee

Part A is render-only (no sim state). Part B is calendar-driven and pure given sim state; any prize roll uses a forked seeded `Rng`. `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` + json diff (Part B changes outcomes by design — verify replay-MATCH). Update [status.md](../../../wiki/status.md) baseline.

## Acceptance

- `npm run typecheck` + `npm run test` green; palette guard + atlas frame-count updated.
- `npm run dev`: the four seasons look visibly distinct (tiles + rain/snow); festival days gather farmers in the village and run a contest/special-market with a feed-narrated result; agents visibly plan around festivals.
- Determinism MATCHes on replay across 3 seeds.

## Workflow

Sonnet executor. Part A (render) and Part B (sim) are separable — can land in either order or as two PRs. Read `bakeStaticLayer`/`backdropFrame` + the day-night wash, the `ParticleSystem` usage in `main.ts`, `day-clock.ts`, and the golden-bean auction flow (the podium precedent). Implement. Typecheck, test, rebake atlas, run determinism + json diff. Report files changed, test counts, baseline. Do not commit.
