# Brief 85 — Animation engine (agents + Pip)

Synthesis + current-state map: [wiki/animation.md](../../../wiki/animation.md). Read it first.

> **Status (2026-06-12): Phases 1 + 2 + 3 implemented — awaiting in-browser feel-check.**
> - **Phase 1:** `@engine/core/animation` (`AnimationClip`/`Animator` + tests) reintroduced; the six render-loop wall-clock cyclers + the fishing-spot cycler now run through declarative clips via `render-systems/{cycle,clips}.ts`; the dead `SpriteAnim` stub is removed.
> - **Phase 2:** `ACTION_TEMPLATES_B` adds a `-b` strike frame per action (7 actions × 5 personalities incl. Pip = 35 generated `farmer/<p>/<action>-b` frames; characters sheet 128 frames). `resolveFrameAndBob` alternates `pose ↔ pose-b` (per-entity phase, ~0.44s), **replacing** the phase-1 bob-offset — working farmers/Pip swing their tool like the NPCs. New `action-swing.test.ts` guards A≠B + head-identical + 16×16.
> - **Phase 3:** walk resolution moved render-side. The snapshot now carries a semantic `moving` flag (`SnapshotSprite.moving`); `frame` is the direction-less base look (no baked `/walk-a|b`). `resolveFrameAndBob` resolves facing + a **4-phase stride** (contact-a → passing → contact-b → passing) via the walk clip — reusing the three existing per-facing frames (the neutral = the passing pose), **no new art**. `pickFarmerFrame` retired → `isFarmerMoving` predicate. `copySprite` now propagates `moving` (and the pre-existing stale-`tintRgba`/`z` omission in that pooled copy is fixed). Walk is now wall-clock + decoupled from tick rate.
> - typecheck green (8 workspaces); engine 116 / sim-core 685 / farm-valley 152 / atlas-builder 15 tests green. **WebGPU-only won't render headless on this box → the swing + stride feel needs a user look before this moves to done/.** Optional follow-up: truly-distinct 4th/5th walk poses (the current 4-phase reuses existing art) — defer pending feel-check.

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

## Phase 2 — action `-a/-b` art (atlas) ✅ DONE 2026-06-12

Added `ACTION_TEMPLATES_B` to [templates.ts](../../../../tools/atlas-builder/src/recipes/templates.ts) (head/torso identical to the base pose; only the tool/arm moves — raised backswing for hoe/axe/pick, advanced water/seed stream; all tool pixels at rows ≥7 so the hat overlay never clips them). [recipes/index.ts](../../../../tools/atlas-builder/src/recipes/index.ts) generates `farmer/<p>/<action>-b` for all 5 personalities incl. Pip (35 frames). No `assets.test.ts` bump needed — these are *generated* frames, not files in `BASE_RECIPES` (which stays 215). [frames.ts](../../../../packages/sim-core/src/render-systems/frames.ts) alternates `pose ↔ pose-b` on the wall clock. Note: `ACTION_POSE` keys are intention names (`chop-tree`, `mine-stone`, `refill-can`), not the pose suffix.

## Phase 3 — render-side walk migration + 4-phase stride ✅ DONE 2026-06-12

Shipped **semantic walk state** on `SnapshotSprite` (`moving?: boolean`, `facing` kept) instead of the pre-baked `/walk-a|b` suffix; `frame` is now the direction-less base. [resolveFrameAndBob](../../../../packages/sim-core/src/render-systems/frames.ts) resolves facing + a 4-phase stride (`["/walk-a","","/walk-b",""]` walk clip, `""` = neutral passing pose) via `sampleCycle`, wall-clock + per-entity phase. `pickFarmerFrame` retired → `isFarmerMoving`. The interpolation path stays position-only; `copySprite` ([interp.ts](../../../../packages/farm-valley/src/worker/sim-client/interp.ts)) now propagates `moving` so a warm pool slot can't carry a stale walk state (same fix applied to the pre-existing `tintRgba`/`z` omission). **No new art** — the 4-phase cycle reuses the three existing per-facing frames; authoring genuinely distinct extra poses is a deferred optional follow-up. Determinism unaffected (render-only; the snapshot frame string isn't a sim output).

## Notes / guardrails

- Reuse the proven brief-04 implementation; don't re-derive `sampleAt` wrapping from scratch.
- Keep the engine primitive game-agnostic (no farm-valley imports); clips that name farm atlas frames live in `sim-core/render-systems`, not the engine.
- `nowMs` is passed in everywhere — never reintroduce `Date.now()` in sim-core/render-systems.
</content>

## Candidate consumer — animated season transitions (2026-06-12)

The seasonal-trees todo shipped INSTANT season swaps (`seasonalTreeFrame`, frames.ts).
The user asked for ANIMATED transitions instead. Deferred here as a flagship brief-85
consumer: a render-only cross-fade between the old and new seasonal frame over a short
window when `season` changes — for dynamic foliage (trees/bushes/orchard via
`resolveFrameAndBob`) and the baked big-tree (`pushBuildingSprites`, which would need
the big-tree drawn as a blendable sprite). Render-only / determinism-safe (season value
is tick-derived; the blend is wall-clock alpha, like idle-bob/sway). The baked grass tint
+ baked big-tree are the awkward part (single re-baked canvas) — would push the big-tree
to a dynamic sprite. Scope it with duration/easing when picking up brief 85.
