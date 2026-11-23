# Task 28: an entity found by its id

**Origin:** a side finding of the [Super Mario 64 decompilation research](../../wiki/research-sm64-decomp.md) of
2026-11-23 (the "One gap, not briefed" note under object slots), filed after the owner's grilling the same day. A
light optimization under the owner's rule of 2026-11-23 ([decisions.md](../../wiki/decisions.md) → Frame budget).

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** [25](25-farm-finds-tile-features-by-cell.md), because both edit `engine/core/src/ecs/world.ts` and
its test.

## Context

`World.spawn` (`engine/core/src/ecs/world.ts`) gives an entity the next automatic id when it has none. An entity
spawned with an explicit `id` keeps it, but `nextId` doesn't move past it, so a later automatic id can repeat it.
No game spawns with an explicit id as of 2026-11-23; tests do (`world.test.ts` spawns id 999, Hollow's
`mortality.test.ts` spawns id 500). Nothing stops two live entities sharing an id either.

The world has no id lookup. Farm's `findById(world, id, ...components)`
(`games/farm/sim-core/src/systems/entity-helpers.ts`) scans the query for those components on every call, and each
scan takes the query's pooled copy. It has 20 call sites outside tests, in the shopkeeper, encounter trade, auction,
market and carpenter systems.

## Files you OWN

- `engine/core/src/ecs/world.ts` and `world.test.ts`
- `games/farm/sim-core/src/systems/entity-helpers.ts` and a test beside it
- `corpus/` pages for this brief: the outcome, `log.md`, and the object-slots note in
  [research-sm64-decomp.md](../../wiki/research-sm64-decomp.md) (mark the gap fixed)

## Files you must NOT touch

- `findById`'s callers: the helper keeps its signature, so none of them change.
- Other games' own id scans, if you find any. List them in the outcome instead.

## What to do

1. **An id map in `World`.** Keep a `Map<number, E>` beside `all`: `spawn` adds, `despawn` removes. Add
   `get(id): E | undefined`.
2. **Explicit ids move `nextId`.** When an entity arrives with an `id` at or above `nextId`, set `nextId` to
   `id + 1`. Spawning a *different* object with an id a live entity already holds throws an error that names the id.
   Spawning the same object again stays a no-op, as today.
3. **`findById` reads the map.** Look the id up, then return the entity only if it carries every component the
   caller named. That is what the scan returned, so callers see no change.
4. Check `World`'s other members (`clear` or a reset, if there is one) keep the map in step with `all`.

## Acceptance

- `world.test.ts` shows: `get` finds a spawned entity and not a despawned one; an automatic id after an explicit
  id 999 is 1000; a second object spawned with a live entity's id throws; respawning the same object doesn't.
- A test beside `entity-helpers.ts` shows `findById` returns `undefined` for an entity missing a named component.
- The baseline doesn't move: `CHECK_DETERMINISM=1 npm run sim` passes, and `npm run sim` with `EXPORT=json` for
  three seeds at `MAX_DAYS=10` gives byte-identical files before and after. `npm run sim:citadel` and
  `npm run sim:hollow` print the same results as before.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- None beyond the next deploy of each game: `node cli.ts farm-valley deploy` from the vps-deploy checkout; the
  other games pick up the engine change with their next deploy. Nothing a player sees changes.

## Owner decisions

- None.
