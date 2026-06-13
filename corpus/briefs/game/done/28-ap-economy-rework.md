# Game Task 28 — AP Economy Rework (3c)

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Make AP the genuine per-day budget: a growing daily ceiling gated by sleep, a costed action table, friend discounts on trades, and a bug fix for `sell-from-wall` silently costing 0.

## What shipped

- `packages/farm-valley/src/systems/ap.ts` — new `AP_COST` table; `sell-from-wall` bug fixed (now costs 3, not silent 0); friend-discount lookup on trade-init; `maxAP(day) = 100 + 2 × (day − 1)` ceiling function.
- AP refill moved from `FinishDaySystem` onto the sleep handler (coordinated with brief 27); unrested farmers (caught away at nightfall) wake with `floor(maxAP(day) / 2)`.
- `packages/farm-valley/src/world/world-setup.ts` — initial AP = 100 (`maxAP(1)`).
- `packages/farm-valley/src/components.ts` — preferred-gift list per farmer; unrested/growing-ceiling fields (if not already added by brief 27).
- Action cost table: travel 0, plant 1, water 1, sell 3, trade-init 3 base (friend discount: trust ≥ 0.7 → 1 AP, ≥ 0.5 → 2 AP, < 0.5 → 3 AP), gift 1, auction entry 2, auction bid 0.
- Preferred-gift lists: gifting a preferred item yields a larger trust boost; golden bean (brief 24) universally high-value; other items depend on receiver preference.
- Deliberation budgets against new costs; "why" panel reasons cite friend discounts and gift preferences.
- Depends on brief 27 (intra-day timeline + unrested signal + sleep refill point).
