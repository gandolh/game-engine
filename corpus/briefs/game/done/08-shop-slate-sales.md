# Game Task 08 — Slate-Driven Shop Sales (Limited Daily Stock)

## Context

[Brief 06](../game/done/06-spatial-market.md) shipped `ShopSlateSystem` that generates a 5-offer slate at day-start (currently mixed buy/sell, ±20% off baseline). The slate is broadcast on `ONT_SHOP.DAILY_SLATE` but never read by `ShopkeeperSystem` — trades still use fixed prices, unlimited liquidity.

User design call (this session): the shop should accept all crop-sales (the farmer-sells-to-shop direction) at a fixed price with no limit (guaranteed liquidity floor), but seed-sales (the shop-sells-seeds-to-farmer direction) become **slate-driven with limited daily stock**. Peer-to-peer trades are variable-price (separate brief).

Naming note: in [protocols/shop.ts](../../../../packages/farm-valley/src/protocols/shop.ts), `ONT_SHOP.BUY` means **farmer sells crops to shop**, and `ONT_SHOP.SELL` means **shop sells seeds to farmer**. The naming reflects the farmer's perspective on what side of the trade they're initiating. Don't rename.

## Goal

- `ONT_SHOP.BUY` handler (farmer→shop crop sale): **unchanged**. Fixed prices, unlimited liquidity.
- `ONT_SHOP.SELL` handler (shop→farmer seed sale): **slate-driven**. Look up a matching offer in `shopkeeper.dailySlate` (correct crop, `remaining >= quantity`). Use that offer's `unitPrice`. Decrement `remaining`. If no matching offer or insufficient stock, reply with `CONFIRM` body containing a rejection (or a new `REJECTED` ontology — your call).
- `generateDailySlate` becomes **SELL-only** (5 entries, all `kind: 'sell'`). Drop the buy variant entirely.
- All existing tests stay green; the slate test asserts no `kind: 'buy'` survives.

## Files in scope

You'll likely modify these. The plan is yours to define precisely:

- `packages/farm-valley/src/agents/shop-slate.ts` — drop `kind: 'buy'` from `generateDailySlate`
- `packages/farm-valley/src/agents/shop-slate.test.ts` — adjust
- `packages/farm-valley/src/systems/shopkeeper.ts` — SELL handler reads from slate
- `packages/farm-valley/src/systems/shopkeeper.test.ts` — new cases for slate-driven SELL, sold-out rejection
- Possibly `packages/farm-valley/src/components.ts` for typing `Shopkeeper.dailySlate` more strictly if useful

## Must NOT touch

- `packages/engine/**`
- `packages/farm-valley/src/agents/{conservative,aggressive,hoarder,opportunist}.ts` — personality changes are out of scope; current SELL request shape continues to work
- `packages/farm-valley/src/systems/encounter.ts`, `systems/travel.ts`, `systems/market.ts`, `systems/day-clock.ts`
- `packages/farm-valley/src/protocols/encounter.ts`, `protocols/travel.ts`
- `packages/farm-valley/src/world/**`
- `main.ts`, `sim-bootstrap.ts`, `world-setup.ts`
- `tools/**`

## Open question I'll defer to you

What happens when `ONT_SHOP.SELL` request quantity > a single matching offer's `remaining`, but the cumulative remaining across multiple matching offers covers it? Two reasonable options — pick one in your plan and document it: (a) one offer per request, reject if no single offer covers it; (b) consume across multiple offers in order (cheapest first benefits the farmer).

## Workflow

1. Read the brief + the relevant code (`shopkeeper.ts`, `shop-slate.ts`, `protocols/shop.ts`).
2. Write a concrete implementation plan as a markdown file at `corpus/briefs/game/todo/08-shop-slate-sales-plan.md` (file paths, exact diffs/pseudocode, test cases).
3. Dispatch ONE sonnet subagent to execute the plan — give it the plan and the same scope/no-touch list.
4. Verify the sonnet's work: `npm run typecheck -w farm-valley` and `npm run test -w farm-valley` both pass.
5. Report back with a summary.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (no regressions; new tests added)
- A 100-day `npm run sim` headless run still completes (no infinite loops, no unhandled errors). Skip this check if `run-sim` isn't trivially runnable in your environment.
- No `.js` import suffixes; no new runtime deps
