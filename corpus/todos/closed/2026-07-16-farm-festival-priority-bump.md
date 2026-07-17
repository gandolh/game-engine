---
title: "Farm — festival-day priority bump so farmers actually gather at the podium"
created: 2026-07-16
status: closed — PARTIAL (2026-07-17, `bbf6e43` — 3 deliberation bugs fixed; majority attendance blocked by world geography)
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

## Resolution (2026-07-17)

Three real bugs diagnosed via live decisionTrace reads and fixed: (1) a copy-pasted `ap<40`
gate though travel costs 0 AP; (2) festival/tavern both at -2 with a stable sort and tavern always
called first — tavern silently won every tie; (3) `deliberateSleep`'s head-home pull evicted podium
arrivals the same tick. Fixes: gate removed, FESTIVAL_TEMPERAMENT dry-tolerance,
FESTIVAL_FRONT_PRIORITY=-2 called before tavern (NOT -3 — regresses committed skill excursions,
verified), `isLingeringAtFestival` guard (social types linger to evening). Non-festival days
unchanged by construction; determinism green. **Acceptance NOT met and cannot be from the
deliberation layer**: farms sit 200+ tiles from the podium at 8 ticks/tile vs a 1200-tick day (a
traced farmer converged 152→24 tiles in a full day without arriving). The todo's adjudicated
premise "the venue is fine, the deliberation weight isn't" is contradicted by measurement —
reopened as an Open design question ([open-questions.md](../../wiki/open-questions.md)): venue
location vs travel speed vs multi-day festival. probe-festival.ts kept as the evidence tool.
