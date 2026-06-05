# Game Task 38 — Drama Scoring & Narrative Escalation

## Context

Football Manager 26's "Dynamic Highlight Mode" encodes a lesson the whole spectator-sim space agrees on: **narrative density should track dramatic stakes, not wall-clock time.** (Source: footballmanager.com FM26 match-day feature.) A 4-0 blowout shows fewer highlights; a tight final shows more. Farm Valley's [`EventFeedSystem`](../../../../packages/farm-valley/src/systems/event-feed.ts) currently treats every event the same — a Day-3 routine seed buy and a Day-93 standings-flipping golden-bean win read with identical weight. The result: **flat narrative density.** Days 1–30 (establishment), 31–70 (competition), 71–100 (climax) all feel the same.

This brief adds a **drama score** to events and uses it to (a) visually emphasize big moments, (b) make the final stretch feel like a race, and (c) feed the recap's "headline" (brief 36) and a future highlight/skip control (brief 40).

## Goal

1. **Score each event** — extend `EventEntry` with a `drama: number` (0–1). Scoring is a pure function of event type + context:
   - Routine seed buy / small shop sale → low (~0.1).
   - Auction win, peer trade, crop death → medium (~0.4–0.6).
   - **Rank change at the top** (a farmer takes/loses 1st), the mid-game blight, a final-week surge, a bean gift that swings an alliance → high (~0.8–1.0).
   - **Day-weighted multiplier**: the same event type scores higher later in the run (climax act). Use `seasonForDay` / act bands (1–30 / 31–70 / 71–100) already implied by the season system (verify [systems/weather.ts](../../../../packages/farm-valley/src/systems/weather.ts) `seasonForDay`).
2. **Rank-change detection** — the feed (or the brief-36 run-history system, if merged) should emit an event when the **top rank changes** ("Otto overtakes Hannah for 1st!") — these are the crossings the wealth-graph (brief 39) will visually mark, and they're the highest-drama routine events.
3. **Visual emphasis in the feed panel** — high-drama lines render with more weight (brighter EDG color / a leading marker like `★`); routine lines stay quiet. No new colors outside `EDG.*`.
4. **"The race is on" framing** — when, on day ≥ 90, the gap between 1st and 2nd is within a small % of the leader's gold, surface a one-shot high-drama feed line ("Final stretch — Otto and Cora separated by 6%").

## Design decisions

- **Drama scoring is a pure, centralized helper** (`dramaScore(event, ctx)` in a new `drama.ts`), called by `EventFeedSystem` when it captures an event — NOT scattered per call site. Keeps it testable and tweakable.
- **Rank-change events** need the current per-day ranking. If brief 36's `RunHistorySystem` is merged, read rank from it; otherwise compute the ranking inline in the feed from the same gold ordering the leaderboard uses (deterministic tie-break gold desc → id asc). State whichever you did at the top of `drama.ts`.
- **Determinism**: scoring is pure; the "race is on" / rank-change lines use stable keys for the feed's existing dedup set. No new randomness.
- **Do not change what counts as an event** beyond adding rank-change + the race-on line — this brief is about *weighting and emphasis*, not new event sources.

## Files in scope

- `packages/farm-valley/src/systems/drama.ts` — NEW: pure `dramaScore(kind, ctx)` + the act-band/day-weight table.
- `packages/farm-valley/src/systems/drama.test.ts` — NEW: a top-rank flip on day 95 scores higher than the same flip on day 5; routine buys score low; deterministic.
- `packages/farm-valley/src/systems/event-feed.ts` — set `drama` on each captured `EventEntry`; emit rank-change + race-on lines (stable keys, dedup discipline preserved).
- `packages/farm-valley/src/systems/event-feed.test.ts` — assert a captured event carries a drama score; rank-change line emitted on a top-rank flip.
- `packages/farm-valley/src/worker/snapshot.ts` — `EventEntry` (or its snapshot mirror) carries `drama`.
- `packages/farm-valley/src/ui/event-feed-panel.ts` — render high-drama lines with emphasis (EDG palette only).
- `packages/farm-valley/src/ui/event-feed-panel.test.ts` — high-drama entry gets the emphasis marker/class.

## Files you must NOT touch

- `agents/**` — drama is a presentation/observation concern.
- Engine source.
- Trust/auction/market resolution logic.

## Determinism guarantee

`dramaScore` is pure; all new feed lines use stable dedup keys. No `Date.now`/`Math.random`. Run `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` — purely additive observation, outcomes must MATCH.

## Acceptance

- `npm run typecheck` + `npm run test` green.
- `npm run dev`: late-game standings flips and the blight stand out visually in the feed; a "race is on" line appears when a late run is close; same seed reproduces the same scored feed.
- Provides `drama` for brief 36's headline and brief 40's highlight/skip.

## Workflow

Sonnet executor. Read `EventFeedSystem` end-to-end (it's the spine of this brief), `seasonForDay` in the weather system, and `ui/event-feed-panel.ts`. Decide the rank source (history system vs. inline) and note it. Implement, typecheck, test, run determinism. Report files changed + test counts. Do not commit.
