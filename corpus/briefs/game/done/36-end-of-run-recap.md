# Game Task 36 — End-of-Run Recap ("Legends" wrap-up)

## Context

Farm Valley is a **spectator / story-generator sim** (you watch four BDI farmers compete over 100 days — see [overview.md](../../../wiki/overview.md)). Research into the genre that matters here — RimWorld, Dwarf Fortress *Legends mode*, Hades death-recaps, Football Manager, Civ4 AI Survivor — is unanimous on one point: **the single biggest re-engagement hook for a watched sim is a post-run recap that turns the run into a story worth telling and re-sharing.** (Sources: tynansylvester.com "The Simulation Dream"; DF Legends mode; Hades run-recap pattern.)

Today the run just ends: at `day >= maxDays` the worker sets `gameOver` + builds `finalSummary: FinalStandingRow[]`, and [`renderGameOver`](../../../../packages/farm-valley/src/main.ts) prints a monospace standings block in the existing game-over panel (built in `createGameOverPanel`, with a "Share this run" button already wired). That's a scoreboard, not a story. We already capture every notable moment in [`EventFeedSystem`](../../../../packages/farm-valley/src/systems/event-feed.ts) (`EventEntry { tick, day, text, key }`, capped at `EVENT_FEED_CAP = 50`) and surface it through `RenderSnapshot.events` → `SimClient.events`. The recap is **synthesis over data we already have** — no new sim mechanics.

This is the highest-payoff spectator brief.

## Goal

Replace the bare standings block with a **Day-100 Recap** panel that reads like a season wrap-up:

1. **Final standings** (keep) — rank, name, personality, gold, with rank-delta vs. the **Day-50 halfway** snapshot ("▲2 from mid-season").
2. **Per-farmer one-line "season arc"** — an auto-generated sentence per farmer from their own trajectory, e.g.
   - `Otto — last for 71 days, surged to 1st in the final week.`
   - `Hannah — led for 80 days, then collapsed to 3rd.`
   - `Cora — steady all season, never left the top two.`
   Derived from a small rank-history time series (see "Data" below), not hand-authored per run.
3. **Run headline** — the single most dramatic moment of the run (highest drama-score event; if brief 38 isn't merged, fall back to "biggest single trade" + "the mid-game blight"), e.g. `The story of the run: Otto's Day-93 golden-bean win flipped the standings.`
4. **Rivalry outcomes** (if brief 37 is merged) — one line per labeled rivalry and how it resolved. Gate behind a feature check; omit the section cleanly if 37 isn't present.
5. **Seed + "Watch another"** — keep the existing "Share this run" button; add a prompt showing the seed and inviting a re-run with a new one (re-runs are the spectator-sim retention loop — Civ4 AI Survivor's prediction metagame).

The panel must stay **screenshot-worthy and shareable** — it's the artifact a viewer posts.

## Data — what the recap is built from

The recap needs a **per-farmer rank/gold time series** that today doesn't exist as a retained series. Add a minimal, deterministic **run-history collector** in the sim:

- New `systems/run-history.ts` — a passive, read-only system (like `EventFeedSystem`) that on each **`DAY_START`** (subscribe to the day-clock signal already used by `BubbleSystem`) appends one row per farmer: `{ day, farmerId, gold, rank }` to a bounded buffer (100 days × 5 farmers = 500 rows; trivial). Rank is computed from that day's gold ordering with a deterministic tie-break (gold desc → farmerId asc, matching the leaderboard's existing tie-break — verify in [ui/leaderboard.ts](../../../../packages/farm-valley/src/ui/leaderboard.ts)).
- The **arc sentence** + **headline** are computed once at game-over (a pure `summarizeRun(history, events)` in a new `run-recap.ts`), NOT every tick. Keep all formatting pure so a replay of the same seed produces a byte-identical recap.

## Files in scope

- `packages/farm-valley/src/systems/run-history.ts` — NEW: passive per-day rank/gold collector, exposed on `BootedSim` (mirror how `eventFeed` is exposed in [sim-bootstrap.ts](../../../../packages/farm-valley/src/sim-bootstrap.ts)).
- `packages/farm-valley/src/systems/run-history.test.ts` — NEW: records one row/farmer/day; rank tie-break deterministic; buffer bounded.
- `packages/farm-valley/src/run-recap.ts` — NEW: pure `summarizeRun(history, events, finalStandings)` → `RunRecap { standings, arcs: string[], headline: string, rivalries?: string[] }`. Pure functions only.
- `packages/farm-valley/src/run-recap.test.ts` — NEW: a "rose from last to first" trajectory yields the surge arc; a "led then collapsed" trajectory yields the collapse arc; deterministic.
- `packages/farm-valley/src/sim-bootstrap.ts` — register `RunHistorySystem` (read-only placement, alongside the other snoops); expose accessor on `BootedSim`.
- `packages/farm-valley/src/worker/snapshot.ts` + `snapshot-builder.ts` — at game-over, carry the `RunRecap` (or the raw history if you prefer to summarize on the main thread) alongside the existing `finalSummary`. Keep `finalSummary` as-is for back-compat with `snapshot-builder.test.ts`.
- `packages/farm-valley/src/worker/sim-client.ts` — expose `recap` getter (mirror `finalSummary`).
- `packages/farm-valley/src/main.ts` — `createGameOverPanel` gains the arc/headline/rivalry sections; `renderGameOver` populates them from `client.recap`. Keep the "Share this run" button + seed badge behavior.

## Files you must NOT touch

- `agents/**` — the recap is *observed*, not produced by changing agent logic.
- Engine source.
- The auction / market / trust resolution logic.

## Determinism guarantee

The history collector reads gold/rank only; the summary is a pure function of `(history, events, finalStandings)`. No `Date.now`/`Math.random`. Same seed → identical recap. After implementing, run the determinism harness (`CHECK_DETERMINISM=1 npm run sim` across seeds `0xc0ffee/1/42`) — collecting history must not perturb sim outcomes.

## Acceptance

- `npm run typecheck` + `npm run test` green; new tests added.
- `npm run dev`: at day 100 the panel shows standings + a one-line arc per farmer + a run headline; same seed reproduces the same recap text.
- Determinism MATCHes across the three seeds.

## Workflow

Sonnet executor. Read this brief, then `EventFeedSystem` (read-only snoop + `BootedSim` accessor pattern), `BubbleSystem` (DAY_START subscription), [ui/leaderboard.ts](../../../../packages/farm-valley/src/ui/leaderboard.ts) (rank tie-break), and the `renderGameOver`/`createGameOverPanel` block in `main.ts`. Implement, typecheck, test, run determinism. Report files changed + test counts. Do not commit.
