# audit-15 — Citadel's fire system full-scans the world per burning building, every tick

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Cheap because the index it needs already exists.

## The defect

`_tickBurning` runs every tick and, in cozy mode, calls `_hasWellNear` per burning building
([fire-system.ts:302](../../../games/citadel/sim-core/src/systems/fire-system.ts#L302)):

```ts
if (this.cozy && this._hasWellNear(p, bcx, bcy)) decay += COZY_WELL_EXTINGUISH_BONUS;
```

`_hasWellNear` ([:530-541](../../../games/citadel/sim-core/src/systems/fire-system.ts#L530-L541)) is a full
`buildingWorld.query("building")` linear scan. `_entityById` ([:543-548](../../../games/citadel/sim-core/src/systems/fire-system.ts#L543-L548))
is likewise O(B) and is called per burning id from `_spreadFire` and every `_extinguishBuilding`.

The system **already has** `_buildDailyIndex` / `FireDailyIndex` built for exactly this purpose.

## Failure scenario

A cozy solo town with a fire cluster (spread reaches a 3-tile Manhattan radius, so 5-10 simultaneous
fires are normal). `_tickBurning` already walks all B entities once per player plus a second time for the
suppression interlock; the well check adds one more full B scan **per burning building**, each with a
pooled-array copy. At B ≈ 800 and 8 fires that is ~6,400 extra entity iterations per tick, sustained for
the whole `BURN_TICKS` window. Zero cost when nothing burns — which is why it has gone unnoticed.

## Fix sketch

Add a well-centre list and an id→entity map to `FireDailyIndex`, built once per day by the existing
`_buildDailyIndex`, and read both from `_tickBurning` / `_spreadFire` / `_extinguishBuilding`.

Careful: a **daily** index must handle wells built or destroyed mid-day. Either invalidate on
placement/destroy or accept a documented one-day staleness — decide explicitly and write down which,
because "a well you just built doesn't help until tomorrow" is a gameplay change if chosen silently.

## Files you OWN
- [games/citadel/sim-core/src/systems/fire-system.ts](../../../games/citadel/sim-core/src/systems/fire-system.ts) + its tests

## Files you must NOT touch
- fire *balance* constants (`COZY_WELL_EXTINGUISH_BONUS`, `BURN_TICKS`, spread radius) — this is a
  performance change; Citadel's cozy softness is a settled design call
  ([open-questions.md](../../wiki/open-questions.md))

## Acceptance
- No full-world scan per burning building per tick. Report the before/after entity-iteration count with
  8 concurrent fires.
- Fixed-seed outcomes identical: same buildings burn, same tick, same extinguish results. Verify with a
  seeded run that actually produces fires (the `phase45` tests cover fire — keep them green).
- The mid-day well staleness decision is documented in the file.
