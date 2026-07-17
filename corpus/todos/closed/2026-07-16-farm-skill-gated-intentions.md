---
title: "Farm — skill-gated intentions so personalities diversify beyond farming"
created: 2026-07-16
status: closed (2026-07-17, `4649bd1` — shared g/AP valuation; 10/10/9 leaners, no dominance)
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

## Resolution (2026-07-17)

New `agents/skill-valuation.ts`: every non-farm line scored in the economy model's g/AP unit,
DERIVED from the live tables + the act handlers' own skill curves (no agent-layer payoff
constants). Affinity from owned geography (stone vein → mining, bushes → foraging, else
deterministic name-hash); TEMPERAMENT diversify scalars (conservative 0.25 → opportunist 1.0 +
chase-best); commit rises with tier — the flywheel. Cadence through the ONE existing gather call
(gatherBias) + `deliberateSkilledNonFarm` excursions, replacing hardcoded per-personality
fishing/forage calls. Mining capped below farming as a support line. Evidence (probe-skill-diverge,
3×100d @1200 WASM): 10/10/9 of 21 lean non-farm, 19/20/15 distinct skill sheets, farming-focused
farmers hold #1 on every seed, leaners ≤2 of wealth top-5. 14 new tests; determinism byte-identical;
model recorded in [economy.md](../../wiki/economy.md). Moves the behavior baseline by design.
Tuning note: foraging is ~8 of 10 leans/seed, fishing rare — revisit weights if more fishing color
is wanted. (Chunk finished inline by the controller after two session-limit interruptions.)
