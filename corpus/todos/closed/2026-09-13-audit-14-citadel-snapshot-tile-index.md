# audit-14 — Citadel rebuilds three tile→entity Maps on every snapshot

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`).

## The defect

Inside a single `getSnapshot()`, the same building-footprint walk happens **three times**:

[sim-bootstrap.ts:968-980](../../../games/citadel/sim-core/src/sim-bootstrap.ts#L968-L980) (`getBuildings`):
```ts
const tileToBuilding = new Map<number, number>();
for (const entity of buildingWorld.query("building")) { … tileToBuilding.set(ty*WORLD_WIDTH+tx, entity.id); }
```
[sim-bootstrap.ts:1038-1050](../../../games/citadel/sim-core/src/sim-bootstrap.ts#L1038-L1050) (`getVillagers`)
independently builds `tileToType` **and** `tileToBuildingId` over the identical footprints.

## Failure scenario

Solo Citadel at 20 Hz (80 Hz-equivalent work at the 4× speed button). `buildingWorld` includes an entity
per road tile, so at ~800 entities with multi-tile footprints that is roughly 1,500-2,500 `Map.set` calls
per tick, three full pooled-array copies of the entity list, and three Map allocations discarded
immediately. `tools/citadel-sim/src/run-core.ts:57` makes it worse in report mode: `collect` calls
`getSnapshot(tick)` on **every** tick of a headless run.

## Fix sketch

Maintain **one** persistent `tileToBuildingId` map on `SimState`, updated in the same places that already
maintain `state.buildingTiles` (`placeOne`, demolish, destroy), and derive type/state from
`buildingState.get(id)` at snapshot time.

Pairs naturally with [audit-10](2026-09-13-audit-10-citadel-rebuild-walkable-batch.md) — both are about
placement-time bookkeeping replacing per-tick recomputation. Consider doing them together; if so, keep
them as separate commits so either can be reverted alone.

## Files you OWN
- [games/citadel/sim-core/src/sim-bootstrap.ts](../../../games/citadel/sim-core/src/sim-bootstrap.ts)
- `SimState` and the placement/demolish paths that maintain `buildingTiles`

## Files you must NOT touch
- the snapshot *shape* — no field changes; the client must not need edits

## Acceptance
- One tile→building index is maintained incrementally; zero rebuilt per snapshot. Report the before/after
  `Map.set` count per tick.
- Index correctness under **demolish and fire-destroy**, not just placement — this is where an incremental
  index goes stale. Add a test that places, demolishes, and re-places on the same tiles and asserts the
  index matches a freshly-computed one.
- Fixed-seed `npm run sim:citadel` produces identical output before/after.
- `npm run test -w @citadel/sim-core` green.
