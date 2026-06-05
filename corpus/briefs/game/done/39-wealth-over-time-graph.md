# Game Task 39 — Wealth-Over-Time Competition Graph

## Context

For a competition watcher, the single highest-value data visualization is a **score-over-time line graph** (Game Developer "Data Visualization in Games: Leaderboards"; CK3 observer-mode leaderboard panel). It does what a live leaderboard cannot: it shows **momentum and crossings**. A farmer at rank 3 who is *rising* creates different tension than one at rank 1 who is *falling* — and the moment two lines cross (an overtake) is a dramatic beat the viewer can see coming. Farm Valley has a live [leaderboard](../../../../packages/farm-valley/src/ui/leaderboard.ts) (instantaneous standings) but **no history view** — you can't see *how* the standings got here.

This brief is small if brief 36 (`RunHistorySystem`) is merged, because the per-day `{ day, farmerId, gold, rank }` series already exists. If 36 is not merged, this brief carries the minimal collector itself.

## Goal

1. **A wealth-over-time line chart** — one line per farmer, color-coded by personality (reuse `ui/colors.ts` personality colors), X = day (0→maxDays), Y = gold. Rendered on a small canvas or via DOM/SVG in the right column (or a toggleable overlay — keep it out of the way; this is glanceable context, not the main view).
2. **Mark crossings** — where two lines cross (an overtake), draw a small marker; these align with brief 38's rank-change events.
3. **Live update** — redraws as the run progresses (per render frame or per in-game day; per-day is plenty and cheaper).
4. **Final-frame readability** — at game-over the graph is the run's shape at a glance; it belongs on/near the recap panel (brief 36) as a shareable artifact.

## Design decisions

- **Reuse brief 36's `RunHistorySystem` series** if present (read `client.runHistory` off the snapshot). If 36 is not merged, add the same minimal per-`DAY_START` collector here (one row per farmer per day; deterministic rank tie-break gold desc → id asc) — but prefer ordering this brief *after* 36 so it's a pure consumer.
- **Render with Canvas2D or inline SVG**, EDG palette only (the palette guard test scans all source — no off-palette literals). Personality line colors must come from the existing `ui/colors.ts` mapping.
- **Pure draw from snapshot data** — the chart is a reflection of the history series; no sim coupling, no determinism surface of its own (render-only).
- **Keep it cheap** — 100 days × 5 farmers is tiny; redraw per in-game day (detect day change from the snapshot), not per animation frame.

## Files in scope

- `packages/farm-valley/src/ui/wealth-graph.ts` — NEW: a panel that draws the multi-line chart from the history series (EDG colors, personality mapping from `ui/colors.ts`).
- `packages/farm-valley/src/ui/wealth-graph.test.ts` — NEW: given a history series, the chart computes the right point coordinates / detects a crossing (test the pure layout math, not pixels).
- `packages/farm-valley/src/ui/index.ts` + `ui/right-column.ts` — export + slot it (respect the brief-25 flex container; consider a collapse toggle so it doesn't crowd the observer + feed + matrix).
- `packages/farm-valley/src/worker/snapshot.ts` + `snapshot-builder.ts` — carry the history series on the snapshot if not already done by brief 36.
- `packages/farm-valley/src/worker/sim-client.ts` — `runHistory` getter if not already present.
- `packages/farm-valley/src/main.ts` — construct + `update()` the graph from `onRender`; optionally embed a copy in the game-over/recap panel.

## Files you must NOT touch

- `agents/**`, sim resolution logic.
- Engine source (use the existing `Canvas2dRenderer` only if drawing on the main canvas; a separate small canvas/SVG element is cleaner and avoids touching the engine).

## Determinism guarantee

Render-only. The underlying series is deterministic (it derives from per-day gold). No new sim state. If this brief adds the collector (36 not merged), run `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42`.

## Acceptance

- `npm run typecheck` + `npm run test` green; the palette guard test still passes (EDG-only colors).
- `npm run dev`: a live wealth-over-time graph with one line per farmer, crossings marked; readable at game-over.

## Workflow

Sonnet executor. Best sequenced **after** brief 36 (consumes its history series). Read `RunHistorySystem` (brief 36) or `ui/leaderboard.ts` for the rank source, `ui/colors.ts` for personality colors, and one `ui/*` panel for the DOM pattern. Implement, typecheck, test. Report files changed + test counts. Do not commit.
