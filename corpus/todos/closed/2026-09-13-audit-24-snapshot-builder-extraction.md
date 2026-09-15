# audit-24 — Hollow and MateQuest build snapshots inline, the pattern Farm already outgrew

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Low effort, low risk; the smaller sibling of [audit-23](2026-09-13-audit-23-citadel-bootstrap-extraction.md).

## The problem

Three of four games hand-build their snapshot inside the bootstrap closure, iterating ECS queries directly:

- [games/hollow/sim-core/src/sim-bootstrap.ts:1006-1096](../../../games/hollow/sim-core/src/sim-bootstrap.ts#L1006-L1096) — `getSnapshot`, ~90 lines
- [games/mathquest/sim-core/src/sim-bootstrap.ts:510-556](../../../games/mathquest/sim-core/src/sim-bootstrap.ts#L510-L556) — `getSnapshot`, ~46 lines
- (Citadel's is covered by audit-23)

Only Farm — the oldest game — factored this out, into
[games/farm/sim-core/src/snapshot-builder/](../../../games/farm/sim-core/src/snapshot-builder/). The snapshot
*shapes* are legitimately game-specific; the fact that they are unextractable closures is not.

## Failure scenario

Because the builder is not a named, independently importable unit, there is no way to test "does the
snapshot correctly reflect an agent's needs / inventory / community" without booting the whole sim. On a
fast feature add, a field that should be surfaced gets missed in a 90-line manual object literal and is
caught only if the target interface happens to be strict enough — which, with `exactOptionalPropertyTypes`,
it often is for *added* fields but not for *stale* ones.

Hollow's `getSnapshot` is also the specific function [audit-04](2026-09-13-audit-04-hollow-tick-getter.md)
shows being called 8× per tick to read one integer — extracting it makes that cost visible rather than
buried.

## Fix sketch

Move each game's `getSnapshot` into a `snapshot-builder.ts` sibling inside **that game's own** `sim-core`,
taking its state explicitly. Follow Farm's precedent for structure but do not try to unify the shapes
across games — they are meant to differ, and the dependency rule forbids sharing them anyway.

## Files you OWN
- [games/hollow/sim-core/src/sim-bootstrap.ts](../../../games/hollow/sim-core/src/sim-bootstrap.ts) + new `src/snapshot-builder.ts`
- [games/mathquest/sim-core/src/sim-bootstrap.ts](../../../games/mathquest/sim-core/src/sim-bootstrap.ts) + new `src/snapshot-builder.ts`
- new colocated tests

## Files you must NOT touch
- the snapshot shapes (no field added, removed or renamed) — clients must need zero edits
- the engine — snapshot building is game-specific and must not be promoted
- Citadel's bootstrap (audit-23 owns it)

## Acceptance
- Both games have an importable snapshot builder; bootstrap return types unchanged.
- A new test builds a snapshot from a hand-constructed state and asserts specific field values — the
  capability that did not exist before. This is the point of the spec, not the line move.
- Fixed-seed `npm run sim:hollow` output byte-identical before/after.
- `npm run test -w @hollow/sim-core` + `-w @mathquest/sim-core` green.
