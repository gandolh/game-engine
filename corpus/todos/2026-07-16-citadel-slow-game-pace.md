---
title: "Citadel — slow the default pace so a day feels like Farm Valley's"
created: 2026-07-16
status: open
tags: [citadel, sim, pacing, ux]
---

# Citadel: slow the game pace to Farm Valley's feel

At 1× Citadel burns through days far too fast — during the 2026-07-16 browser
verification a cozy town went Day 16 → Day 135 in roughly two minutes of wall
clock (~1 day/second). Farm Valley's day is dramatically longer and reads as a
watchable rhythm. Bring Citadel's 1× day-length into the same feel ballpark.

## The trap to respect (read before touching)

There are two different levers and they are NOT interchangeable:
- **Wall-clock ms per tick** (snapshot pacing, `1000/(20·speed)` today) — render
  pacing only, sim-safe, but slowing only this makes everything (walkers, fires)
  move in slow motion, not "longer days".
- **Ticks per day** (day-clock system) — the real "longer day" lever, but it
  changes sim semantics: every per-day rate (production cycles/day, consumption,
  raid cadence, disease, growth) is re-denominated. This is a BALANCE change,
  not a pacing knob, and needs the scenario gates re-run (`sack`, `starve`,
  determinism ×3) plus a look at whether per-tick rates need rescaling to keep
  per-day outcomes equivalent.

Likely right shape: raise ticks-per-day toward a Farm-like day length while
rescaling per-tick rates so per-DAY outcomes stay roughly invariant; keep the
1×/2×/4× speed controls meaning what they mean today.

## Acceptance

- At 1×, a Citadel in-game day lasts in the same order of magnitude as Farm
  Valley's (state the measured before/after seconds/day in the closeout).
- Per-day sim outcomes (production/day, consumption/day, raid cadence in days)
  stay roughly equivalent — prove with headless before/after runs, not vibes.
- `SCENARIO=sack` and `starve` still exit 0; `npm run sim:citadel` determinism
  unchanged; walkers still glide (render-delay buffer keeps working at the new
  cadence — check `snapshotIntervalMs` assumptions in entity-interp/sim-client).
- MP + save/load unaffected (tick counts in saves still line up).
