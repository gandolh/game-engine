# Brief 100 — Citadel economy-growth pass (the two-way loop's upside)

status: todo
source: [todos/2026-06-22-citadel-two-way-service-economy.md](../../../todos/2026-06-22-citadel-two-way-service-economy.md) (scopes #1 and #3, explicitly deferred there "for a combined economy-growth pass so the same numbers aren't tuned twice") + the immigration overlap flagged in [todos/2026-06-22-citadel-playtest-findings.md](../../../todos/2026-06-22-citadel-playtest-findings.md).

## Why

The OpenTTD-style downside shipped (stockpile pressure, later softened by Phase H into the
buffer throttle — never halt). The **upside** never did: nothing rewards a *well-served*
building or a well-laid town beyond not-being-throttled. This is the largest remaining
tracked gameplay gap in Citadel: "it bloomed because of what I built" has no mechanic.

## Scope (one coordinated pass — do NOT tune immigration and growth separately)

1. **Service-responsive production**: each producer tracks a rolling service ratio (output
   drawn down vs produced — the buffer level is already the signal) and nudges output rate
   up when well-served, banded like OpenTTD rather than on/off. Interacts with Phase H's
   `bufferThrottleFactor` — design them as one curve (throttle below the knee, bonus above
   a sustained-service band), not two fighting mechanisms.
2. **Service-driven growth trickle**: sustained service coverage feeds a continuous
   immigration trickle alongside the existing bread-buffer gate ([immigration.ts](../../../../games/citadel/sim-core/src/systems/immigration.ts)) —
   a well-served town grows visibly; a poorly-connected one stagnates (never shrinks below
   the cozy floor — the downside rule, decision #9, still governs).
3. **Legibility**: the lift must be diegetic-readable (pair with the existing coverage
   overlay + per-house mood glow; a served producer could show a subtle activity cue).

## Constraints

- Cozy contract holds: upside-only on top of the ~60–70% floor; nothing new can spiral down.
- Determinism: all randomness via `state.rng.fork(label)`; sim-only, transport-agnostic.
- Respect the production model: output is per-building, workerCount is a binary gate — do
  NOT reintroduce per-worker scaling (settled premise).
- ⚠️ baseline moves by design; MATCH ×3 + a headless `grow` run demonstrating the loop.

## Acceptance

- A well-served building measurably outproduces a barely-served one over time; a well-laid
  town's population grows past where the current equilibrium sits; both legible in-game.
- Determinism MATCH ×3; sim-core tests green; [citadel-overview.md](../../../wiki/citadel-overview.md)
  updated; the source todo closed as done.
