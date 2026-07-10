# Brief 100 — Citadel economy-growth pass (the two-way loop's upside)

status: todo — **numbers settled 2026-07-10 (second grilling session); sequence after [brief 110](110-citadel-client-world-size.md).**
⚠️ **110 first (decision #26).** This brief's balance numbers are meaningless on a map that is about
to quadruple: #22 grows the solo world 96×96 → 192×192, which lengthens roads to clustered resources
and therefore changes every service-ratio this brief reads.
source: [todos/2026-06-22-citadel-two-way-service-economy.md](../../../todos/2026-06-22-citadel-two-way-service-economy.md) (scopes #1 and #3, explicitly deferred there "for a combined economy-growth pass so the same numbers aren't tuned twice") + the immigration overlap flagged in [todos/2026-06-22-citadel-playtest-findings.md](../../../todos/2026-06-22-citadel-playtest-findings.md).

## Settled targets (do not re-derive)

- **Production curve — ONE curve, not two mechanisms.** Extend Phase H's `bufferThrottleFactor` rather
  than adding a second term beside it: `0.6` floor below the 60% fill knee → `1.0` at the knee →
  ramping to **`1.25`** for a building on a sustained-service band. A thriving building outproduces a
  starved one by **`1.25 / 0.6 ≈ 2.08×`**.
- **Population target: 12–15** for a well-laid town, from today's ~9/12 oscillating at housing cap.
  Deliberately modest — the growth is a nudge that reads, not a transformation. If a 60-day headless
  run lands outside that band, tune the immigration trickle, not the production ceiling.
- **The cozy floor is untouched.** All of this sits *above* the 0.6 floor (decision #9). Nothing this
  brief adds may push a building below it, ever.

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
