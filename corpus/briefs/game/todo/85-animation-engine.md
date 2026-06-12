# Brief 85 — Animation engine (agents + Pip)

Synthesis + current-state map: [wiki/animation.md](../../../wiki/animation.md). Read it first.

> **Status (2026-06-12): Phase 1 implemented — awaiting in-browser feel-check.** `@engine/core/animation` (`AnimationClip`/`Animator` + tests) reintroduced; the six render-loop wall-clock cyclers + the fishing-spot cycler now run through declarative clips via `render-systems/{cycle,clips}.ts`; working farmers/Pip get a render-side action swing; the dead `SpriteAnim` stub is removed. typecheck + engine/render-systems tests green. **WebGPU-only won't render headless on this box → the action-swing feel needs a user look before this moves to done/.** Phases 2–3 (art) remain open.

## Why

Animation is ad-hoc and scattered, and the protagonists are *stiffer than the extras*: farmers/Pip freeze on a single static pose for the whole duration of an action, while background work-NPCs get a 2-frame tool swing. There is no reusable animation abstraction, and ~7 near-identical wall-clock frame-cyclers are hand-rolled inline in [render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts). A proper `AnimationClip`/`Animator` was built under brief 04 and then **deleted as unused** (`cleanup` commit `1d5f80c`) — so the reintroduction must come **with real consumers** or it rots again.

All of this is **render-only / wall-clock** → no determinism impact, no baseline move, no `CHECK_DETERMINISM` run required.

## Phase 1 — primitive + consumers + action swing (no new art)  ← this brief's shippable unit

**Engine primitive (`@engine/core/animation`):**
- Recover `AnimationClip` (immutable `{frame, durationMs}[]`, `loop`, `sampleAt(elapsedMs) → {frameName, loopsCompleted, finished}`) and `Animator` (`addClip`/`play`/`update(deltaMs)`/`currentFrameName`/`isFinished`/`clear`) from commit `0919cbc`.
- Files: `packages/engine/src/animation/{clip,animator,index}.ts` + `clip.test.ts` + `animator.test.ts`.
- Export via the engine main barrel **and** a `@engine/core/animation` subpath (add to `packages/engine/package.json` `exports`).
- `Animator.update` JSDoc must state it advances in wall ms (game chooses fixed-step vs render-delta).

**Consumer 1 — unify the cyclers (render-only).**
- New `packages/sim-core/src/render-systems/clips.ts`: declarative `AnimationClip` instances for `foam`, `forge-fire`, `forge-smoke`, `waterfall-fall`, `campfire`, `weather-beacon`, `fishing-spot` (loop, uniform per-frame durations matching today's periods), plus a `sampleCycle(clip, nowMs, phaseFrames?)` helper. Re-export through the `render-systems` barrel.
- `resolveFrameAndBob` (fishing-spot) and `render-loop.ts` (the other six) call `sampleCycle(...)` instead of `floor(nowMs/(period/len)) % len`. Behaviour-preserving.

**Consumer 2 — action swing for farmers/Pip (render-only, visible win).**
- In `resolveFrameAndBob`, when `s.action` maps to an `ACTION_POSE`, return a modest vertical swing `bobY` (rhythmic, phase-shifted per `id`, faster/larger than idle bob) instead of `bobY: 0`. Working farmers/Pip now visibly "work" using existing art. Documented as the interim until phase 2 art lands.

**Acceptance (phase 1):**
- `npm run typecheck` green across workspaces.
- `npm run test` green; new tests for `clip`/`animator` and for `sampleCycle`/action-swing in `resolveFrameAndBob`.
- No `.js` import suffixes; no new runtime deps; EDG palette untouched (no color literals introduced).
- The `SpriteAnim` dead stub ([trust.ts](../../../../packages/sim-core/src/components/trust.ts) / `entity.ts`) is removed or repurposed (don't leave two unused animation abstractions).
- In-browser feel-check pending (WebGPU-only won't render headless on this box).

## Phase 2 — action `-a/-b` art (atlas; follow-up)

Add a second frame per action pose to the farmer/Pip recipes ([tools/atlas-builder/src/recipes/](../../../../tools/atlas-builder/src/recipes/) templates + per-personality subs), rebuild the `characters` sheet, bump `assets.test.ts` count. Replace the phase-1 swing-offset with a real 2-frame work clip per action. Mirror the NPC swing cadence.

## Phase 3 — 4-frame walk + render-side walk migration (art + boundary)

Add a 4-frame walk per facing. Ship **semantic walk state** on `SnapshotSprite` (e.g. `moving: boolean` + keep `facing`) instead of the pre-baked `/walk-a|b` suffix, resolve the stride render-side via the `Animator`, and retire `pickFarmerFrame`. Watch the interpolation path (the `interpolate` flag) — frame phase must stay independent of position lerp.

## Notes / guardrails

- Reuse the proven brief-04 implementation; don't re-derive `sampleAt` wrapping from scratch.
- Keep the engine primitive game-agnostic (no farm-valley imports); clips that name farm atlas frames live in `sim-core/render-systems`, not the engine.
- `nowMs` is passed in everywhere — never reintroduce `Date.now()` in sim-core/render-systems.
</content>
