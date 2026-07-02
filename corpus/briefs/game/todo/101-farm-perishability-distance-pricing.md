# Brief 101 — Farm perishability + distance pricing

status: todo (large, balance-sensitive — needs a focused reviewed session, NOT autonomous execution; the source todo records why it was deliberately not auto-shipped)
source: [todos/2026-06-22-farm-perishability-distance-pricing.md](../../../todos/2026-06-22-farm-perishability-distance-pricing.md) — the full scope/constraints/acceptance live there and remain the spec; this brief adds the execution plan skeleton.

## Summary

Give Farm Valley OpenTTD's missing dimension: freshness decay on harvested goods + distance
pay on harbor contracts, so *when* you sell and *where* you ship become decisions and the
archipelago/boat infrastructure earns its keep.

## Execution plan skeleton (fill at session start after re-grounding in code)

1. **Inventory time dimension** — `bankHarvest`/`bankProduct`/`bankFruit`
   ([economy/helpers.ts](../../../../games/farm/sim-core/src/economy/helpers.ts)) gain a
   harvest-day stamp (bucketed per day, not per item, to keep the model small). Decay is a
   pure function of (harvestDay, currentDay) — no RNG.
2. **Pricing** — freshness multiplier composes with the quality multiplier at every sale
   path (shopkeeper, product, fruit, encounter trades, harbor); distance factor on harbor
   contract payout (the multiplier band exists — make route distance a term).
3. **Economy re-run** — re-derive the g/AP scoring table in [wiki/economy.md](../../../wiki/economy.md)
   with the new factors so no crop/route dominates; document the moved baseline there.
4. **BDI integration (the main cost)** — all four personalities' `deliberate*` sell/ship
   helpers must react (sell-before-stale, ship-far-only-when-fresh-enough); without this the
   sim looks dumb. Budget roughly half the session here.
5. **Legibility** — freshness tell on the hover/inspect card.

## Gates

Typecheck/tests green; determinism MATCH ×3 at 20 and 1200 ticks/day; multi-seed headless
runs show personalities making sensible sell-now-vs-ship-far calls; economy.md updated;
⚠️ baseline moves by design.
