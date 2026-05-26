# Game Task 13 — Walking Sprite Animation

## Context

`TravelSystem` advances a farmer's `Transform.{x, y}` by one tile every `STEP_TICKS = 5` ticks while `farmer.path` is set. The renderer interpolates between `prev` and current with `alpha`, but the sprite *frame* is static — it's always the same image. So farmers smoothly glide between tiles instead of looking like they're walking.

The engine already has an `Animator` + `AnimationClip` in `packages/engine/src/animation/` (built in Brief 04). It's currently unused by the game.

## Goal

While a farmer's `path` is set (traveling), their sprite swaps frames to show a walk cycle. When `path` clears (arrived), revert to the idle frame.

The cheapest visually-credible cycle is two frames: `walk-a` and `walk-b`, swapping every ~100ms (every 2 ticks at 20 Hz). Use existing engine `Animator` if it fits; otherwise inline the 2-frame swap with a tick counter on the farmer.

## Files in scope

- `packages/farm-valley/src/render-systems.ts` — in the sprite-rendering loop, pick a frame for farmer entities based on whether `farmer.path` is set: idle frame (current) when not traveling, alternating walk frame when traveling. Use the current tick (passed through `buildCanvasFrame`) or a per-entity counter (add a transient field on the entity — but components.ts is forbidden, so use the existing `path.ticksUntilStep` as a parity clue, OR a tick counter passed from main.ts).
- `packages/farm-valley/src/main.ts` — pass current `tick` into `buildCanvasFrame` so the renderer can derive walk-cycle phase. (Already easy to access via `clock.tick`.)
- `tools/atlas-builder/src/recipes.ts` — add two new sprite recipes: `farmer/walk-a` and `farmer/walk-b` (and one per personality if existing sprites are per-personality; check first by grepping for `farmer/` frame references). Keep the recipes procedural / simple — small variation of the existing farmer sprite (e.g. shift legs apart vs together).
- `packages/farm-valley/public/atlas/main.png` + `main.json` — rebuild after recipe changes via `npm run atlas`. Commit the regenerated artifacts.
- `packages/farm-valley/src/render-systems.test.ts` (create if missing) — at minimum one unit test: given a farmer entity with `path` set, the emitted sprite frame alternates between two values across consecutive tick parities

## Files you must NOT touch

- `packages/farm-valley/src/components.ts`
- All systems (`travel`, etc.), all agents, all protocols, world/**
- `main.ts` is in-scope ONLY for adding the `tick` parameter to `buildCanvasFrame` call site. Do not touch camera config, do not touch focus state.
- `sim-bootstrap.ts`, `world-setup.ts`
- `ui/**` (observer, leaderboard, config, dom)
- Other engine source — only the existing `animation/` package may be *imported*, not modified
- `screens/**`

## Coordination with concurrent briefs

- **Brief 11 (focus-camera)** also touches `render-systems.ts`. They emit a focus halo sprite from a separate generator; you modify the farmer sprite *frame* in the existing entity loop. The merge should be mechanical if you keep your edits scoped to "frame selection". If you can extract `pickFarmerFrame(entity, tick)` into a top-level helper, it's especially merge-friendly.
- **Brief 14 (meet-indicator)** is purely additive; no conflict.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (no regressions; new walking test added)
- `npm run atlas` regenerates the atlas without errors
- `npm run dev`: farmers visibly alternate between two sprite frames while traveling; static when idle
- No `.js` import suffixes; no new runtime deps

## Workflow

Sonnet executor. Read brief → read `render-systems.ts`, `travel.ts` (for path component shape), `atlas-builder/src/recipes.ts` for the recipe pattern, and `packages/engine/src/animation/` for the existing Animator API → implement. Run `npm run atlas` then typecheck + tests before reporting. Do not commit — orchestrator handles that.
