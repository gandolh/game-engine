# Game Task 12 — Live Leaderboard Panel

## Context

The day-100 leaderboard is the only place rankings are shown. The locked vision from the design interview calls for the leaderboard to be *ambient* — visible the whole time, updating each tick, so the player can glance at "who's #1 right now" without waiting for game over.

## Goal

A small panel showing all 4 farmers ranked by *current total value* (`gold + unsold value`), updated each render frame. Positioned in a corner that doesn't fight the observer panel.

## Files in scope (create + minimal wire-up)

- `packages/farm-valley/src/ui/leaderboard.ts` (create) — `LeaderboardPanel` class:
  - `constructor(parent: HTMLElement)` — creates a fixed-position panel (suggest: bottom-left, but choose where it least conflicts with the observer panel that's at top-right and the debug overlay at top-left)
  - `update(rows: LeaderboardRow[])` — re-renders. Each row shows: rank, name, personality (colored chip), total value (`gold + unsold`). Cache last text per cell to avoid DOM churn (mirror `observer.ts`'s pattern)
  - `setVisible(v: boolean)` and `destroy()` methods
- `packages/farm-valley/src/ui/leaderboard.test.ts` (create) — 3+ vitest cases: initial render shows 4 rows sorted by total desc; tied totals stable-sort by id; second `update()` with identical data does not thrash DOM; rank chips update when order flips
- `packages/farm-valley/src/ui/index.ts` — re-export `LeaderboardPanel` and `LeaderboardRow`
- `packages/farm-valley/src/main.ts` — instantiate `LeaderboardPanel` next to the existing `ObserverPanel` setup; on each render frame, build the row list (reuse the price table from `sim-bootstrap.ts`'s `SELL_PRICE` — re-export it from there if not already, or duplicate the small constant) and call `leaderboard.update(rows)`

```ts
// reference shape — pick the field names that fit your impl
export interface LeaderboardRow {
  rank: number;
  id: number;
  name: string;
  personality: string;
  gold: number;
  unsoldValue: number;
  totalValue: number;
}
```

The computation logic already exists at the bottom of `sim-bootstrap.ts` (`leaderboard(world)` function). You can either call that each frame or replicate its logic in a smaller function. Calling it directly is simplest; verify it's fast enough (it iterates all farmers each call, no allocation hot spots).

## Files you must NOT touch

- All systems / agents / protocols / world / engine source
- `ui/observer.ts`, `ui/config-panel.ts`, `ui/dom.ts`
- `screens/**`
- `sim-bootstrap.ts` — only if you need to re-export `SELL_PRICE`; otherwise leave alone and inline a copy in main.ts
- `components.ts`

## Coordination with concurrent briefs

- **Brief 11 (focus-camera)** will also touch `main.ts` (for camera state + mouse listeners). Your panel instantiation goes near the existing `ObserverPanel` setup line; their changes go in the runtime/event-loop area. Should not conflict in practice; if they do, the merge is mechanical (both are additive).
- **Brief 15 (slate-billboard)** also adds a new DOM panel; coordinate visually by picking different corners (suggest: leaderboard bottom-left, slate billboard near the shopkeeper sprite or bottom-right).

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (no regressions; new leaderboard tests added)
- `npm run dev`: a leaderboard panel is visible from day 1 onward, updates each frame, and the order changes as totals shift
- Panel does not overlap or visually fight the observer panel
- No `.js` import suffixes; no new runtime deps

## Workflow

Sonnet executor. Read brief → read existing `ui/observer.ts` for style/cache pattern → read `sim-bootstrap.ts`'s `leaderboard` function → implement. Run typecheck + tests before reporting. Do not commit.
