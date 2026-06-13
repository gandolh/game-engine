---
title: "Calibrate the rival cutoff against a multi-seed run"
created: 2026-06-13
status: wontdo
closed: 2026-06-13
tags: [sim, relationships, calibration, deferred]
---

# Calibrate the rival cutoff (RIVAL_CUTOFF)

Deferred from the [relationship-axis foundation](2026-06-12-00-foundation-relationship-axis.md)
(shipped 2026-06-13). The unified axis labels a rivalry when directional trust
`< RIVAL_CUTOFF` (currently **0.25**, a guess). The old monotonic accumulator
(`RIVALRY_THRESHOLD=3` adverse events) preserved ~2–5 rivalries per 100-day run;
a trust cutoff does **not** map 1:1 to that, so 0.25 is unverified.

## Task

- Run a multi-seed pass (`EXPORT=json`, a few seeds) and count active rivalries
  per 100-day run with the current cutoff.
- Tune `RIVAL_CUTOFF` (and possibly `RIVAL_REARM`) in
  [systems/rivalry/types.ts](../../packages/sim-core/src/systems/rivalry/types.ts)
  to land back at ~2–5 named rivalries per run.
- Document the before/after counts.

## Constraints

- **Ask before any run** — constrained hardware; keep `MAX_DAYS`/seeds small,
  `ticksPerDay=20`. (See the sim-resource-limits memory.)
- Determinism is unaffected (cutoff is a pure read of `trust`); this is a *tuning*
  task, not a correctness one.
- `RIVAL_REARM` must stay `> RIVAL_CUTOFF` (hysteresis invariant).
