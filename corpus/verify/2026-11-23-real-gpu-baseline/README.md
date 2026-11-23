# Real-GPU readings on the laptop (2026-11-23, brief 07)

Bench results from the Windows laptop, the one measured reference device on
[frame-budget.md](../../wiki/frame-budget.md). The Android phone is not measured: the owner decided on
2026-11-23 to estimate it from the laptop. The reading of these files, and the estimate, are on
[real-gpu-readings.md](../../wiki/real-gpu-readings.md).

## How they were taken

- **Browser.** Windows Chrome 158 in a throwaway profile, driven over the DevTools protocol by
  [tools/bench-win.mjs](tools/bench-win.mjs), started with Windows `node.exe` from WSL. The window was
  maximized, and background, occlusion and timer throttling were off. Each run opened a game at
  `?bench&profile` and read `window.__benchResult` when the scene ended.
- **GPU.** Every file's `device.renderer` reads `ANGLE (AMD, AMD Radeon (TM) Graphics (0x00001681)
  Direct3D11 …)`. The display runs at 120 Hz, so an interval of 8.3 ms is one refresh and 16.7 ms is two.
- **Builds.** Farm, Citadel, Hollow and the portal came from production, whose asset hashes matched a
  fresh build of main that morning. MateQuest came from a local build of main served by
  `portal/scripts/serve-all.mjs`, because production did not have brief 12 yet. Each file's
  `benchSource` says which. Each `url` keeps only the path.
- **The machine** was in normal use, with VS Code open. Whether it ran on mains power was not recorded.
  From about 10:55 every Windows Chrome run drew no frames at all, in every game tried, which is what a
  locked screen or a sleeping display does. So Citadel has no CPU-profiled run here, and a Farm check
  then came back empty too. Citadel's headless bench still finished on main.

## Files

| File | What it is |
|---|---|
| `laptop/run-1/*.json`, `laptop/run-2/*.json` | Two passes of the four scenes, plus Hollow through the portal's play page (`hollow-framed`, read from the frame's `window`). In pass 2 Hollow framed ran before direct, so the two came back to back in both orders. |
| `laptop/run-3/citadel.json` | A third Citadel run. Run 2 had one frame over 33.3 ms and a 1.3 s gap in the heap samples that run 1 did not, so it was repeated. Run 3 matches run 1. |
| `laptop/farm-cpu-profiled.json` | One more Farm run with Chrome's CPU profiler on. The profiler slows the frame by about 5%, so it is **not** part of the baseline. |
| `laptop/farm-cpu-profile.txt` | That profile split by function, in milliseconds per frame (mean), mapped to source through the build's source maps by [tools/attrib.mjs](tools/attrib.mjs). |
| `laptop/hollow-cpu-profiled.json`, `laptop/mathquest-cpu-profiled.json`, `phone-emulated/hollow-cpu-profiled.json` | CPU-profiled runs of the worker games, for the main thread's time outside the frame. Not part of the readings tables. |
| `laptop/main-thread.txt` | Those three profiles as main-thread milliseconds per frame: top-level tasks and the worker message handler, by [tools/mainthread.mjs](tools/mainthread.mjs). The third block is the emulated Hollow run. |
| `phone-emulated/*.json` | One pass on the laptop with Chrome's device emulation: Pixel 7 metrics in landscape (915×412 CSS px, DPR 2.625), touch, an Android user agent and the CPU slowed 4×. **Not a phone reading.** The GPU is the laptop's. Each file carries an `emulation` block saying so. |
| `headless-1280x800/*.json` | `npm run bench` on main in headless Chromium (SwiftShader) at 1280×800, for the counter budgets. Frame times read `gpu-not-real`. |
| `tools/summarize.mjs` | Prints one block per result file: intervals, GPU, heap cadence, timers and counters. |

## Not used

The owner's own Hollow file from the same morning is not here. It has no `scene` field and covers
20.6 s, so it was the profiler's **Export profile** saved partway through the run, not the bench's
**Save bench result**. It also holds a stall of about 1.7 s between 15 s and 17 s. Its renderer and GPU time
agree with the runs above.

## Rerunning

From WSL, with Windows Chrome and Windows Node installed:

```bash
node.exe "$(wslpath -w tools/bench-win.mjs)" '[{"name":"hollow","url":"<site>/hollow/?bench&profile"}]'
```

Each run prints one `RESULT <name> <json>` line. A run object may add `"frame": true` (read the result from
the portal's frame), `"phone": true` (the emulation above) or `"cpuProfile": true` (also prints a
`PROFILE` line). From the repo root, after building the same commit, `node <this folder>/tools/attrib.mjs <file.cpuprofile> <fps>
[<game client dist>]` splits a profile by function (the dist defaults to Farm's), and
`node <this folder>/tools/mainthread.mjs <file.cpuprofile> <result.json> <game client dist>` gives the main
thread's time per frame.
