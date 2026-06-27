---
title: "Citadel — two-way economy: production responds to whether output is collected/consumed (OpenTTD service loop)"
created: 2026-06-22
status: open
tags: [citadel, sim, gameplay, economy, openttd-influence]
source: "OpenTTD research, 2026-06-22"
---

# Citadel — two-way economy (production responds to service)

**OpenTTD-influence brief.** The defining loop of OpenTTD is that production is
**not fixed** — it reacts to how well the output is being moved. Transport >60% of
what an industry makes and it has a 67% chance to grow next period; >80% gives 83%;
under-serve it and it shrinks, and can close. Stations carry a **rating**, and
below 50% the waiting cargo literally decays away
([Cargo income](https://wiki.openttd.org/en/Manual/Game%20Mechanics/Cargo%20income),
[Production delivery](https://wiki.openttd.org/en/Manual/Production%20delivery)).
Distribution *is* the game.

## Why

Our economy is one-directional. A Citadel building produces into a shared pool
regardless of whether anyone collects/consumes it; the road network is mostly a
binary connectivity gate, not something you optimise. That removes the entire layer
OpenTTD is built on — and it's a root contributor to the **immigration deadlock /
death-spiral** (P0/P1 in
[2026-06-22-citadel-playtest-findings.md](2026-06-22-citadel-playtest-findings.md)):
the economy hits a flat break-even equilibrium with no graded signal the player can
read *before* collapse. A two-way loop turns "roads matter" from an assertion into
a mechanic and gives the player a dial to push.

## Scope (pick the smallest coherent set; all sim-side, re-prove determinism)

1. **Service-responsive production** — each production building tracks a rolling
   *service ratio* (output actually collected/consumed vs. produced) and nudges its
   own output rate up when well-served, down when chronically unserved. Mirror
   OpenTTD's banded probabilities rather than a hard on/off. Verify against the
   `production` system and building output in
   [games/citadel/sim-core/src/systems/](../../games/citadel/sim-core/src/systems/).
2. **Stockpile pressure** — an output that piles up uncollected (no road-connected
   consumer in range) stops growing or slowly spoils, instead of an infinite pool.
   This is the lever that makes layout/road quality pay off.
3. **Service-driven settlement growth (the upside loop)** — OpenTTD towns grow when
   served and stagnate when not; the payoff is "it bloomed because of what I built."
   Tie a *continuous* growth trickle to sustained service coverage rather than only
   the instantaneous pop/happiness thresholds in
   [tiers.ts](../../games/citadel/sim-core/src/systems/tiers.ts). This dovetails
   with the immigration rework already scoped in P0/P1 — coordinate, don't duplicate.

## Constraints

- **Determinism is load-bearing.** Any new randomness goes through
  `state.rng.fork(label)`; never `Math.random`/`Date.now`. Prove with the fast
  3-day / 3-seed `EXPORT=json` diff *and* a multi-seed behaviour diff (a determinism
  check only proves reproducibility, not behaviour-preservation).
- Keep it readable: the player must be able to *see* a building throttling
  (production rate / stockpile state) — pair with the coverage overlay in
  [2026-06-22-citadel-catchment-coverage-overlay.md](2026-06-22-citadel-catchment-coverage-overlay.md).
- Sim-only; transport-agnostic (runs identically in the Web Worker and the headless
  `npm run sim:citadel`).

## Acceptance

- A well-served building visibly produces more over time; a chronically unserved one
  throttles down rather than overflowing an infinite pool.
- A well-laid, well-served town grows; a poorly-connected one stagnates — and the
  difference is legible, not silent.
- Determinism holds across 3 seeds; a headless `grow` run shows the loop operating.

## Related

- Legibility half: [catchment-coverage-overlay](2026-06-22-citadel-catchment-coverage-overlay.md).
- Growth/immigration overlap: P0/P1 in
  [playtest-findings](2026-06-22-citadel-playtest-findings.md) (don't re-tune the
  same numbers twice — fold this growth signal into that rework).
