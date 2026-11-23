---
summary: The bench scenes read on real GPUs (brief 07): the Windows laptop's AMD iGPU on 2026-11-23, with each game's verdict against the 60 fps bar, where Farm's frame time goes, Hollow framed against direct, the heap, main-thread time outside the frame, an emulated-phone pass, and the phone estimate that replaces a phone reading.
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

**Farm meets the bar at its edge.** It drew 3,153–3,197 display ticks in 30 s against about 3,595 for
the other games, so about 13% of its frames take two 120 Hz refreshes, 16.7 ms. That makes its p95
exactly two refreshes. The "over 16.7" share (5.7–7.2%) is not a count of slower frames: the profiler
counts an interval strictly over 16.7 ms, and timestamp jitter puts about half the two-refresh intervals at
16.8 ms. Only 1–2 frames a run take over 33.3 ms, far under the 1% limit. Farm is CPU-bound: its frame
costs 6.1–6.3 ms of CPU on average and 10.2–12.0 ms at p95, against 2.6–2.7 ms of GPU. A frame that
costs more than 8.3 ms misses a 120 Hz refresh, while every frame fits 16.7 ms. So a 60 Hz display would
likely hold 60 fps, but no 60 Hz reading was taken.

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
Brief 16 (2026-11-23) removed the upload: the pools are instanced quads now, and Farm's headless bench
reads 0 texture bytes a frame, down from 4,096,000 at 1280×800. The laptop's GPU time before and after
is still an owner step.

### Hollow in the portal

Framed and direct agree: the same p95, GPU time within the spread between passes (2.7–2.8 against 2.6–2.7 ms),
and frame CPU a little lower framed. The canvas fills the frame exactly, 1905×893 at DPR 1, against
1920×945 direct. The 50 ms against 33 ms of 2026-11-03 ([portal.md](portal.md)) was SwiftShader under load.
Hollow keeps its frame.

### The heap, and a hitch early in Farm's sweep

Every game collects about every 2 s (9–16 drops in 30 s). Farm swings between 16 and 55 MB and MateQuest
between 13 and 69 MB, so both allocate fast, but a collection costs Farm 0.10 ms a frame on average. After
[brief 20](../briefs/done/20-fewer-allocations-per-frame.md) Farm allocates 1.54 MB a frame instead of 2.75 MB (heap drops 15 to 8 in the
headless bench) and MateQuest's map screen about a fifth of what it did; a real-GPU reading has not been retaken.

The heap is read inside the profiler's own `requestAnimationFrame` loop, once a second, so a gap between
heap samples is a long frame interval. All three Farm runs, the profiled one included, have one at the
same scene time: no display tick for 150–675 ms somewhere between 1.0 and 2.7 s into the run. It is the 1–2
frames over 33.3 ms each run counts, and the heap does not drop across it, so it is not a collection.
In the profiled run, the main thread sits idle through about 0.7 s around that time, woken only by small
tasks about every 50 ms, while no frame is scheduled. So the wait is outside JavaScript, in the GPU process
or the compositor. The usual suspects are ANGLE compiling a shader the first time a pass draws, and the
first upload of a large texture, but the CPU profile cannot tell which. A Chrome trace with the GPU
categories would. It stays well under the bar's 1%, but a player would see it as a hitch.

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
- **Hollow** spends 25 ms per interval at p95 while its own frame takes 4.5 ms. A CPU profile under the same
  slowdown places the rest: of 15.2 ms of main-thread time a frame, the 3D frame takes 5.7, native work the
  profile can't attribute 5.1, the HTML overlay 2.6 and the chronicle's DOM append 1.2. Handling the snapshot
  itself costs next to nothing (next section).

## Main-thread time outside the frame

CPU-profiled laptop runs of the three worker games (`laptop/*-cpu-profiled.json`,
`laptop/main-thread.txt`), means per frame in ms:

| Game | Main thread busy | The game's frame | Worker message handler | Native, unattributed |
|---|---:|---:|---:|---:|
| Citadel | 1.77 | 1.01 | 0.005 | 0.72 |
| Hollow | 3.56 | 1.30 | 0.60 | 1.01 |
| MateQuest | 2.02 | 1.22 | about 0 | 0.71 |

Hollow's handler stores the snapshot and passes the year's events to the chronicle. Storing costs about
0 ms. The 0.60 ms is the chronicle appending rows to the DOM, plus 0.53 ms a frame in `overlayFrame`, the
HTML overlay. The structured-clone copy of each snapshot runs in native code, inside the 1.01 ms the
profile can't attribute along with style and layout. So the snapshot's own cost has an upper bound but no
measurement, and a p95 needs a named timer around it. Brief 18 added them (`snapshot.post`, `snapshot.read`, `snapshot.apply`; headless bench on SwiftShader, timer step 0.1 ms): Hollow reads a snapshot in 0.30 ms on average (p95 0.6) and posts it in 0.27 ms, Citadel 0.09 and 0.11. See [frame-budget.md](frame-budget.md).

Citadel's handler receives the snapshot and feeds its interpolation in 0.005 ms a frame. Some Windows runs
between about 10:45 and 11:10 drew no frames at all; a rerun that failed the same way reported the page as
hidden, and every game ran normally when it was visible.

## The phone, estimated

The phone is not measured: the owner's call of 2026-11-23 ([decisions.md](decisions.md) → Frame budget)
is to assume its performance as a proportion of the laptop's. The estimate works from the work per frame,
not from intervals, which the 120 Hz display rounds to whole refreshes. The **assumed factor** is 4× for
both the CPU and the GPU: 4× is the CPU slowdown Chrome and Lighthouse use to stand in for a mid-tier
phone, and the GPU is taken to be the same. The factor and this method are the session's choices, not the
owner's. The CPU side comes from the emulated pass, which ran each game at a phone viewport with the CPU
slowed 4×; the viewport matters, because MateQuest's map screen draws 31,377 UI quads at p95 at 1920×945
and 8,479 at the phone's size. The GPU side is the laptop's **GPU headroom**, 16.7 ms divided by its GPU
p95. A game fits that phone when its emulated frame CPU p95 is under 16.7 ms and its GPU headroom is above 4×.

| Game | Frame CPU p95, emulated (4× CPU, phone viewport) | Laptop CPU headroom | GPU headroom | At an assumed 4× |
|---|---:|---:|---:|---|
| Farm | 65.7 ms | 1.4–1.6× | 4.0–4.5× | Misses by far on the CPU |
| Citadel | 6.4 ms | 13–17× | 3.6–5.5× | The CPU fits; the GPU straddles 4×, and its laptop GPU p95 moved from 3.0 to 4.7 ms between passes |
| Hollow | 6.8 ms | 9–11× | 3.5–3.8× | Its frame fits, but the main thread is busy 15 ms a frame with the DOM work outside it; the GPU sits just under 4× |
| MateQuest | 9.0 ms | 3.2× | 5.6–12× | Fits on both |

If the estimate were a gate, Farm would fail the phone bar.

What the estimate can't see: the phone's memory and GPU memory budget (the static-layer todo's concern), its
heat throttling, and the real factor of the owner's phone. That is why it never fires or closes a todo.
Driving the phone's Chrome over USB debugging would replace it with a reading.

## After brief 15 (2026-11-23, headless only)

The sprite sort no longer runs a comparator. On SwiftShader at 1280x800, Farm's `render.sort` went from a mean
of 0.67 ms and a p95 of 1.9 ms to 0.17 ms and 0.6 ms ([brief 15](../briefs/done/15-the-sprite-sort-under-1-ms.md)).
The laptop's reading of the same step is still to be taken.
