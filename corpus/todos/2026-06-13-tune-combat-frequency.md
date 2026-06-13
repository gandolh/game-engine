---
title: "Tune combat frequency + damage against a real run"
created: 2026-06-13
status: open
tags: [sim, combat, calibration, deferred]
---

# Tune combat frequency + damage/cooldowns

Deferred from the [combat foundation](2026-06-12-00-foundation-combat-subsystem.md)
(shipped 2026-06-13). The brief mandates: **instrument fights/day + AP-spent-fighting
in a real run and TUNE** — intended frequency is RARE DRAMA (a few notable fights per
100-day run), not a daily brawl loop. The current constants are reasoned guesses, not
measured.

## Constants to tune ([systems/combat/constants.ts](../../packages/sim-core/src/systems/combat/constants.ts))

- `FIST_DAMAGE` / `BAT_DAMAGE` ranges + `HEALTH_MAX` (health.ts) → bout length.
- `AP_PER_SWING` → fighting's opportunity cost vs farming.
- `swingIntervalTicks(ticksPerDay)` → watchable cadence at browser pace.
- `FIGHT_COOLDOWN_DAYS` (2), `DAILY_FIGHT_CAP` (2), `FIGHT_AP_RESERVE` (30 in social.ts),
  `STREET_FLEE_CHANCE` (0.04), `pursuitWindowTicks` → how often fights actually fire.
- `RIVAL_CUTOFF` interplay (see [calibrate-rival-cutoff](2026-06-13-calibrate-rival-cutoff.md)):
  fewer rivals → fewer fights. Tune these two together.

## Task

- Add lightweight instrumentation (count bouts/day + AP-spent-fighting; the
  `combat.result` bus message is the hook — EventFeed already could tally it).
- Run a short multi-seed pass, read the counts, tune toward ~a few fights per run.
- Document before/after.

## Constraints

- **Ask before any run** — constrained hardware; small `MAX_DAYS`, `ticksPerDay=20`,
  few seeds. (sim-resource-limits memory.)
- No determinism run required; combat RNG is tick-forked + seed-stable by construction.
- Watch the degenerate risk (daily-brawl collapse) flagged by the leader-runaway /
  peer-interaction memories — re-derive frequency from the real run, don't trust the
  design.
