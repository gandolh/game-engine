# Task 08: Farm renders on requestAnimationFrame

**Origin:** the owner, 2026-11-20: hold at least 60 fps, follow industry practice, and revert old
decisions where that helps. This brief reverts brief 84's call. The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Depends on:** brief 05, for the profiler that shows frames before and after.

## Context

Farm's game loop ends with `setTimeout(renderFrame, 0)` (`games/farm/client/src/main/render-loop.ts`).
Only the first frame goes through `requestAnimationFrame`, in `main.ts`. Brief 84 (2026-06-12) kept
the uncapped loop for input latency and accepted that about 40% of the frames it draws are never
shown on a 60 Hz display ([its spec](../../todos/closed/84-fps-regression-webgpu-reprofile.md)).

That call is reverted, for four reasons:

- **Wasted work.** Every frame the display never shows still costs CPU, GPU and battery. On the
  Android phone that is heat, and the throttling that follows takes frames away.
- **Jitter.** A timer loop drifts against vsync, so the frames that are shown are spaced unevenly.
  That reads as stutter even when the average is high.
- **No real gain.** `requestAnimationFrame` hands each frame a timestamp aligned to the display and
  pauses in a hidden tab. Input read at the start of a frame is at most one frame old, which is what
  every browser game ships with.
- **Consistency.** Citadel, Hollow and MateQuest already run on it.

## Files you OWN

- `games/farm/client/src/main/render-loop.ts`, `games/farm/client/src/main.ts`
- Their tests, or a new test for the loop's scheduling
- `corpus/` pages for this brief: the outcome, `log.md`, and the entry on
  [performance.md](../../wiki/performance.md) that records brief 84's choice, plus a
  [decisions.md](../../wiki/decisions.md) line under Renderer naming the revert and its reason

## Files you must NOT touch

- `games/farm/sim-core`, `games/farm/server` and the WebSocket protocol. The sim keeps its own pace
  on the server. Only the browser's draw loop changes.
- The camera, interpolation and input code beyond reading the rAF timestamp.

## What to do

1. **Schedule every frame with `requestAnimationFrame`** and use its timestamp as `nowMs`. Keep the
   0.1 s clamp on `dt`, so a frame after a hidden tab doesn't jump.
2. **Keep input fresh.** Read keyboard and pointer state at the top of the frame, as the loop does
   now, so input still lands in the next frame drawn.
3. **Keep one loop running.** Make sure no second loop survives the switch between the home screen,
   the loading screen and the game. Store and cancel the handle as `main.ts` does for its screens.
4. **Record the revert** in [decisions.md](../../wiki/decisions.md) (Renderer) and next to brief 84's
   note on [performance.md](../../wiki/performance.md), with the reasons above.

## Acceptance

- A test with a fake `requestAnimationFrame` and a fake clock shows exactly one `renderFrame` per
  callback, with no frames drawn between callbacks.
- In headless Chromium with `?profile`, the number of frames drawn per second matches the number of
  rAF callbacks per second, within 2%. Before the change it was higher. Put both numbers in the
  outcome.
- The loop stops when the game unmounts. Check it in the browser by switching between the home
  screen and the game twice and counting callbacks.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Play a minute of Farm with Pip on the laptop and say whether moving and clicking feel as quick as
  before.
- If brief 07 has run, repeat Farm's bench on both reference devices and keep the files next to the
  baseline.
- Deploy: the `farm-valley` stack's static client (`node cli.ts farm-valley deploy` from the
  vps-deploy checkout).
