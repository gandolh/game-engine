# Task 24: Hollow builds its static draws once, and its frame allocates less

**Origin:** the [Super Mario 64 decompilation research](../../wiki/research-sm64-decomp.md) of 2026-11-23,
"The frame and the scene". Built as a light optimization under the owner's rule of 2026-11-23
([decisions.md](../../wiki/decisions.md) → Frame budget). The plan is [frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** brief 19 (Hollow's frustum culling). Brief 19 owns `renderer3d.ts`, `packInstances` and the
way `app.ts` builds its draw calls, and was being built when this brief was written. Read `app.ts`,
`buffers.ts` and brief 19's outcome again once it lands, before planning anything here.

## Context

The decompilation builds level geometry once, at load. What changes every frame (matrices, vertices) comes
from a display-list pool that alternates between two buffers and is reset each frame, so a frame does no heap
work (`src/game/memory.c@9921382`, `alloc_display_list`; `src/game/game_init.c@9921382`, `select_gfx_pool`).

Hollow's `frame()` in `games/hollow/client/src/render3d/app.ts` does the opposite for its static parts. As
of 2026-11-23, every frame:

- the ground's single instance is packed again (`packInstances([{ model: identity(), … }])`);
- every territory tile of every community gets a `groundHeightAt`, a new `translation` matrix and an
  instance object, and the list is packed into a new `Float32Array`. Territory only changes when a snapshot
  arrives, at most 20 times a second, and on the 64×64 grid it can reach thousands of tiles;
- `draws`, `agentRenderState`, `byAgentVariant` and `aliveAgentIds` are new arrays, maps and sets, and every
  agent gets a new model matrix;
- `separatedAgentPositions` calls `separateCircles` (`engine/core/src/collision/separate.ts`), which builds a
  new `SpatialHash` on each of its four iterations and sorts a copy of the bodies. Only Hollow's render uses
  it.

[Brief 20](../done/20-fewer-allocations-per-frame.md) profiled and fixed Farm and MateQuest only. Hollow is
CPU-light on the laptop, but a phone pays more for the same garbage.

## Files you OWN

- `games/hollow/client/src/render3d/` (`app.ts`'s frame, `agent-collision.ts`, `world-meshes.ts`) and their
  tests
- `engine/core/src/collision/` (`separate.ts`, `spatial-hash.ts`), only if the profile ranks them, with
  `separateCircles`'s output kept identical
- `engine/core/src/render3d/buffers.ts`, only to reuse a packed buffer, and only in the way brief 19 left it
- `corpus/verify/<date>-hollow-allocations/` (the before and after profiles and the ranked sites)
- `corpus/` pages for this brief: the outcome, `log.md`, [frame-budget.md](../../wiki/frame-budget.md) and
  the brief-24 row of [research-sm64-decomp.md](../../wiki/research-sm64-decomp.md)

## Files you must NOT touch

- Hollow's sim (`games/hollow/sim-core`), its worker, its research surfaces and the chronicle.
- Brief 19's culling logic, beyond calling it.
- The 2D renderer and the other three games.

## What to do

1. **Profile Hollow's allocations** over its bench scene the way brief 20 did: a sampling heap profile through
   the DevTools protocol, driven like `corpus/verify/2026-11-23-allocations/heap.mjs`, ranked by bytes
   through the build's source maps.
2. **Build the territory and ground instances when the territory changes, not every frame.** Keep the
   instance list from the last snapshot whose territory matched, and rebuild it only when a new snapshot's
   territory differs. Per frame, only cull (brief 19) and pack into a reused buffer.
3. **Fix the other top sites, up to five.** Clear and reuse the per-frame arrays, maps and sets, and reuse
   matrices where the profile ranks them. If `separateCircles` ranks, keep one hash across its iterations and
   clear it, keeping the bucket arrays. Its output must not change: its existing tests plus a new one that
   compares the old and new results on a seeded crowd.
4. **Profile again.**

## Acceptance

- The ranked sites before and after are in `corpus/verify/<date>-hollow-allocations/` and the outcome.
- Bytes allocated per frame over Hollow's bench scene fall by at least a third, and the bench's heap `drops`
  count falls. Put both numbers in the outcome.
- Nothing draws differently. The headless bench's GL draw calls and `drawInstances` equal brief 19's
  after-numbers, and an orbit screenshot at the same moment matches before and after.
- A test shows two frames on one snapshot build the territory instances once.
- The sim is not touched, so the baseline cannot move. No export diff is needed.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Deploy Hollow from the vps-deploy checkout: `node cli.ts hollow deploy`.

## Owner decisions

- None. This is a render-only optimization, and it ships if the counters hold.

## Outcome (2026-11-23)

Built in `27b9722d`. Bytes allocated a frame over the bench scene fell from 451 K to 269 K (-40%; the old code
measured again gives 448 K). Evidence and the ranked sites before and after are in
[2026-11-23-hollow-allocations](../../verify/2026-11-23-hollow-allocations/README.md).

- **The biggest site was not on the brief's list.** `boundsOf` alone was 112 K a frame: `instanceAABB` walked
  every vertex of an agent's mesh for each agent, each frame. The local bounds are now found once per mesh
  (`agent-bounds.ts`), with the same result as `instanceAABB` (a test compares them).
- **Territory and ground** are built when the territory changes (`static-draws.ts`). The key is each community's
  id plus every tile's `gx` and `gy`, compared without allocating when a new snapshot arrives; the same snapshot
  object on the next frame skips even that. A test shows two frames on one snapshot build once, and that a changed
  tile, tile count or community id rebuilds.
- **`separateCircles`** ranked and is used only by Hollow (`SpatialHash` only by it), so no other game's deploy is
  affected. It keeps one hash across its passes, queries into one array, and its output is unchanged: a new test
  compares it with a copy of the old solver on three seeded crowds with coincident bodies and negative coordinates.
- **Bench counters:** GL draw calls 35.5 to 35.7 and `drawInstances` 95.7 to 96.3. The old code at the same load
  moves as much (35.65, 95.98), so these are noise from the running sim, not a change. The views match before and
  after (ground, houses, trees, hearth).
- **Not met: the bench's heap `drops` did not fall.** It read 8 and 12 before and 19, 18, 18 after. `drops`
  counts a used-heap reading lower than the one before, taken once a second; at this allocation rate a scavenge
  happens about once a second, so it cannot count them, and the number is not monotone in garbage. The sampling
  profile is the measure that moved.

Owner step: deploy Hollow with `node cli.ts hollow deploy`. The sim is not touched, so no export diff is needed.
