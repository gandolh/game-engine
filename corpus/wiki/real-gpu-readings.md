---
summary: The bench scenes read on real GPUs (brief 07): the Windows laptop's AMD iGPU on 2026-11-23, with each game's verdict against the 60 fps bar, where Farm's frame time goes, Hollow framed against direct, the heap pattern, an emulated-phone pass for leads, and what the Android phone half still needs.
updated: 2026-11-23
---

# Real-GPU readings

The bar, the reference devices and the todo triggers are on [frame-budget.md](frame-budget.md); how a
scene runs is on [bench-scenes.md](bench-scenes.md). Brief 07 calls these readings "the real-GPU
baseline". They are not a **baseline** in the [glossary](glossary.md)'s sense, the byte-exact output of a
seeded headless run. Every file named here is in
[verify/2026-11-23-real-gpu-baseline/](../verify/2026-11-23-real-gpu-baseline/), whose README says how
they were taken.

## The laptop (2026-11-23)

Windows Chrome 158, ANGLE on Direct3D 11, the AMD Radeon iGPU, a maximized window at DPR 1 and a
**120 Hz display**: an interval of 8.3 ms is one refresh, and 16.7 ms is two. Farm, Citadel, Hollow and the
portal ran from production builds identical to main. MateQuest ran from a local build of main, since
production did not have brief 12 yet. Two passes per scene, plus a third for Citadel. Ranges are the
spread across passes.

| Scene | Canvas | Interval p50 / p95 / p99 ms | Over 16.7 | Over 33.3 | Frame CPU mean / p95 ms | GPU mean / p95 ms | Heap MB |
|---|---|---|---|---|---|---|---|
| Farm | 1920×945 | 8.4 / 16.7 / 16.8 | 5.73–7.23% | 0.03–0.06% | 6.1–6.3 / 10.2–12.0 | 2.6–2.7 / 3.8–4.2 | 16–55 |
| Citadel | 1920×920 | 8.3 / 8.4–8.5 / 8.5–8.6 | 0–0.03% | 0–0.03% | 0.8–0.9 / 1.0–1.3 | 1.6–2.7 / 3.0–4.7 | 8–15 |
| Hollow, direct | 1920×945 | 8.3 / 8.5 / 8.6–8.7 | 0.03–0.11% | 0% | 1.0–1.1 / 1.5–1.8 | 2.6–2.7 / 4.4–4.7 | 5–17 |
| Hollow, in the portal | 1905×893 | 8.3 / 8.4–8.5 / 8.7–8.8 | 0–0.08% | 0% | 0.9–1.0 / 1.3–1.6 | 2.7–2.8 / 4.5–4.8 | 4–18 |
| MateQuest | 1920×945 | 8.3 / 8.4–8.5 / 8.6 | 0.03–0.22% | 0% | 1.1–1.2 / 5.2–5.3 | 1.0–1.1 / 1.4–3.0 | 13–69 |

"Frame CPU" is `frames.drawn`: the main-thread time of the game's own frame. "GPU" is the timer query.

**Citadel, Hollow and MateQuest meet the bar with room to spare.** Their p95 is one 120 Hz refresh,
and no run has more than one frame over 33.3 ms. Their GPU time is under 3 ms on average.

**Farm is on the line.** Its p95 is 16.7 ms, but 5.7–7.2% of intervals are over 16.7 ms, so the
true 95th percentile sits just above it. On a 120 Hz display, a frame that misses one refresh lands on the
next at 16.7 ms, so Farm keeps falling back to 60 Hz pacing: 105–107 fps against 120. Only 1–2 frames a
run take over 33.3 ms, far under the 1% limit. Farm is CPU-bound: its frame costs 6.1–6.3 ms of CPU
on average and 10.2–12.0 ms at p95, against 2.6–2.7 ms of GPU. The work in a frame fits 16.7 ms, so a
60 Hz display would likely hold 60 fps, but no 60 Hz reading was taken.

### Where Farm's frame goes

One more Farm run with Chrome's CPU profiler on (`laptop/farm-cpu-profile.txt`). These are means per
frame, not p95, and the profiler slows the frame by about 5% (6.5 ms against 6.1–6.3).

| Step | ms per frame | Notes |
|---|---:|---|
| `render.endFrame` | 3.1 | `compareSprite` alone 1.07; the sort loop and batch building 0.67 (`endFrame`'s own time); `_packSprite` 0.37; UI quad packing 0.42; the light overlay 0.16 including its 0.11 ms `texImage2D` call; `_ghostCovered` about 0 |
| UI panels | 1.5 | the right column 0.66, the hotbar 0.34, the world-anchored cards 0.46. Of those 0.46, the diegetic HUD takes 0.44, and 0.39 of that is `worldPerCssX`'s own time, reached through `worldToCanvasCss` |
| `pushSprites` | 1.0 | `pushSnapshotSprites` |
| Garbage collection | 0.10 | |

Farm sorts 2,089 sprites a frame on average and 4,638 at p95, at the widest zoom. A comparator that costs
1.07 ms at the mean costs more than twice that on the widest frames.

The light overlay uploads 7,257,600 bytes every frame, the whole 1920×945 canvas. On the main thread it
costs 0.16 ms. The upload's cost on the GPU side was not measured: that needs a run with the overlay off.

### Hollow in the portal

Framed and direct agree: the same p95, GPU time within the spread between passes (2.7–2.8 against 2.6–2.7 ms),
and frame CPU a little lower framed. The canvas fills the frame exactly, 1905×893 at DPR 1, against
1920×945 direct. The 50 ms against 33 ms of 2026-11-03 ([portal.md](portal.md)) was SwiftShader under load.
Hollow keeps its frame.

### The heap

Every game collects about every 2 s (9–16 drops in 30 s). Farm swings between 16 and 55 MB and MateQuest
between 13 and 69 MB, so both allocate fast, but a collection costs Farm 0.10 ms a frame on average, and long
frames are too rare to line up with anything. Both Farm passes show a 1.2–1.7 s gap between heap samples
at 1.0–2.7 s into the run, with no drop across it. The sampler is a timer, and Farm's opening sweep keeps the
main thread busy enough to starve it. Neither pass shows a long frame there.

## Emulated phone (not a reading)

A pass on the laptop with Chrome's device emulation: Pixel 7 metrics in landscape (915×412 at DPR 2.625,
canvas 1830×824 after the games' DPR cap of 2) and the CPU slowed 4×. The GPU is still the laptop's,
so these numbers settle no trigger and no phone row. They only show where to look.

| Scene | Interval p50 / p95 / p99 ms | Over 33.3 | Frame CPU mean / p95 ms |
|---|---|---|---|
| Farm | 50.0 / 83.4 / 108.4 | 80.7% | 37.3 / 65.7 |
| Citadel | 8.3 / 16.6 / 16.8 | 0% | 4.5 / 6.4 |
| Hollow | 8.4 / 25.0 / 33.4 | 1.9% | 4.5 / 6.8 |
| MateQuest | 8.3 / 16.7 / 16.8 | 0.03% | 3.5 / 9.0 |

- **Farm** drops to 20 fps on a 4× slower CPU: UI panels 12.6 ms (35.4 at p95), `render.endFrame` 16.9
  (33.9), `pushSprites` 6.6. If the phone's CPU is anything like that, Farm misses the bar on it by a wide margin.
- **Hollow** spends 25 ms per interval at p95 while its own frame takes 4.5 ms. The rest of the main-thread
  time is outside the frame: the worker's snapshot arriving and being applied, or the DOM chronicle. No timer
  covers either yet.

## The phone (still to do)

The Android half of brief 07 is the owner's: run the four scenes in Chrome on the phone against
production and save each result. Production matched main on 2026-11-23 except MateQuest, so
`node cli.ts mathquest deploy` comes first.
