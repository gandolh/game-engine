---
title: "Farm — festival-day priority bump so farmers actually gather at the podium"
created: 2026-07-16
status: open
tags: [farm, sim, agents, festival]
---

# Farm: festival-day priority bump

On festival days, bump festival attendance priority in the `deliberate*` helpers
so attending outranks marginal chores (e.g. the last low-value watering trip).

## Why

The physical podium gathering is thin (open-questions "live-drama spare
capacity", festival brief 45): the event exists but farmers mostly keep doing
marginal field work, so the watch-it-play moment fizzles. Chosen 2026-07-16 over
relocating the festival — the venue is fine, the deliberation weight isn't.

## Scope

- In the shared deliberation layer, on festival days raise the festival-attend
  intention's priority above low-marginal-value work (define "marginal" against
  the existing valuation helpers, not a magic constant if avoidable).
- Personality-flavored is welcome (social personalities go earlier/stay longer)
  but the baseline bump applies to all — the podium should visibly populate.
- Sim-only; no render/UI changes required.

## Acceptance

- Headless run, 3 seeds: on festival days a clear majority of farmers are at the
  podium region during festival hours (assert via region occupancy in a test).
- Farm output dips on festival days only marginally (no economy cliff).
- Determinism green.
