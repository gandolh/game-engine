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

## Outcome (2026-11-21)

Done. [render-loop.ts](../../../games/farm/client/src/main/render-loop.ts) gained `animationFrameLoop(frame)`:
one `frame(nowMs)` per `requestAnimationFrame` callback with the callback's timestamp, the next frame
requested after this one is drawn, `start()` idempotent and `stop()` cancelling the pending handle.
`createRenderLoop` returns that loop instead of a self-scheduling `renderFrame`, and `main.ts` calls
`renderLoop.start()` once, after the home and loading loops it already cancels. `dt` keeps its 0.1 s
clamp (0 on the first frame), and keyboard input is still read at the top of the frame. No `setTimeout` is
left in the loop.

**Acceptance.**

- [render-loop.test.ts](../../../games/farm/client/src/main/render-loop.test.ts) drives the loop with a fake
  `requestAnimationFrame` and fake timers: exactly one frame per callback, with its timestamp; nothing drawn
  when the timers run between callbacks; one loop however often it is started; `stop()` cancels the pending
  frame, and a frame that stops the loop requests no other.
- Frames drawn and rAF callbacks per second, Farm's bench scene with `?bench&profile` in headless Chromium
  (SwiftShader), 30 s sampled:

  | Viewport | Before: rAF ticks/s | Before: drawn/s | After: rAF ticks/s | After: drawn/s |
  |---|---:|---:|---:|---:|
  | 480×300 | 18.97 | 13.32 | 13.30 | 13.30 (398 of 398) |
  | 1280×800 | 12.36 | 7.82 | 7.37 | 7.37 (220 of 220) |

  After the change they match exactly. **Before, the timer loop drew fewer frames than rAF fired, not
  more**, which is the reverse of what the brief expected. On SwiftShader a Farm frame costs more than a
  display interval, so the timer loop never got ahead of the display, and rAF callbacks ran between its long
  tasks. The brief's "more frames than shown" (brief 84's ~40% discarded) needs a machine where a frame fits
  in a refresh, such as the 2026-06-12 laptop reading; brief 07's sitting is where that shows. The draws per
  second didn't drop (13.32 to 13.30 at 480×300).
- One loop: home screen then game, twice (a new run is a page load; Farm has no way back to the home screen
  within a page), counting rAF callbacks by function name for 3 s each. Home: `renderHome` 181 both times.
  Game: `tick` (the loop's callback) 36 and 38, and no `renderHome` or `renderLoading` left.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

The revert is a Renderer line on [decisions.md](../../wiki/decisions.md) and a note beside brief 84's on
[performance.md](../../wiki/performance.md).

