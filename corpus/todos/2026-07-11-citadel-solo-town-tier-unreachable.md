---
title: "Citadel P1 (CORRECTED) — the pop 6-7 equilibrium is an unrecoverable attractor: immigration hard-stops at zero bread surplus, so a missed opening locks the town forever"
created: 2026-07-11
status: open
tags: [citadel, sim, balance, gameplay, playtest, tiers, economy, immigration, p1]
---

# CORRECTED 2026-07-11 (same day): Town IS reachable — the real P1 is the unrecoverable deadlock

> **⚠️ The first version of this todo (committed `3ed2b6a`) claimed "solo cozy play cannot
> reach Town tier" with a wood-collapse / worker-stealing root cause. Headless diagnostics
> the same day proved that narrative wrong — it was three probe-harness bugs** (17-building
> day-0 dilution; woodcutters never sited on Forest terrain, so every one was silently
> rejected; the planner siting buildings on its own road carpet, also rejected). With those
> fixed, a drip-built town on the client's exact bootstrap flags (`seedTown`,
> `chargeBuildCost`, `{wood:40}` grant, defer 6, fixed seed `0x1a2b3c4d`) reaches **Town on
> day 28 and raises a keep on day 59**, then lives 250+ days at pop 11–14 under live cozy
> raids. Brief 113's closeout caveat and the status.md Wave-3 entry repeat the old claim —
> this todo and the status.md correction entry supersede them.

## The real finding (still P1): the low-pop equilibrium is an unrecoverable attractor

Reproduced headlessly (no injections), 250 days, same seed and flags:

- **Deadlock run**: second bread line placed from day 4 onward (one building/day as wood
  allows) → **pop pins at 6–7 for 250 days** with 23 buildings placed, 155 wood banked,
  grain piled to 510, flour 74, **bread permanently 0**. Only 6 buildings ever staffed.
- **Success run**: the *entire* second bread line (farm+bakery+mill) lands by day 2, inside
  the early window where the seeded bread stock (5) still produces surplus days → arrivals
  staff the second bakery before the equilibrium locks → pop 10 by day 28 → Town
  (buildings ≥ 15 + pop ≥ 10) → quarry → keep day 59.

**The loop that locks:** immigration is gated on positive bread surplus
([immigration.ts](../../games/citadel/sim-core/src/systems/immigration.ts) — `foodSurplus`
drives the roll); one staffed bakery feeds exactly ~6–7 mouths, so surplus is ~0; escaping
needs a second staffed bakery; staffing needs an arrival; an arrival needs surplus. Nothing
in the game breaks this cycle — not banked wood, not placed buildings (23 sat unstaffed),
not time (250 days). **A cozy game whose opening build order is a hidden one-shot with an
unrecoverable failure attractor contradicts the downside rule (#9: everything is a throttle
toward a floor, always recoverable — nothing ever fully stops). Immigration is currently a
hard stop.**

Secondary (P2, file-later material): **conversion cadence imbalance** — farms ≫ mills ≫
bakeries, so grain piles into the hundreds while bread reads 0. Pure waste, and it reads as
"my farms work, why is nobody fed?". A balance pass on mill/bakery cycle rates, not this fix.

## Decision (controller, 2026-07-11) — the smallest cozy-consistent fix

Apply the downside rule to immigration: **the arrival flow never fully halts — it throttles.**
When the surplus-gated roll is blocked (surplus ≤ 0) but the town could obviously use hands
— `population < popCap`, at least one *connected unstaffed* production building
(`hasFoundableBuilding` already exists), and the town is **not actively starving** (no
starvation-driven population loss within the last few days) — one settler still arrives every
`IMMIGRATION_TRICKLE_DAYS` (a deterministic day-count spacing, no new RNG stream). The
trickle is a floor, not a buff: towns with healthy surplus behave exactly as today.

**Hard constraints:**
- `SCENARIO=starve` must still end `gameOver=true` — starvation stays lethal; the trickle
  must not feed a dying town into immortality (the not-actively-starving condition is the
  gate, and it needs a red-before-fix test).
- No new RNG draws on any existing stream when the trickle does not fire; when it fires it
  uses a day-count check, not a roll. Determinism MATCH ×3; grow/sack baselines move only
  as documented (grow may move — say how).
- The deadlock fixture (the failed drip composition above) must **recover**: pop > 10 and a
  second bakery staffed within ~40 days of the trickle engaging.

## Acceptance

- A headless drip-run reproducing the deadlock composition escapes it and reaches Town
  without injections (regression fixture committed as a test).
- `starve` still exits `gameOver=true`; `sack` still PASSes; determinism MATCH ×3.
- The status.md / brief-113-caveat record is corrected (done in the same corpus pass).
