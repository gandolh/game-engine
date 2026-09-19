# Brief 81 — Pseudo-3D height (z) axis + persistent rain field with ground/water splashes

**Status:** Done · **Area:** `packages/engine` (render core: z-axis, `RainField`) + `packages/farm-valley` (weather wiring, splashes) + `packages/sim-core` (snapshot `z` passthrough) · **Done:** 2026-06-11

## Problem

The rain "reset" when the camera followed a walking farmer. Root cause (verified in code, not the first guess): rain was **not** a coordinate-space bug — particles already drew in world space (`renderer.endFrame` draws `particles.draw(ctx)` while the camera transform is active). The real issue was that [render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts) sprinkled a fixed number of drops along the **top edge of the current viewport every frame** with ~0.5–0.9 s lifetimes. There was no persistent rain *volume*: as the camera panned, its leading edge swept into a column of air that had never been seeded from above, so that strip read as sparse/"reset" rain while the trailing edge drained. The model assumed a static camera.

The user also asked for a **pseudo-3D height axis** (game-wide foundation) and **splash effects when rain hits the ground/water**. The robust fix for the reset bug *is* the same work as the pseudo-3D rain, so they were done together.

## What shipped

Recommended scope (render-side foundation + rain feature; the deterministic sim-side `Elevation`/`GravitySystem` for actual jumps was deliberately **deferred** — the foundation ships inert and ready).

1. **Engine z-axis (foundation, inert at z=0).**
   - [`Canvas2dSprite.z`](../../../../packages/engine/src/render/canvas2d/types.ts) — optional pseudo-3D height (world px). `(x, y)` stays the ground/shadow point.
   - [renderer.ts](../../../../packages/engine/src/render/canvas2d/renderer.ts) draw loop lifts the sprite by `z` (`screenY = y - z`). **The y-sort key in `compareSprite` is unchanged (still ground `y`)** — depth order is unaffected, which is the documented-correct base behaviour. `z=0`/undefined is an exact no-op.
   - [`SnapshotSprite.z`](../../../../packages/sim-core/src/snapshot/sprites.ts) (tile units) + passthrough in [snapshot-sprites.ts](../../../../packages/sim-core/src/render-systems/snapshot-sprites.ts); the entity drop-shadow **shrinks/fades** as `z` rises (gone by 3·TILE). All inert today (nothing sets `z`).

2. **`RainField`** ([packages/engine/src/render/rain-field.ts](../../../../packages/engine/src/render/rain-field.ts)) — render-only, world-space, **persistent recycled pool** kept at a constant density over a region that tracks the camera. Each drop has a ground point `(gx, gy)` + height `z`; it falls (constant velocity — rain doesn't accelerate), is drawn lifted (`gy - z`) as a batched single-stroke streak (snow = swaying squares). Off-screen drops recycle into view at a random height (fills newly-revealed edges → **no reset on pan**). On landing, a fraction (`splashChance`) fire `onImpact(gx, gy)`. Hard pool cap (`MAX_DROPS=900`) for weak hardware.

3. **Differentiated splashes** — [render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts) `spawnRainSplash(wx, wy)` queries [`isWalkable(tx, ty)`](../../../../packages/sim-core/src/world/regions.ts) (false = ocean): water → low spreading ripple; land → small upward droplet pop. Emitted through the existing `ParticleSystem`.

4. **Wiring** — `RainField` created in [main.ts](../../../../packages/farm-valley/src/main.ts), passed through `RenderLoopDeps`; the old per-frame top-edge spawn block is replaced by `rain.setConfig(...)` + `rain.update(dt, view, spawnRainSplash)`; drawn via `renderer.endFrame(wash, particles, rain)` (new optional world-space `weather` drawable, drawn after particles so splash crowns read beneath the curtain).

## Determinism

All of the above is **render-only on the main thread** and uses `Math.random` (display-only, exactly like `ParticleSystem`). No sim/worker involvement, no snapshot-content change that affects ticks, so determinism is untouched. `isWalkable` is a pure static query.

## Tests / verification

- New [rain-field.test.ts](../../../../packages/engine/src/render/rain-field.test.ts) (7 cases): non-zero steady density, storm > rainy, **density stable across a 120-frame camera pan (the reset-bug regression guard)**, impacts fire for rain, snow fires none, pool clears when weather stops.
- `npm run typecheck` clean; `@engine/core` (89), `farm-valley` (135), `@farm/sim-core` (654) suites green.
- Palette guard passes (`RainField` defaults + splashes use `EDG.*`).

## Follow-ups (deferred, out of scope here)

- **Sim-side `Elevation` component + `GravitySystem`** (deterministic, in the Worker, ride the snapshot via the now-present `SnapshotSprite.z`) for real jumps / thrown items. The render path is ready; nothing populates `z` yet.
- Optional `-(y+z)` sort refinement and the high/low rain split (drops occluded by tall trees) if elevated gameplay ever needs it.
