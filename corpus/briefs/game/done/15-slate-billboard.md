# Game Task 15 — Slate Billboard

## Context

`ShopSlateSystem` generates a 5-offer daily slate at day-start and `ActSystem.buy-seed` consumes from it. The slate has real game-mechanical effect (limited stock, varying prices) but the player can't see it — it lives entirely in `shopkeeper.dailySlate` state.

## Goal

A small DOM panel visualizing today's slate: each offer shows `crop`, `unitPrice`, `remaining/quantity` (e.g. "3/5" indicating 3 sold, 2 left). Positioned visually near the shopkeeper (or anchored to a screen corner that doesn't fight the observer / leaderboard). Updates each render frame (cheap; the slate only changes on day-start, but the `remaining` decrements continuously).

## Files in scope (create + minimal wire-up)

- `packages/farm-valley/src/ui/slate-billboard.ts` (create) — `SlateBillboardPanel` class:
  - `constructor(parent: HTMLElement)` — creates a fixed-position panel
  - `update(slate: ReadonlyArray<{ offerId: string; crop: string; unitPrice: number; quantity: number; remaining: number }>)` — re-renders. Each offer is one row showing `[crop] [unitPrice]g · [remaining]/[quantity] left`. Use the same DOM-cache pattern as `observer.ts` to avoid churn.
  - `setVisible(v: boolean)` and `destroy()`
- `packages/farm-valley/src/ui/slate-billboard.test.ts` (create) — 3+ vitest cases: renders all rows; updates `remaining` without recreating row elements; hides cleanly when slate is empty
- `packages/farm-valley/src/ui/index.ts` — re-export `SlateBillboardPanel`
- `packages/farm-valley/src/main.ts` — instantiate the panel alongside the existing observer; on each render frame, look up the shopkeeper entity and read `shopkeeper.dailySlate`, pass it (or `[]`) to `panel.update(...)`

```ts
// In main.ts render loop:
const shopEntity = (() => { for (const s of world.query("shopkeeper")) return s; return null; })();
slateBillboard.update(shopEntity?.shopkeeper?.dailySlate ?? []);
```

## Files you must NOT touch

- All systems / agents / protocols / world
- `ui/observer.ts`, `ui/config-panel.ts`, `ui/dom.ts`, `ui/leaderboard.ts` (brief 12 owns leaderboard.ts in a parallel worktree)
- `sim-bootstrap.ts`, `world-setup.ts`, `components.ts`
- All engine source
- `screens/**`

## Coordination with concurrent briefs

- **Brief 12 (leaderboard)** also adds a new DOM panel. Pick a different corner so they don't visually fight. Suggest: leaderboard bottom-left; slate billboard bottom-right. If you both touch `ui/index.ts` for re-exports, the merge is trivially additive.
- **Brief 11 (focus-camera)** touches `main.ts` for camera/mouse listeners. You touch `main.ts` only to instantiate + update your panel. Should not conflict.
- **No render-systems.ts touch from you.** This is pure DOM.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (no regressions; new slate billboard tests added)
- `npm run dev`: a panel is visible from day 1, shows ~5 offer rows, and `remaining` ticks down as farmers buy seeds
- Panel does not overlap or visually fight the observer or leaderboard panels
- No `.js` import suffixes; no new runtime deps

## Workflow

Sonnet executor. Read brief → read `ui/observer.ts` for the cache pattern → read `agents/shop-slate.ts` for the `ShopOffer` shape → implement. Run typecheck + tests before reporting. Do not commit — orchestrator handles that.
