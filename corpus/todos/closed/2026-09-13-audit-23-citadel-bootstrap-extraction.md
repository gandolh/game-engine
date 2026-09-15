# audit-23 — Citadel's `bootstrapSim` is a 1302-line closure holding five unrelated jobs

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Pure extraction, no behaviour change. Farm already has the shape to copy.

## The problem

[games/citadel/sim-core/src/sim-bootstrap.ts](../../../games/citadel/sim-core/src/sim-bootstrap.ts) is 1,302
lines, and `bootstrapSim` itself (276-1302) contains ~18 nested closures doing five separable jobs:

| job | lines |
|---|---|
| placement validation (`placeOne`, `placeDragged`, `describeReject`, `actsAsKeepAnchor`) | ~450-660 |
| tile bookkeeping | interleaved |
| snapshot building (`getBuildings`, `getVillagers`, `getSnapshot`) | ~961-1190 |
| save/serialize + seeding (`seedFoundingTown`) | ~1190-1302 |
| system registration | the rest |

None of them need this closure's scope: they touch `state` / `terrain` / `WORLD_WIDTH`, all of which are
already passed as plain values to the top-level pure helpers in the same file (`canAfford`, `debitStock`,
`creditStock`). Farm solved this long ago — its snapshot building lives in
[games/farm/sim-core/src/snapshot-builder/](../../../games/farm/sim-core/src/snapshot-builder/).

**This is not "the file is big".** A long declarative system-registration sequence would be fine — the
scheduler order is load-bearing and reads well as a list. The problem is the four *other* jobs tangled into
the same closure, which is why the file grew from placement-only to placement+snapshot+save+seeding across
several briefs with no seam to land anything in.

## Failure scenario

Changing placement-rejection logic requires standing up the entire bootstrap closure — there is no unit
under test smaller than the whole sim, so `sim-bootstrap.test.ts` integration tests are the only cover.
The next contributor adding a sixth responsibility has no natural home for it and will grow the same
function again. Two other specs in this batch ([audit-10](2026-09-13-audit-10-citadel-rebuild-walkable-batch.md),
[audit-14](2026-09-13-audit-14-citadel-snapshot-tile-index.md)) both have to edit inside this closure.

## Fix sketch

Two same-package moves, mirroring Farm:
1. `systems/placement.ts` — `placeOne` / `placeDragged` / `describeReject` / `actsAsKeepAnchor`, taking
   `SimState` explicitly the way `canAfford` already does.
2. `snapshot-builder.ts` — `getBuildings` / `getVillagers` / `getSnapshot`.

Leave system registration, save/serialize and `seedFoundingTown` where they are unless they fall out
naturally; do not chase the full 1,302 lines.

**Sequencing.** If audit-10 or audit-14 are also being done, do **this one first** — they edit the same
code and will conflict otherwise. If they are already done, rebase onto them.

## Files you OWN
- [games/citadel/sim-core/src/sim-bootstrap.ts](../../../games/citadel/sim-core/src/sim-bootstrap.ts)
- new `games/citadel/sim-core/src/systems/placement.ts` and `src/snapshot-builder.ts` (+ any new tests)

## Files you must NOT touch
- **scheduler registration order.** Read the inline comments first — the sequence encodes real data
  dependencies. Extraction must not reorder a single system.
- `games/citadel/client/**` — the snapshot shape and the bootstrap's public return type stay identical, so
  the client needs no edit. If you find yourself changing the client, the extraction went wrong.
- any other game

## Acceptance
- ~550 lines move to two new siblings; the public API of `bootstrapSim` is **unchanged** (same returned
  object shape, same options).
- **Behaviour-preserving, proven:** a fixed-seed `npm run sim:citadel` produces byte-identical output
  before and after. A pure extraction has no excuse for any diff. Keep the run small (low `MAX_DAYS`);
  **ask before any full determinism check.**
- At least one placement-rejection case is now testable without booting the whole sim — add that test as
  the proof the seam is real.
- `npm run test -w @citadel/sim-core` green, `phase45` fixtures included.
