---
title: "Farm — skill-gated intentions so personalities diversify beyond farming"
created: 2026-07-16
status: open
tags: [farm, sim, agents, skills]
---

# Farm: skill-gated intentions

Make higher non-farm skill tiers unlock better payoffs so AI personalities
diversify into fishing/foraging/mining instead of all-farming-all-the-time.

## Why

Skills are lopsided toward farming (open-questions "live-drama spare capacity"):
the skill system exists but nothing in the deliberation layer makes a high
fishing/mining tier *worth pursuing*, so every farmer's skill sheet converges.
Chosen 2026-07-16 over a pure XP-rate rebalance — the intent is behavioral
diversity, not faster numbers.

## Scope (the big one of the 2026-07-16 batch — touches all `deliberate*` helpers)

- Give non-farm activities a skill-tier payoff curve worth chasing (e.g. higher
  fishing tier → better fish odds/value; mining tier → richer stone/ore yield),
  so the marginal g/AP of a skilled non-farm action can beat marginal farming.
- Thread skill-tier awareness into the shared `deliberate*` helpers /
  `bean-valuation` style scoring so personalities weight it per temperament
  (e.g. opportunist chases the best marginal activity, conservative sticks to
  farming longer). Every personality file must at least consume the shared
  helper — no personality left reading stale valuations.
- Keep the economy model honest: re-check the g/AP spread so a non-farm path is
  viable but doesn't dominate (no "everyone becomes a fisherman" flip).

## Acceptance

- Headless 100-day run, 3 seeds: skill sheets visibly diverge across farmers
  (not all farming-max); at least one farmer per run leans into a non-farm line.
- No single activity dominates the wealth ordering across all seeds.
- Multi-seed EXPORT=json diffs reviewed; determinism green; economy.md updated.

## Constraints

- All randomness via `Rng.fork`. This is balance-sensitive — do NOT auto-tune
  numbers without recording the before/after model in the economy page.
