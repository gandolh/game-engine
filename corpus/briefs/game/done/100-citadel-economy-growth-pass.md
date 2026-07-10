# Brief 100 — Citadel economy-growth pass (the two-way loop's upside)

> ✅ **DONE 2026-07-10.** Browser-verified on a real WebGPU GPU. See **Closeout** at the bottom —
> the headline finding is that a *rounding change* nearly stole the credit for this brief's mechanic,
> and that the `starve` fixture had to be re-laid before it would starve again.

status: **done.** Numbers settled 2026-07-10 (second grilling session); sequenced after
[brief 110](110-citadel-client-world-size.md), which landed first as decision #26 required.
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

---

## Closeout (2026-07-10)

**What shipped.** One curve, as the brief demanded — `bufferServiceFactor(buffer, cap, serviceEma)`
*replaces* `bufferThrottleFactor` at the call site rather than multiplying beside it. Above the 0.6
fill knee it **is** the Phase-H throttle; below it, a producer whose rolling service EWMA clears the
`SERVICE_BONUS_BAND = 0.75` ramps to `PRODUCTIVITY_BONUS_CEIL = 1.25`. A backed-up buffer can never
earn a bonus (it is above the knee by definition) and a well-served one can never be throttled.
Spread thriving-vs-starved: `1.25 / 0.6 ≈ 2.08×`. The 0.6 floor is untouched; nothing returns 0.

Service coverage also re-weights the immigration roll (`arrivalFactor(happiness, townService)`),
taking `SERVICE_ARRIVAL_WEIGHT = 0.1` out of the roll's variable band rather than adding a second
growth source beside the bread gate. The band stays `0.7 .. 1.0` at every input — so happiness alone
can no longer reach certainty (`arrivalFactor(100, 0) === 0.9`); service carries the last 0.1.
Legibility: `BuildingSnapshot.wellServed` (render-only) drives a soft, slowly-breathing cream ground
pool under thriving producers — `wellServedGlowQuads` in `citadel-fx.ts`, stamped through the same
`pushLightPool` helper as the night light pool but ungated by `nightFactor`.

### The finding: a rounding change nearly took the credit

The in-progress implementation floored output **once**, at the end, carrying the fractional remainder
into the next cycle — across *every* multiplier (`base × season × hall × happiness × service`). Its
own comment justified this: producers emit 2–3 per cycle, so `floor(2 × 1.25) === 2` and the bonus
would round to nothing.

The premise is true; the scope was not. Measured on the 60-day headless `grow` run (three houses,
popCap 18, so population is food-limited rather than housing-capped):

| configuration | pop @ day 60 |
|---|---|
| `main` baseline | **9–10** |
| global carry, service bonus neutralized | **14** |
| global carry + service bonus (as written) | **15** |
| carry scoped to the service factor + bonus (**shipped**) | **12** |

The carry *alone* did the work; the mechanic this brief is about was worth a single villager on top.
It was also silently re-tuning the happiness throttle, the town-hall lift, and the seasonal grain
multiplier — three numbers set in a floor-per-step world. Scoped to the service factor, the bonus
still pays out (9–10 → 12, in the brief's 12–15 band), which **disproves the original justification**:
a global carry was never needed to make 1.25× mean 1.25×. When `bufferServiceFactor` returns exactly
1 — the common case — `outputRemainder` stays 0 and a building behaves bit-for-bit as it did before.

### Two bugs the tests would not have caught

1. **A starved converter read as perfectly served.** The service EWMA was sampled at the cycle timer,
   *above* the converter's input-draw guard. A bakery with no flour `continue`s there — but had already
   recorded an observation of `fill = 0`, because its buffer is empty precisely *because it never baked*.
   It climbed to `serviceEma ≈ 1.0` (measured), would have collected the 1.25× the moment flour returned,
   and would have lit the new render cue while starving. The EWMA is now folded in at the **emit**, so
   every `continue` between the timer and the emit is a cycle that earns nothing.
2. **The `starve` scenario stopped starving.** The economy got strong enough that a *connected* minimal
   town survives. Rather than re-fitting its food numbers, the fixture is now deliberately **badly laid
   out** — each producer at the end of a 16-tile spoke from the storehouse. Everything is connected
   (production requires it), but hauler round trips dominate the cycle, buffers back up, the EWMA never
   clears the band, and the throttle pulls output to the floor. It starves *because of how it was built*,
   which is the brief's whole thesis stated as a fixture. `sack` already failed to sack **before** this
   brief — pre-existing scenario drift, filed separately.

### Gates

Typecheck 0. **2108 tests** green across all ten workspaces (`+20` sim-core service-economy, `+7`
client fx cue). Citadel determinism **MATCH ×3** (seeds `0x1a2b3c4d` / `0xc0ffee` / `0x2a`, `grow`,
40 days, byte-identical stdout across paired runs). Headless `grow` 60d: **pop 12/18**, food-limited.
`starve` → `gameOver=true`; `siege`/`sack`/`fire`/`disease` behave as documented. Browser-verified
(real GPU, Playwright + system Chrome): 4 producers flagged `wellServed` (2 farms, 1 mill, 1 bakery),
**0 houses, 0 unstaffed, 0 roads** — and the cue was strengthened from a single ring at `alpha 0.1`
(invisible over the terracotta road carpet at default zoom) to a two-ring falloff at `0.18`, mirroring
`fireGlowQuads`.

**Baseline moved by design** — the contract is same-seed reproducibility, not equality to the old
numbers (`grow` 60d: `pop 9-10` → `pop 12`).
