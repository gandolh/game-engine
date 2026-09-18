# audit-60 — `TILE = 16` is a private const in 15 source files across 4 packages

status: todo
created: 2026-09-18
context: found by the debt lens of the 2026-09-18 sweep. Farm's client already solved this for its own
half; the sim-core/server/tool half never adopted the fix.

## The gap

The tile→world-pixel scale is load-bearing across sim-core sprite production, the server's snapshot,
the client's screen↔tile mapping and the offline PNG renderer. `grep -rn 'TILE = 16;'` returns **22
hits** (15 in production source, the rest in tests):

- the *exported* one: [`games/farm/client/src/main/config.ts:18`](../../games/farm/client/src/main/config.ts#L18)
  — imported by 9 client modules including [`screen-to-tile.ts:3`](../../games/farm/client/src/main/screen-to-tile.ts#L3) (`Math.floor(wx / TILE)`)
- and 14 private redeclarations: [`engine/core/src/render/rain-field.ts:48`](../../engine/core/src/render/rain-field.ts#L48),
  [`games/farm/server/src/sim-host.ts:32`](../../games/farm/server/src/sim-host.ts#L32),
  [`tools/world-preview/src/index.ts:17`](../../tools/world-preview/src/index.ts#L17),
  six under [`games/farm/sim-core/src/render-systems/`](../../games/farm/sim-core/src/render-systems/)
  (`frames.ts:6`, `geometry.ts:34`, `interior-decor.ts:22`, `lights.ts:24`, `occluders.ts:7`,
  `snapshot-sprites.ts:5`, `static-layer.ts:29`),
  [`snapshot-builder/sprites.ts:16`](../../games/farm/sim-core/src/snapshot-builder/sprites.ts#L16),
  and three client render modules.

Citadel has its own `TILE_SIZE = 16` ([`world/terrain.ts:22`](../../games/citadel/sim-core/src/world/terrain.ts#L22)).
No test asserts any two of them agree.

## The cost

Changing the atlas frame size — the single change this constant exists to make possible — needs 15
coordinated edits across 4 packages. Miss one in `sim-core/render-systems` and the sim emits sprite
coordinates on a different grid than `screen-to-tile.ts` inverts: **hover and click silently target
the wrong tile**, while every unit test stays green, because the test files hardcode their own `16` too.

## What to do

Give it one owner and import it. The honest home is `@engine/core` — a tile-to-pixel scale is generic,
and `rain-field.ts` already needs it inside the engine, so an engine-side constant removes the
engine→client direction problem rather than creating one.

Watch two things:

- **Citadel's `TILE_SIZE` is a different concept** (iso tile footprint, not Farm's atlas frame). Do not
  merge them just because both are 16. Confirm before touching it; if they are genuinely different,
  say so in a comment so the next sweep does not re-find it.
- The **test** copies matter as much as the source ones — a test that hardcodes 16 cannot fail when
  the constant changes, which is precisely how this would go unnoticed.

## Files you OWN
- a new constant in `@engine/core` + its export
- the 15 production redeclaration sites listed above
- the test files that hardcode `16`

## Files you must NOT touch
- Citadel's `TILE_SIZE` unless you have established it is the same concept
- the **value** — this brief is a de-duplication, not a resize. `TILE` stays 16, and the change must
  be a provable no-op.

## Acceptance
- One definition; `grep -rn 'TILE = 16'` finds it once (plus Citadel's, if it stays separate).
- A test asserting the client's screen↔tile inverse round-trips against the sim's sprite grid — the
  invariant the 15 copies are silently relying on, which nothing currently checks.
- **Byte-identical output.** Same seed → same run, same `npm run preview` PNG. If anything moves, one
  of the 15 was not actually 16 and that is the real finding — report it.
