# Task 25: Farm finds tile features by cell, not by scan

**Origin:** the [Super Mario 64 decompilation research](../../wiki/research-sm64-decomp.md) of 2026-11-23,
"Collision and movement". A light optimization under the owner's rule of 2026-11-23
([decisions.md](../../wiki/decisions.md) → Frame budget), on the sim side.

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** none.

## Context

The decompilation puts level surfaces into a grid of cells once, when an area loads
(`src/engine/surface_load.c@9921382`, `load_area_terrain`). Each frame, `clear_dynamic_surfaces` resets the
pool to the static high-water mark and refills only the moving objects' surfaces. A floor query reads one
cell (`src/engine/surface_collision.c@9921382`, `find_floor`). Static data is built once, and only what
changed is redone.

Farm does the opposite for its tile features (rocks, trees, bushes; and the `solid` footprints of built
things):

- `FeatureCollisionSystem` (`games/farm/sim-core/src/systems/world-time/feature-collision.ts`) reverts the
  cells it blocked last tick and re-stamps every `tileFeature` and every `solid` into the walkable grid **every
  tick**. Features change only when one is chopped, mined, built or regrown.
- `PlayerControlSystem` (`games/farm/sim-core/src/systems/player-control/system.ts`) asks `canStand` for every
  tile Pip's 0.6-tile box overlaps. Each `featureAt` scans every tile feature and every solid, and `bushAt`
  and the axe and pickaxe intents scan the tile features again. Each scan also copies the query's whole array,
  because a query iterates a pooled copy.

The ECS gives no signal when a query's membership changes, so nothing can tell that "the features are the same
as last tick". Query order is insertion order (`Query.entities` in `engine/core/src/ecs/world.ts`), and the
sims' determinism leans on it, but no test pins it.

Two traps:

- `PlayerControlSystem` runs in the DELIBERATE stage, before `FeatureCollisionSystem` in MOVE. So the grid
  is one tick stale when Pip moves, and Pip must not read `grid.cells`.
- `FeatureCollisionSystem` and the grid exist only when `bootstrapSim` gets a pathfinder.

## Files you OWN

- `engine/core/src/ecs/world.ts` and `world.test.ts` (a query version and the order tests)
- `games/farm/sim-core/src/systems/world-time/feature-collision.ts`,
  `games/farm/sim-core/src/systems/player-control/` and a new feature-cells module beside them in
  `games/farm/sim-core/src/world/` or `systems/`, with their tests
- `games/farm/sim-core/src/sim-bootstrap.ts`, only to build the index once and hand it to both systems
- `corpus/` pages for this brief: the outcome, `log.md`, [system-ordering.md](../../wiki/system-ordering.md)
  if a system's role changes, and the brief-25 row of
  [research-sm64-decomp.md](../../wiki/research-sm64-decomp.md)

## Files you must NOT touch

- The other games' sims, and every other Farm system: none of them may change behaviour.
- The pathfinder and the walkable grid's base (`walkable-grid.ts`, `coral.ts`).
- The order systems are registered in. `sim-bootstrap.ts` may change only to build the index once and pass
  it to both systems.

## What to do

1. **A query version.** `Query` gets a `version` number that goes up whenever an entity joins or leaves the
   query. In `world.test.ts`, pin that and query order: entities iterate in spawn order, a despawn keeps the
   others' order, and an entity that gains a component later joins at the end.
2. **A feature-cells index for Farm.** For each tile, keep the first tile feature in query order (the entity,
   so its `kind` is read live) and whether a solid stands there. Rebuild it when the `tileFeature` or `solid`
   query's version differs from the last build, at the moment someone reads it. Nothing moves a feature in
   place as of 2026-11-23 (no writes to `tileFeature.tileX/Y` or `solid.tileX/Y` after setup); confirm that, and if
   something does, say how the index handles it.
3. **`FeatureCollisionSystem` stamps only on change.** When the index was not rebuilt since the last stamp,
   it leaves `grid.cells` alone. Check that nothing else writes `grid.cells` after setup.
4. **`PlayerControlSystem` reads the index.** `featureAt`, `bushAt` and the axe and pickaxe intents read the
   index instead of scanning. Each must give the same answer as the current scan at the moment of the call,
   including when two features share a tile.
5. **Time both systems before and after** over a short headless run, with a scratch harness that is not
   committed. Put the per-tick cost and how many ticks rebuilt the index in the outcome.

## Acceptance

- `world.test.ts` shows the version rises on a join and a leave and not on an unrelated component change,
  and pins the three order cases.
- `player-control.test.ts` shows Pip blocked by a feature and sliding along a row of features. It also shows
  that Pip sees a feature added or removed earlier in the same tick by a system that runs before
  `PlayerControlSystem` (such as `TileFeatureSystem` in GROW), and that `bushAt` is unchanged.
- The baseline does not move: `CHECK_DETERMINISM=1 npm run sim` passes, and `npm run sim` with
  `EXPORT=json` for three seeds at `MAX_DAYS=10` gives byte-identical files before and after. A headless run
  gives Pip no input, so this diff covers the agents' grid; the Pip tests cover the player path.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Deploy Farm from the vps-deploy checkout: `node cli.ts farm-valley deploy`. The other games get the
  engine's query version with their next deploy; nothing in them changes.

## Owner decisions

- None. Nothing a player sees changes.

## Outcome (2026-11-23)

Built in the code commit that precedes this one. The sim's output did not move: `EXPORT=json` at `MAX_DAYS=10` for
seeds 1, 2 and 3 is byte-identical before and after (`cmp`), and `CHECK_DETERMINISM=1 npm run sim` passes.

- **Engine.** `Query.version` is a counter that goes up when an entity joins or leaves the query, at the moment of the
  spawn, despawn, `addComponent` or `removeComponent`. It does not move for an unrelated component or a value change
  inside a matched one. Nothing else changed for existing callers. `world.test.ts` pins that and the three order
  cases (spawn order, a despawn keeps the others' order, a late joiner goes last).
- **`FeatureCells`** (`games/farm/sim-core/src/world/feature-cells.ts`) keeps the first `tileFeature` entity per tile
  and the solid tiles. It compares both queries' versions on every read and rebuilds when one moved, so a feature
  added or removed earlier in the same tick by another system is seen at once. Tiles are keyed with an offset so an
  off-grid tile answers as the old scan did. `bootstrapSim` builds one and gives it to both systems; both
  constructors default to their own index, so existing tests are unchanged.
- **Writers of `grid.cells`.** Only `FeatureCollisionSystem` writes it after `buildWalkableGrid` (the pathfinders and
  `TravelSystem` only read it). Nothing writes `tileFeature.tileX/Y` or `solid.tileX/Y` after a spawn, so membership
  is the only change the index has to see.
- **Per tick, before and after.** A scratch harness (not committed) wrapped both systems over 3 days (3600 ticks,
  seed 1), with Pip walking in a square and swinging the axe or pickaxe every 15 ticks. The machine was loaded, so
  read the ratio, not the milliseconds. `FeatureCollisionSystem`: 0.0226 to 0.0011 ms a tick (81 ms to 3.8 ms in
  all). `PlayerControlSystem`: 0.0445 to 0.0213 ms a tick (160 ms to 77 ms). The index rebuilt on 22 of 3600
  ticks. Pip ended on the same tile in both runs.
- **Tests.** `player-control.test.ts` adds a row of trees Pip slides along, a solid, a feature added and one
  removed between the same tick's earlier system and Pip's run, `bushAt`, and two features on one tile (the first in
  spawn order decides, and the second answers once the first is gone). `feature-cells.test.ts` compares the index
  with the old scan after despawns and late joins. `feature-collision.test.ts` shows the grid is left alone while
  nothing changed.
- **Deviation.** The same-tick case is tested by spawning and despawning before `PlayerControlSystem.run`, not by
  driving the real `TileFeatureSystem`; both go through the same `World` calls.
