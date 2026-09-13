# audit-25 — Farm's `renderFrame` is a 700-line function sharing mutable state across a dozen concerns

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Citadel already demonstrates the target shape at comparable size.

## The problem

[games/farm/client/src/main/render-loop.ts:262-981](../../games/farm/client/src/main/render-loop.ts#L262-L981)
— `renderFrame` is effectively the whole file's body, inlining: camera/pan easing, weather-particle
spawning, sprite pushing for buildings / bridges / decor / water / fish, day-night wash computation, and
~12 UI surfaces (world clock, right column, hotbar, playback controls, leaderboard, inventory modal, hover
tooltip, world-anchored inspect card, diegetic HUD, farm marker, help modal, game-over screen) as
sequential imperative code over one function's mutable locals.

The whole file has only 4 sub-extractions (`spawnRainSplash`, `applyToolCursor`, `renderFrame`, one local).

**Contrast, deliberately:** [citadel-renderer.ts](../../games/citadel/client/src/render/citadel-renderer.ts)
is 821 lines — comparable — but organised as 9 small named exports (`pushBuilding`, `pushScene`,
`pushNetworks`, `pushGhost`, `pushCatchment`, `pushLightPool`, `pushFire`, `pushAmbientCrowd`), each
independently testable. That is the "long but cohesive" case and is **not** a defect. Farm's is the other kind.

## Failure scenario

Changing one concern means reasoning about state threaded through 700 lines: `interpolatedSprites`,
`farmerPositions`, `dt`, `sx`, camera state, `hitstopFramesLeft` are all in one scope. A change to the
leaderboard toggle can alter hitstop timing 300 lines away because both read and write the same locals.
There is no test coverage of the render loop itself, so nothing would catch it.

This file is also a churn hotspot (9 touches in the last 200 commits) — the risk is realised repeatedly,
not theoretical.

## Fix sketch

Split `renderFrame` into per-concern functions taking **explicit parameters** rather than closing over
locals — e.g. `renderWeather(dt, …)`, `pushWorldDecor(sprites, camera)`, `renderUiPanels(tree, prefs)`,
`renderWorldAnchoredCards(sprites, camera)`. Same file is fine; this is Farm-only and correctly scoped to
`@farm/client`. Follow Citadel's named-function shape.

Do it in slices, verifying in the browser between each — not as one 700-line rewrite. Suggested order:
weather → world decor → world-anchored cards → UI panels. Stop and ship whatever slices are clean if one
turns out to be genuinely entangled; say which in the close-out.

## Files you OWN
- [games/farm/client/src/main/render-loop.ts](../../games/farm/client/src/main/render-loop.ts)
- new sibling modules if a concern is large enough to deserve its own file
- new tests for any extracted pure function

## Files you must NOT touch
- `@farm/sim-core` and the snapshot protocol — render-only
- the interpolation/alpha logic (that is [audit-18](2026-09-13-audit-18-engine-render-interpolation-promotion.md))
- draw **order**. Z-order and overlay sequence are behaviour; extraction must preserve the exact sequence.

## Acceptance
- `renderFrame` becomes a short orchestrator calling named functions; report the before/after line count of
  the largest function in the file.
- **No visual or behavioural change**, verified in a real browser (`npm run dev`): day/night wash, weather,
  hitstop, camera easing, every one of the ~12 UI surfaces, hover tooltips, and the game-over screen all
  behave as before. Pixel-snapping and camera smoothing must be untouched.
- `npm run test -w @farm/client` green.
