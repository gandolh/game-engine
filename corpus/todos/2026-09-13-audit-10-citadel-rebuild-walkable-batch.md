# audit-10 — `rebuildWalkable` rebuilds all 36,864 cells once per placed tile

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`).

## The defect

`placeOne` ends with a full grid rebuild
([sim-bootstrap.ts:553](../../games/citadel/sim-core/src/sim-bootstrap.ts#L553), also 511 and 711):

```ts
occupancy.apply(fp);
walkable = rebuildWalkable(WORLD_WIDTH, WORLD_HEIGHT, occupancy, buildable);
```

[engine/core/src/placement/occupancy.ts:150-157](../../engine/core/src/placement/occupancy.ts#L150-L157)
allocates a fresh `Uint8Array(width*height)` and runs a nested loop with two callbacks per cell — 36,864
cells on the 192×192 world.

And `placeDragged` calls `placeOne` **once per tile**
([sim-bootstrap.ts:623-630](../../games/citadel/sim-core/src/sim-bootstrap.ts#L623-L630)):
```ts
for (const tile of tiles) { const r = placeOne(buildingType, tile.x, tile.y); … }
```

## Failure scenario

- **Road drag.** A 60-tile road is one `placeRoad` command: 60 full rebuilds inside a single tick →
  ~2.2 M cell evaluations and ~2.2 MB of freshly allocated `Uint8Array` in one tick. That stalls the
  worker and drops the snapshot stream mid-drag — precisely when the player is watching.
- **Save load.** `loadFromSave` replays the command log, so a save with 500 placements pays
  500 × 36,864 ≈ 18 M cell evaluations before the first frame.

## Fix sketch

Mark `walkableDirty` in `placeOne` and rebuild **once** after a batch — in `placeDragged` and in the
save-replay loop — or better, patch only the footprint's cells in place and drop the full rebuild.

Watch the ordering: anything inside the per-tile loop that *reads* `walkable` (e.g. connectivity or
reject reasons) must still see a correct grid. If a mid-batch read exists, patch-in-place is required
rather than deferring; check before choosing.

## Files you OWN
- [games/citadel/sim-core/src/sim-bootstrap.ts](../../games/citadel/sim-core/src/sim-bootstrap.ts) (the placement closures)
- [engine/core/src/placement/occupancy.ts](../../engine/core/src/placement/occupancy.ts) only if adding an
  in-place footprint update — keep it generic, no Citadel concepts in the engine

## Files you must NOT touch
- the placement *rules* (what may be built where) — this is purely when/how often the grid is recomputed

## Acceptance
- A 60-tile road drag performs one grid rebuild (or zero, with in-place patching), not 60. Report the count.
- **Identical outcomes**: same seed + same command log ⇒ same walkable grid, same reject reasons, same
  resulting town. Compare a fixed-seed `npm run sim:citadel` run before/after.
- Save load of a large save is measurably faster; state the before/after.
- `npm run test -w @citadel/sim-core` green; engine tests green if `occupancy.ts` changed.
