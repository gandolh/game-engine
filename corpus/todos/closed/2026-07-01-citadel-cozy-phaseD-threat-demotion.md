---
title: "Citadel cozy pivot — Phase D: demote threats to recoverable happiness dips (freeze the bite)"
created: 2026-07-01
status: done
tags: [citadel, cozy-pivot, phase-d, threats, gameplay]
---

> **✅ SHIPPED 2026-07-01.** Freeze mechanism = `cozyThreats` bootstrap option (default ON).
> Fire extinguishes-not-razes, disease recovers-not-kills, raids pilfer-not-sack, winter
> grain floored 0.5. Gates: sim-core 205/205, typecheck-clean, determinism MATCH ×3
> (baseline moved by design). See [log.md](../log.md). Built via plan-split-dispatch with
> executor chunks on Sonnet 5.
---

# Phase D — demote threats to cozy texture; freeze the bite

Implements cozy-pivot decisions #4/#5/#6 from the
[build order](2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md). Phase B already built the
happiness→productivity floor (`productivityFactor(h)` in
[production.ts](../../games/citadel/sim-core/src/systems/production.ts), reading the local
worker's home-house `mood`). Phase D re-points the four threats through **that one channel**
(a radius-local happiness dip) instead of destroying/killing/sacking, and **freezes** the
destructive machinery behind a flag so a future Challenge mode is a re-wire, not a rebuild.

## Freeze mechanism (decided 2026-07-01): `cozyThreats` bootstrap flag, default ON

Follow the existing opt-in-flag pattern (`enforceTerritory`, `chargeBuildCost`) in
[sim-bootstrap.ts](../../games/citadel/sim-core/src/sim-bootstrap.ts):

- Add `cozyThreats?: boolean` to `CitadelSimOptions`, **default `true`**.
- Thread it into `FireSystem`, `DiseaseSystem`, `SiegeResolutionSystem` constructors
  (an options arg, e.g. `{ cozy }`). `cozy === true` → cozy behavior (below);
  `cozy === false` → **today's exact destructive behavior, byte-identical**.
- The client bootstrap ([sim-worker.ts](../../games/citadel/client/src/worker/sim-worker.ts))
  already passes `chargeBuildCost:true` — leave it; cozy is the default so it needs no change.
  (Optionally set it explicitly for clarity.)
- The `@citadel/server` MP bootstrap + the headless tool default to cozy too (default ON).
  A future Challenge/MP mode passes `cozyThreats:false`.

## The cozy behaviors (`cozyThreats === true`)

**Channel:** all four feed a **radius-local mood dip** — houses within the cure's service
reach of the event have their mood dented. The dip recovers on its own via the Phase B
asymmetric ease (recover 0.45 > decay 0.30) once the cause is handled. Dent radius ≈ the
cure's reach (fire ≈ well, disease ≈ healer) so the shipped coverage overlays double as
trouble maps.

> **As-built note (2026-07-01):** the dent is a **flat per-day subtraction from the stored
> mood** (fire runs in the `hazards` stage, *after* `needs` eases mood toward its target), not
> a target-side dip. Net effect is the same shape — an active fire compounds a small dip each
> day (clamped ≥0), which fully re-eases to target once the fire is out — and it's simpler +
> pinned by tests. Recorded here so the prose above and the code (`_dentNearbyMood`) agree.

- **Fire:** smoulders and **dents local happiness**; a well in range puts it out faster;
  **never razes** (no `_destroyBuilding`, no popCap loss). A burning building still suppresses
  its own + neighbour output *while burning* (that's the throttle), but the building survives
  and resumes.
- **Disease:** a villager is "under the weather" (slower / contributes less) for a few days and
  **recovers on its own**, faster with a Healer in range; **never kills** (no
  `removeOneVillager`). Healer's value = *visibly faster recovery*.
- **Raids:** raiders pass through, **pilfer some stockpiled goods** (regenerating resource —
  cozy contract #4 permits taking *goods*, never *placed things*), and leave; walls/gate/
  watchpost reduce the theft; **no building or villager ever lost**, `keepSacked`/`gameOver`
  never set by a raid.
- **Winter:** grain floored **~×0.5, never 0** — one-line change in
  [seasons.ts:32](../../games/citadel/sim-core/src/world/seasons.ts#L32)
  `grainMultiplier("winter")` `0.0 → 0.5` (spring is already `0.5` — precedent in the same
  function). NOTE: this one is unconditional (not flag-gated) — a 0.5 winter floor is harmless
  in sharp mode too and Phase H owns the broader winter/economy retune. Confirm no test asserts
  exactly `0.0`.

## Acceptance

- A town hit by any threat visibly **slows** (glum houses, dipped output) then **recovers on
  its own** once the cause is handled — never spirals, never loses a placed building/villager,
  never `gameOver` from a threat (cozy mode).
- `cozyThreats:false` reproduces today's destructive behavior byte-identically.
- Determinism **re-proved across 3 seeds** (baseline moves by design for the cozy path — log
  it). Sharp-path determinism unchanged.
- Gates: `npm run typecheck` clean; `npm run test -w @citadel/sim-core` green.

## Test strategy

The destructive-behavior tests (`phase45.test.ts` fire-destroys/disease-kills, `phase4.test.ts`
+ `phase5.test.ts` siege-sack/gameOver, relevant `gameplay-depth.test.ts` cases) assert the
SHARP behavior → have them bootstrap with `cozyThreats:false` so they keep proving the frozen
path. Add NEW cozy tests: fire dents mood but the building survives + resumes; disease slows
then recovers with pop intact; a raid pilfers goods but leaves buildings/pop/keep intact;
winter grain > 0.

## Determinism note
Every mutation stays seeded (no `Math.random`/wall-clock). The mood-dip is pure arithmetic on
existing per-house `mood`. Re-run `CHECK_DETERMINISM=1 npm run sim:citadel` (or the 3-seed
fast diff) and record the new cozy baseline in log.md.
