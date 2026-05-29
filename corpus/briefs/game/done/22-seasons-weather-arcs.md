# Game Task 22 — Seasons / Multi-Day Weather Arcs

## Context

Weather is currently sampled per-day and (effectively) independent — there's no trend across the 100-day run, so the run has no temporal *shape* and the opportunist's "adapts to weather" trait has little to adapt to beyond noise. Seasons give the run an arc: a wet stretch favors some crops, a dry stretch punishes others, and personalities that read the trend pull ahead. This builds directly on the existing `WeatherSystem` / weather-station and the deterministic `Rng`.

This is a depth brief — schedule it when you want runs to feel less same-y (see [open-questions.md](../../../wiki/open-questions.md): "if the runs start feeling stale").

## Goal

1. **Season cycle**: divide the 100-day run into seasons (e.g. 4 × 25 days, or configurable). Each season biases the weather distribution and/or crop yields — e.g. spring favors radish, summer raises drought odds, autumn boosts pumpkin, etc. (Pick coherent biases; the Python spec wins if it defines seasons.)
2. **Forecast reflects the trend**: the weather station's broadcast forecast should hint at the season's bias so agents can plan, not just react.
3. **Deterministic**: season schedule + per-day weather both derive from the seeded `Rng` and the day index — same seed → same weather arc.
4. **Surface it**: show the current season somewhere visible (observer header / debug overlay), and ideally tint the backdrop subtly per season (optional; coordinate with the renderer if attempted).

## Files in scope

- `packages/farm-valley/src/systems/weather.ts` — introduce a season concept that biases the weather draw; expose the current season.
- `packages/farm-valley/src/agents/weather-station.ts` — broadcast the season + a season-aware forecast.
- `packages/farm-valley/src/systems/crop-growth.ts` — ALLOWED if season should modulate yields (keep the modulation small and deterministic).
- `packages/farm-valley/src/systems/weather.test.ts`, `crop-growth.test.ts` — add tests: season schedule is deterministic for a seed; weather distribution shifts per season; (if yields change) yield modulation is applied.
- `packages/farm-valley/src/ui/observer.ts` — show the current season in the header.
- `packages/farm-valley/src/components.ts` — ALLOWED only if the weather-station component needs a `season` field. Read first.

## Files you must NOT touch

- `agents/conservative.ts` / `aggressive.ts` / `hoarder.ts` / `opportunist.ts` — this brief changes the *world's* weather, not the bidders' strategies. (A follow-up could teach personalities to exploit seasons; out of scope. They already read forecasts via beliefs, so they'll adapt somewhat for free.)
- `world/**`, `world-setup.ts`, `sim-bootstrap.ts`, `protocols/**` (reuse existing weather ontology if possible).
- `render-systems.ts` unless doing the optional backdrop tint — and only minimally if so.
- Engine source.

## Determinism note

Season schedule and weather must be pure functions of `(seed, day)` via the seeded `Rng` named forks. No `Math.random`, no `Date.now`. A replay of the same seed must produce the identical weather arc.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (season determinism + distribution-shift tests added)
- `npm run dev` / `npm run sim`: weather shows a coherent arc across the run; the current season is visible; same seed reproduces the same arc
- No `.js` import suffixes; no new runtime deps

## Workflow

You're the sonnet executor. Read this brief, then `systems/weather.ts`, `agents/weather-station.ts`, and `systems/crop-growth.ts`. Confirm the Python spec's season semantics if available; otherwise pick coherent biases and document them. Implement. Run typecheck + tests (and a quick `npm run sim`) before reporting done. Report files changed, test counts, and anything surprising. Do not commit — orchestrator handles that.
