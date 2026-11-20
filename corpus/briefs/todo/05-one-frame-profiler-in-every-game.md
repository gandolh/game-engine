# Task 05: one frame profiler in every game

**Origin:** the owner, 2026-11-20: hold at least 60 fps and follow industry practice. The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Depends on:** nothing.

## Context

Each game measures itself differently today:

- **Farm** has the full `?profile` set: the engine `Profiler`, the `DebugOverlay`, sub-timers,
  draw-group counters and an export button (`games/farm/client/src/main/profile-export.ts`).
- **Hollow** builds a `Profiler` in `render3d/app.ts`.
- **MateQuest** keeps its own ring of UI-pass timings behind `?profile` in `main.ts`.
- **Citadel** has nothing.

None of them reports the frame interval's percentiles, the share of long frames or the GPU's own
time. The CPU timer misses whatever the GPU does after the JavaScript returns. The 2026-06-11
profile lost about 10 ms per frame that way.

This brief gives all four games one profiler, one overlay and one export format. Brief 06 builds the
bench scenes on top of it, and brief 07 reads them on real hardware.

## Files you OWN

- `engine/core/src/debug/` (the profiler, the overlay, a new frame-stats module and its tests)
- `engine/core/src/render/webgl2/` and `engine/core/src/render3d/webgl2/`: only GPU timer-query
  plumbing and draw counters, no change to what is drawn
- Each game client's profile wiring: Farm's `main/profile-export.ts`, `main/render-loop.ts` and
  `main/config.ts`; Citadel's `main/render-loop.ts` and `main/boot.ts`; Hollow's `render3d/app.ts`;
  MateQuest's `main.ts`
- `corpus/` pages for this brief: the outcome, `log.md`, [performance-measurements.md](../../wiki/performance-measurements.md)
  ("Measuring" section), and the `decisions.md` entry below

## Files you must NOT touch

- Any `sim-core` package, the servers and the protocols: profiling is render-side only.
- What any game draws. Everything new stays behind `?profile` and costs nothing when it is off.

## What to do

1. **Frame stats in the engine.** Add a frame-stats module next to `Profiler`. It counts two things
   apart: display ticks, from `requestAnimationFrame` callbacks, and frames drawn. They differ in
   Farm until brief 08, because its loop draws on a timer. From the display ticks it reports:
   - the frame interval at p50, p95 and p99;
   - the share of frames over 16.7 ms and over 33.3 ms;
   - frames per second.

   From the frames drawn it reports the CPU frame time, which the `frame` timer already measures, and
   frames drawn per second. Pure functions, unit-tested.
2. **GPU time where the browser allows it.** Probe for `EXT_disjoint_timer_query_webgl2` and wrap
   each frame's draw in a `TIME_ELAPSED_EXT` query. Read results a few frames later without
   stalling, and throw away a result when `GPU_DISJOINT_EXT` is set. Without the extension the export
   says `gpu: "unavailable"` and everything else works. Test both paths with a fake GL context.
3. **Heap reading where the browser allows it.** Record `performance.memory.usedJSHeapSize` once per
   second when it exists (Chrome). A drop marks a garbage collection. Mark the field as unavailable
   elsewhere.
4. **One export format.** Use the schema `game-engine-profile/1`, which Farm's export grows into:
   - the game, the build, the URL and the seed;
   - the GPU renderer string from `WEBGL_debug_renderer_info`, the DPR the engine uses and the
     canvas size;
   - the frame stats, the GPU stats and the heap samples;
   - every named timer's mean and p95;
   - the counters: draw groups, GL draw calls, UI quads and texture bytes uploaded.

   `window.__exportProfile()` returns it, and the overlay's export button saves it as JSON. Keep
   Farm's existing export fields, either inside the schema or as an extra block.
5. **Counters for every renderer.** The 2D renderer already has `lastDrawStats` and `lastUiFlush`.
   Add the same for the 3D renderer (draw calls and instances per frame) and count bytes uploaded by
   `texImage2D` and `texSubImage2D` in both renderers.
6. **Wire all four games.** `?profile` turns on the overlay and the export in Farm, Citadel, Hollow
   and MateQuest. It works in production builds, as Farm's does today: don't gate it on
   `import.meta.env.DEV`, because brief 07 reads it on the deployed games. MateQuest's UI-pass ring becomes named timers in the shared profiler. Hollow's HUD
   and Farm's sub-timers stay, under the shared names.
7. **Record the bar.** Add a "Frame budget" entry to [decisions.md](../../wiki/decisions.md). It
   gives the rule, the reference devices, why builders gate on counters, and a link to
   [frame-budget.md](../../wiki/frame-budget.md).

## Acceptance

- Unit tests cover the percentile and long-frame maths, the timer-query path with and without the
  extension (fake GL), and a disjoint result being dropped.
- In headless Chromium, each of the four games at `?profile` returns an export from
  `window.__exportProfile()` that matches `game-engine-profile/1`, with `gpu: "unavailable"` allowed.
  Save the four exports under `corpus/verify/` for this brief.
- With `?profile` off, no game creates a timer query or keeps frame samples. A test checks it for
  the engine; for the games, a code read is enough.
- `npm run check` and `npm run gates` exit 0, and `bash corpus/lint.sh` passes.

## Owner steps

- None needed to close this brief. Brief 07 is the real-GPU sitting.
