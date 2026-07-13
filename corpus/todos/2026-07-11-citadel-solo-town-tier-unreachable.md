---
title: "Citadel P1 — solo cozy play cannot reach Town tier: pop equilibrates at 7–9 and wood income collapses once services staff"
created: 2026-07-11
status: open
tags: [citadel, sim, balance, gameplay, playtest, tiers, economy, p1]
---

# Solo cozy Town tier is unreachable — keep/garrison/raids are dead content in solo

**Finding type: balance (with a worker-assignment logic component). Priority P1** — it
gates [brief 103](../briefs/game/todo/103-citadel-challenge-mode.md)'s "challenge run
playable in a real browser" acceptance, and it means everything Town-locked (keep,
garrison, and therefore the entire raid/siege loop — including brief 113's now-visible
raid) is unreachable content on the solo path.

## Evidence (reproducible; live client, seed fixed `0x1a2b3c4d`, 1×, three runs)

Three scripted live-browser attempts (Playwright probe, 2026-07-11, evidence under the
git-ignored playtest scratch), each with a different placement strategy:

1. **17 buildings on day 0** (naive): pop oscillates 6–7 for **290 days**. ~14 worker
   slots over ~7 villagers dilutes the bread chain; wood pins at 23.
2. **Grow-mirror staging** (bread chain first): same equilibrium — pop 6–7 through
   **day 300**, tier Hamlet (placements silently lost to a probe bug, but see run 3).
3. **Staged + 3 woodcutters + cheap-first filler burst at pop 10**: pop reached 10 on
   day 42 ✓, filler burst (chapel/market/watchpost/healer/well) then **pulled workers out
   of the bread chain → pop sagged to 7–9 and stayed there through day 536**; wood pinned
   at **1** for 500 days (woodcutters never staffed again); stone accrued fine (quarry
   stayed staffed). Town's building path needs pop ≥ 10 **at the daily tier check** with
   ≥ 15 buildings — never true again after the burst.

**The headless counter-evidence is instructive:** the `sack` scenario "earns Town day 12
honestly" — but it **injects 5 wood + 2 stone per day** into the stockpile
([index.ts](../../tools/citadel-sim/src/index.ts), `injectWoodPerDay`). No uninjected
fixture anywhere reaches Town. `grow` (60d) tops out at pop 12 with 3 houses and makes no
tier claim.

## Root dynamic (verified against code, not guessed)

- Worker assignment is goods-before-services with **one slot per producer** (Phase H), so
  at pop ~9 the bread chain + woodcutters + quarry already exceed the workforce; every
  service placed steals a producer.
- `bufferServiceFactor` (brief 100) rewards well-*served* producers, but a chain running
  at half-staff never banks the surplus immigration needs, so pop and staffing deadlock
  at the 7–9 equilibrium.
- Wood is the binding resource for building past ~12 buildings, and wood income is the
  first thing the equilibrium sacrifices.

## Direction menu (needs a design decision, not just a number)

- **Population-scaled worker productivity or multi-slot at higher tiers** — let a small
  town run more buildings per villager as it matures.
- **Immigration re-tune** — the pop-10..20 band needs a reachable on-ramp; today the
  arrival factors stall exactly where Town's threshold sits.
- **Tier thresholds** — Town at `pop ≥ 20` or `15 buildings + pop ≥ 10 (sustained)` may
  simply be mis-set for the cozy solo curve; peak-pop rather than instantaneous pop for
  `minPopForBuildings` would have flipped run 3 on day 42.
- **Wood economy** — services consuming a worker *and* the wood needed to keep building
  is a double price; a staffed sawmill multiplying effective wood, or woodcutter output
  scaling with forest coverage, would decouple it.

## Acceptance

- A scripted live run (no injections, no dev pokes) reaches **Town tier and places a keep
  within ~60 in-game days** on the fixed seed, via a strategy a reasonable player would
  find.
- The `sack` scenario's injections become unnecessary for its first 15 days (or the
  injection is documented as a deliberate fixture crutch with this todo's resolution).
- Determinism MATCH ×3; baselines expected to move (say why in the closeout).
