---
title: Citadel `sack` scenario fails again on main (keep never sacked by day 70)
created: 2026-07-15
status: closed (2026-07-15, `9651a57` — bisected to `c2caecc`; intentional balance change, horizon re-laid)
tags: [citadel, p1, regression, fixture]
---

# Citadel `sack` scenario fails again on main

`SCENARIO=sack npm run sim:citadel` on clean main (`c34469a`) prints FAIL and **exits 1**:
day 70 ends `keepPresent=true keepSacked=false gameOver=false threat=100 defense=19 tier=Town`.

Found 2026-07-15 while capturing byte-identity baselines for brief 116 (the runner split
preserved the failure byte-for-byte — this is **not** from the split).

## Context

- The fixture was rebuilt as a real playthrough on 2026-07-11 (`7c76522`/`36382d2`) and **passed**
  (sacked day 50, exit 0); status.md entries after that claim "sack still PASS" through Wave 3.5
  (`bbca1e9`). Something between `bbca1e9`-era and now regressed it — candidates: the Wave 3.5
  worker-allocation changes shifting the town's growth/defense timing, brief 103's decree
  re-pointing (`c2caecc`), or drift in raid pacing on the 192×192 map.
- Per the fixture's own epilogue: this is the ONLY end-to-end check of the sharp
  (`cozyThreats:false`) raid resolution — while it fails, the sharp path is unproven; do not
  sign off Challenge-mode raid work on top of it.
- `sharp-raid-path.test.ts` (reachability guard) is green, so the chain is *reachable* — the
  fixture's timeline just no longer produces a sack in 70 days (threat reaches 100, keep stands).

## Acceptance

- Bisect or reason to the regressing change; either fix the sim regression or (if the balance
  change was intentional) re-lay the fixture honestly (no tier poking, no pre-unlocks) so it
  sacks again; `sack` exits 0; document which it was in the log.

## Resolution (2026-07-15)

Bisected commit-by-commit over the sim-touching candidates: PASS at `bbca1e9` (Wave 3.5), PASS
at `658bbeb` and `f65112d`, **FAIL at `c2caecc`** (Wave 4 / brief 103 scope 2 — the commit whose
closeout consciously skipped the scenario gates). **Intentional balance change, not a sim bug:**
the re-pointed autonomous SHARP conscription adds ~floor(pop/2) defense to every arriving raid
(and the same commit's sharp-famine rationing raises the fixture town's pop to ~23), so
strength 20-45 arrivals moved from the weak band (85% sack) into the mid band (10% sack) —
decision #27 working as designed. The +5/raid escalation still wins: with `MAX_DAYS=110` the
keep is honestly sacked on **day 71** (was day 50). Fix: `SACK_MAX_DAYS` 70 → 90 (`9651a57`),
fixture layout untouched, header arithmetic re-documented. `SCENARIO=sack` exits 0 again.
