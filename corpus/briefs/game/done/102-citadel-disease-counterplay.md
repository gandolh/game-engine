# Brief 102 — Citadel disease counterplay (playtest P3, the last untouched finding)

status: todo
source: [todos/2026-06-22-citadel-playtest-findings.md](../../../todos/closed/2026-06-22-citadel-playtest-findings.md) §P3 — the only finding from that pass never addressed.

## Problem

Disease has no proactive lever: a healer exists (reactive coverage) but the player can't do
anything to *prevent* or *respond to* an outbreak beyond already-having a healer in range.
Under the cozy rules (Phase D: disease slows, always recovers, never kills) the dip is
recoverable by design — but it's also unengaging: nothing to decide, nothing to build.

## Decision (controller, 2026-07-11 — the smallest cozy-consistent set, grounded in disease-system.ts)

What already exists and stays: crowding (`pop/houseCount`) and low happiness drive onset; a
healer near any home already cuts onset ×0.25, spread ×0.3, and speeds recovery (plus the cozy
guaranteed floor). What's missing is a *placement* lever and any legibility.

1. **Prevention = well coverage (BUILD).** The fraction of homes whose centre lies inside any
   well's coverage rect (`WELL_COVERAGE` in entities/building.ts — already the single source of
   truth for fire + the client overlay) multiplies onset:
   `onsetChance *= 1 - 0.5 * coveredFraction`. No new RNG draw, no draw reordering — a town
   with no wells is **byte-identical** (multiplier 1). Applies on BOTH cozy and sharp paths
   (Challenge inherits the counterplay); the `sack` fixture places no wells, so sharp stays
   byte-identical — prove it.
2. **Response legibility = healer visibility (BUILD).** When an outbreak starts or ends with a
   healer in range, the event copy says so (e.g. "…the healer is tending the sick" / "…thanks
   to the healer") — cozy-toned under cozy, sharp strings only appended-to (defer-threats.test
   greps "disease outbreak"; keep that substring intact on the sharp path).
3. **Placement-time legibility (BUILD, client).** The well's building-info/inspect panel gains
   a "fewer sick days for covered homes (N homes covered)" row; the healer's coverage row says
   what it actually does. The coverage ring/overlay already draws the well rect — no new render.
4. **Spatial crowding (houses-per-area) — CUT.** The existing pop/house crowding is already a
   player lever (build more homes); spatializing it re-tunes every baseline for a second
   prevention knob the acceptance doesn't need.
5. **"Boil water" one-shot town response — CUT.** It's a decree-shaped lever; the decree channel
   was deliberately purged in Phase G (#8 autonomy). No new command surface.

## Direction (pick the smallest cozy-consistent set at session start)

- **Prevention levers**: e.g. well coverage reduces onset chance (wells already speed fire
  recovery — a natural sibling); crowding (houses per area) raises it, rewarding breathing
  room in layout. Both are placement puzzles, on-theme with decision #10 (terrain/placement
  IS the puzzle).
- **Response lever**: a staffed healer shortens an active outbreak visibly (if not already
  true, make the effect legible); possibly a one-shot "boil water" style town response with
  a real cost, if a lever beyond placement is wanted.
- **Legibility**: outbreak + recovery progress must read diegetically (the mood/dim system
  from Phase A is the channel), and the prevention effect must be visible at placement time
  (coverage ring precedent).

## Constraints

- Cozy contract: disease still never kills; all effects are throttles toward the floor.
- Deterministic: onset/recovery draws stay in their existing forked streams; new gates must
  short-circuit BEFORE any RNG draw when disabled (the defer-threats precedent) so existing
  baselines only move where intended. ⚠️ baseline moves by design where levers bite.

## Acceptance

- A player can point at something they built/placed and say "that's why the outbreak was
  short/never happened"; verified in a live playtest (playtest-citadel) not just tests.
- sim-core tests green; determinism MATCH ×3; source todo's P3 closed.

## Closeout (2026-07-11, `c22145e`)

Shipped as Wave-3 chunks A (sim) + C (client copy), both junior/Sonnet. The well multiplier
landed exactly as decided (`onsetChance *= 1 - 0.5 * coveredFraction`, IEEE754-exact no-op at
zero coverage, one onset draw per day proven by an rng-state-stride test); healer copy on all
four start/end branches with the sharp `disease outbreak` substring intact. 11 new tests in
`disease-counterplay.test.ts` (empirical onset-rate halving over 1000 trials, draw-count
guard, zero-wells bit-identity). Byte-identity vs pre-wave HEAD held on all six headless
scenarios except one by-design text-only string (`sack`'s day-22 outbreak toast gained
" A healer is nearby." — its fixture has a healer). **Browser-verified**: the well inspect
panel shows "Covered homes also fall sick less often", the healer's shows "Homes in reach
see fewer outbreaks, and the sick recover sooner", and a live cozy outbreak fired on-screen
("1 villager(s) are under the weather" + hazard HUD "Disease: 1 sick!"). Acceptance's
"outbreak was short / never happened" pointing is the well ring + copy at placement time;
the mechanic's magnitude is pinned by tests, not eyeballs.
