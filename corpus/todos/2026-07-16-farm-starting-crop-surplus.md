---
title: "Farm — seed a small starting crop surplus so early peer trades have stock"
created: 2026-07-16
status: open
tags: [farm, sim, economy, peer-trades]
---

# Farm: starting crop surplus (1–2 sellable crops per farmer)

Give every farmer a small starting surplus of 1–2 sellable crops so `OFFER_CROP`
peer trades can close before the first harvests land.

## Why

Brief 70 proved early-game peer trades are gated by **encounter cadence + seller
stock, NOT gold**: it lifted the cash constraint (zero `would-breach-reserve`
declines) but the 15-day-close target stayed unmet because the binding constraint
is `no-stock` — nobody has anything to sell in days 1–15. This is the cheapest,
most surgical lever against the measured cause (chosen 2026-07-16 over raising
encounter frequency, which touches social cadence everywhere).

## Scope

- Seed each farmer's inventory at world-gen/spawn with 1–2 units of a sellable
  crop (per-personality or seeded-random variety via `Rng.fork` — deterministic).
- Do NOT touch encounter cadence or trade protocol logic.
- Balance guard: the surplus must be small enough not to distort the day-1 gold
  ordering or the g/AP economy baseline meaningfully.

## Acceptance

- On the 3 standard seeds, at least some peer crop trades close inside day 15 in
  a headless run (vs ~zero today).
- Multi-seed `EXPORT=json` diff reviewed — the change is visible in trade counts,
  not in a distorted wealth spread.
- Determinism check green.

## Diagnostic follow-up

If trades STILL don't close with stock present, the constraint is cadence-bound —
record that and close the early-trade question as "accepted" rather than pulling
the encounter-frequency lever unprompted.
