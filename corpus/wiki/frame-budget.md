---
summary: The 60 fps rule (the bar, the reference devices, the metric), the counter budgets per bench scene, the 2026-11-20 asset pick and the three decisions it reverts, the brief order 05-23, and the former measure-first todos, all promoted to briefs on 2026-11-23, with the laptop's reading against each trigger.
updated: 2026-11-23
---

# Frame budget: holding 60 fps

The owner set the goal on 2026-11-20: every game holds at least 60 fps, built the way the industry
builds it. This page is the plan. The numbers go on
[performance-measurements.md](performance-measurements.md), and the older optimization backlog on
[performance.md](performance.md) is history from before the WebGL2 migration.

## Why measuring comes first

The last real-GPU readings are from before the WebGL2-only renderer (2026-08-18): 99 fps on
2026-06-12, and 57 fps with every Farm panel open on 2026-07-15. Every reading since then ran on
SwiftShader, a CPU rasteriser, whose frame times this repo has twice learned not to trust. So nobody
knew whether any game missed 60 fps on real hardware. The first three briefs build the
measurement. Until 2026-11-23 nothing that only helps speed got built before a number said it was
needed; since then the owner wants light optimizations built anyway, so long as each is not too heavy,
complex or wide ([decisions.md](decisions.md) → Frame budget).

The laptop's reading came in on 2026-11-23 ([real-gpu-readings.md](real-gpu-readings.md)). Citadel,
Hollow and MateQuest meet the bar with room to spare. Farm meets it at its edge, and its frame is CPU-bound.
The same day the owner decided the phone is estimated from the laptop, not measured (below).

## The bar

- **The rule.** In each game's bench scene ([brief 06](../briefs/done/06-a-bench-scene-in-every-game.md);
  the four scenes and how to run them are on [bench-scenes.md](bench-scenes.md)),
  on each reference device, the frame interval's 95th percentile is at most 16.7 ms, and fewer than
  1% of frames take longer than 33.3 ms. A 120 Hz display does not raise the bar. The rule stays 60 fps.
- **The reference devices.**
  - The Windows 11 laptop with the AMD Radeon integrated GPU (Chrome, ANGLE on Direct3D 11), the
    machine behind the 2026-06-12 and 2026-07-15 readings. It is the one measured device.
  - The owner's Android phone, in Chrome, **estimated from the laptop since 2026-11-23** (the owner's
    call, [decisions.md](decisions.md) → Frame budget). The estimate assumes a phone 4× slower than the
    laptop: the CPU side is the frame's CPU p95 with the CPU slowed 4× at a phone viewport, the GPU side the
    laptop's GPU headroom (16.7 ms over its GPU p95) against 4×. It informs; it never fires or closes a todo.
- **What a builder can check.** Builders run in a sandbox where WebGL is SwiftShader, so their
  frame times mean nothing. A brief's Acceptance uses counters that don't depend on the GPU: draw
  groups, GL calls, texture bytes uploaded, UI quads and the CPU milliseconds of named steps. The
  real-GPU reading is an owner step.
- **The budgets per scene** (draw groups, texture megabytes, UI quads) are below. They were set by
  [brief 07](../briefs/done/07-the-real-gpu-baseline.md).

## Budgets per scene

The headless gate a brief's Acceptance can check: `npm run bench` at 1280×800 on SwiftShader, read as
the mean per frame. Each ceiling is the value measured on main on 2026-11-23 plus 20%, rounded
([verify/2026-11-23-real-gpu-baseline/headless-1280x800/](../verify/2026-11-23-real-gpu-baseline/headless-1280x800/)).
Texture bytes and UI quads change with the viewport, so the ceilings hold at 1280×800 only. Farm's
light overlay uploaded 4.10 MB a frame there and 7.26 MB at 1920×945 until brief 16 drew it on the GPU.

| Scene | Draw groups | UI quads | Texture MB uploaded a frame | Measured |
|---|---:|---:|---:|---|
| Farm | 1 | 2,200 | 4.9 | 1 group, 1,819 quads, 4.10 MB (0 MB since brief 16; the ceiling keeps its slack) |
| Citadel | 1 | 910 | 0 | 1 group, 760 quads, 0 MB |
| Hollow | n/a (3D) | n/a | 0 | 0 MB; its 35.6 GL draw calls get a ceiling of 43 instead |
| MateQuest | 0 | 5,900 (soft) | 0 | 0 groups, 4,890 quads, 0 MB |

MateQuest's UI quad ceiling is soft. Its scene moves to the next screen every 30 display ticks, and the
map screen draws about 20,000 quads against the combat screen's few thousand. So the mean depends on how
many ticks SwiftShader manages in 30 s: 270 on 2026-11-23 (mean 4,890) and 360 on 2026-11-21 (mean 3,888).
Compare two MateQuest runs only when their `sceneReport` screen counts match.

## The asset pick (2026-11-20)

Frame rate depends on what the cook produces, how many textures and how large, not on how the art
is written. A decision about art gets reverted only if it costs frames or blocks art work.

**Kept.** Art stays source code: a sprite is a `PixelRecipe` grid of palette characters, baked at
build time. Each game keeps its fixed palette and the guard test. Both cost nothing at run time, and
both let agents write and review art as text. Studios separate authoring units from runtime textures
the same way: authoring files stay small for diffs, and the cook packs them into a few big pages.

**Reverted.** Three decisions:

1. **Farm's six sheets as six runtime textures.** [asset-pipeline.md](asset-pipeline.md) said to
   keep six sheets and never merge them, for the per-sheet cache. Under WebGL2 the renderer batches
   per texture, and the 2026-09-19 probe counted 49 draw groups against a floor of 4. Layer 40 alone
   makes 40 of them, because world dressing alternates between the `props` and `buildings` sheets.
   The sheets stay as authoring and cache units, and the cook packs them into one page texture
   ([brief 10](../briefs/done/10-one-runtime-atlas-page-per-game.md)).
2. **An atlas builder only Farm can use.** `tools/atlas-builder` imports Farm's recipes and writes
   into Farm's client, so MateQuest's combat art is drawn from rectangles every frame. The cook takes
   any game's recipe set ([brief 09](../briefs/done/09-the-atlas-cook-serves-every-game.md)).
3. **Farm's uncapped render loop.** Brief 84 (2026-06-12) kept `setTimeout(renderFrame, 0)` for
   input latency, accepting that about 40% of frames are never shown on a 60 Hz display. Those frames
   still cost CPU, GPU and battery, which matters on the Android phone, and the timer drifts against
   the display. `requestAnimationFrame` is the browser's frame clock, and the other three games
   already use it ([brief 08](../briefs/done/08-farm-renders-on-request-animation-frame.md), reverted
   2026-11-21).

**sprite-gen.** Of [sprite-gen](../todos/closed/2026-11-20-sprite-gen-research.md), the checks are
borrowed as tests now ([brief 11](../briefs/done/11-recipe-checks-as-tests.md)). Its `pixel-draw`
verb gets a blind trial against an agent writing the recipe directly
([brief 13](../briefs/todo/13-the-sprite-gen-pixel-draw-trial.md)), and the winner draws MateQuest's
combat sprites ([brief 14](../briefs/todo/14-mathquest-combat-sprites-as-pixel-art.md)). The tool
is never installed in this repo or its build.

## The briefs, in order

One builder works in this repo at a time, so `Depends on` sets the order. Briefs 08 and 10 don't
wait for the sitting in 07. If the owner wants a real-GPU reading from before those two reverts, the
sitting comes right after 06.

| Brief | What it delivers | Depends on |
|---|---|---|
| [05](../briefs/done/05-one-frame-profiler-in-every-game.md) | One frame profiler in all four games: percentiles, long frames, GPU time where the browser exposes it, one export format | none |
| [06](../briefs/done/06-a-bench-scene-in-every-game.md) | A scripted, seeded bench scene per game and a headless runner for the counters | 05 |
| [07](../briefs/done/07-the-real-gpu-baseline.md) | The real-GPU readings recorded, with budgets set and todos promoted. Done 2026-11-23 on the laptop; the phone is estimated, not measured | 06 and the owner |
| [08](../briefs/done/08-farm-renders-on-request-animation-frame.md) | Farm renders on `requestAnimationFrame` | 05 |
| [09](../briefs/done/09-the-atlas-cook-serves-every-game.md) | The atlas cook takes any game's recipe set, with Farm's output unchanged | none |
| [10](../briefs/done/10-one-runtime-atlas-page-per-game.md) | One runtime page per game, so Farm's world sprites draw as one group, not 49 | 09 |
| [11](../briefs/done/11-recipe-checks-as-tests.md) | Stray-pixel, floor-row and corner checks on every recipe | 09 |
| [12](../briefs/done/12-mathquest-draws-combat-sprites-from-an-atlas.md) | MateQuest's seven combat sprites become recipes on an atlas | 10 |
| [13](../briefs/todo/13-the-sprite-gen-pixel-draw-trial.md) | A blind trial of `pixel-draw` against an agent writing recipes | 11, 12 and the owner |
| [14](../briefs/todo/14-mathquest-combat-sprites-as-pixel-art.md) | MateQuest's combat sprites redrawn as real pixel art | 13 |
| [15](../briefs/done/15-the-sprite-sort-under-1-ms.md) | The per-frame sprite sort under 1 ms, with today's order kept exactly. Done 2026-11-23: Farm's headless `render.sort` p95 1.9 ms to 0.6 ms. Promoted from a todo by 07's laptop reading | none |
| [16](../briefs/done/16-the-light-overlay-drawn-on-the-gpu.md) | Farm's light pools as instanced quads, with no full-canvas upload. Done 2026-11-23: texture bytes a frame 4,096,000 to 0 | none |
| [17](../briefs/done/17-the-ghost-check-on-a-grid.md) | The occluder ghost check on a uniform grid, same results. Done 2026-11-23: 101 ms to 2.4 ms on a worst-case scene (300 occluders, 4,000 sprites), grid only when the scan has 20,000 tests or more of work, so Farm keeps the scan (0.007 ms); `render.ghost` recorded in Farm | 15 |
| [18](../briefs/todo/18-worker-snapshots-timed-and-transferred.md) | Snapshot timers in the three worker games, and typed-array transfer in the costliest | none |
| [19](../briefs/todo/19-hollow-culls-what-the-camera-cannot-see.md) | Frustum culling of Hollow's instances | none |
| [20](../briefs/todo/20-fewer-allocations-per-frame.md) | The top allocation sites per frame in Farm and MateQuest removed | 15, 16 |
| [21](../briefs/todo/21-a-tile-chunk-ground-spike-in-farm.md) | A spike: Farm's ground as tile chunks behind `?tilechunks`, measured against today | none |
| [22](../briefs/todo/22-animations-declared-with-the-recipes.md) | Animations declared with the recipes and cooked into the manifest; one Farm clip moved | none |
| [23](../briefs/todo/23-recipes-to-png-and-back.md) | Recipe export to an indexed PNG and import back, for pixel editors | none |

## The measure-first todos (all promoted 2026-11-23)

Each todo named the number that would promote it to a brief, and brief 07 checked every trigger against the
real-GPU readings: the laptop's of 2026-11-23 is the third column
([real-gpu-readings.md](real-gpu-readings.md)); the phone is not measured. Only the sprite sort fired. On
2026-11-23 the owner promoted the other eight anyway, as light optimizations
([decisions.md](decisions.md) → Frame budget). The last column names each brief.

| Todo | Promote when | Laptop, 2026-11-23 | Brief |
|---|---|---|---|
| [Static layer as tile chunks](../todos/2026-11-20-static-layer-as-tile-chunks.md) | The static layer's GPU time or memory breaks the bar on a reference device | Not fired. GPU 2.6–2.7 ms a frame in Farm and 1.6–2.7 ms in Citadel on average; both frames are CPU-bound. Phone not measured | [21](../briefs/todo/21-a-tile-chunk-ground-spike-in-farm.md) |
| [Sprite sort only on change](../todos/2026-11-20-sprite-sort-only-on-change.md) | The per-frame sort takes more than 1 ms at p95 in a bench scene | **Fired: [brief 15](../briefs/done/15-the-sprite-sort-under-1-ms.md).** `compareSprite` alone 1.07 ms a frame on average in Farm (CPU profile) | [15](../briefs/done/15-the-sprite-sort-under-1-ms.md) |
| [Ghost pass scan](../todos/2026-11-20-ghost-pass-scan.md) | The occluder ghost check takes more than 1 ms at p95 | Not fired. `_ghostCovered` about 0 ms in Farm's profile; Citadel's whole `render.endFrame` is 0.6–0.8 ms at p95. Built anyway on the owner's call: **[brief 17](../briefs/done/17-the-ghost-check-on-a-grid.md)**, the grid | [17](../briefs/done/17-the-ghost-check-on-a-grid.md) |
| [Worker snapshot transfer](../todos/2026-11-20-worker-snapshot-transfer.md) | Receiving and applying a snapshot takes more than 2 ms at p95 on the main thread | Not fired on what a CPU profile can see. Receiving and storing a snapshot costs about 0 ms in all three worker games (Citadel 0.005 ms a frame); Hollow's message handler costs 0.60 ms a frame on average, nearly all of it the chronicle's DOM append. The structured-clone copy runs in native code the profile can't separate (at most 0.7–1.0 ms a frame of unattributed native time). A p95 needs a sub-timer | [18](../briefs/todo/18-worker-snapshots-timed-and-transferred.md) |
| [Hollow 3D culling](../todos/2026-11-20-hollow-3d-culling.md) | Hollow breaks the bar on the iGPU, or runs slower framed in the portal than direct | Not fired. p95 8.5 ms, GPU 2.6–2.8 ms, framed and direct the same | [19](../briefs/todo/19-hollow-culls-what-the-camera-cannot-see.md) |
| [Allocation-free frames](../todos/2026-11-20-allocation-free-frames.md) | Long frames line up with garbage-collection drops in the heap reading | Not fired. At most 2 frames a run over 33.3 ms in any game; collection costs Farm 0.10 ms a frame. Phone not measured | [20](../briefs/todo/20-fewer-allocations-per-frame.md) |
| [Animation tags in the manifest](../todos/2026-11-20-animation-tags-in-the-manifest.md) | The first animated MateQuest sprite, or the next new Farm animation | Not a measurement | [22](../briefs/todo/22-animations-declared-with-the-recipes.md) |
| [Recipe and PNG round trip](../todos/2026-11-20-recipe-and-png-round-trip.md) | Someone wants to edit art in a pixel editor such as Aseprite | Not a measurement | [23](../briefs/todo/23-recipes-to-png-and-back.md) |
| [Light overlay as a full-canvas upload](../todos/2026-11-21-light-overlay-full-canvas-upload.md) | Farm's light overlay (its canvas paint plus the upload) takes more than 1 ms at p95, or the GPU time drops by more than 1 ms with it off. Measured on SwiftShader by brief 05: 4,096,000 bytes uploaded every frame at 1280×800 | Not fired on the CPU: 0.16 ms a frame on average, upload call included, for 7,257,600 bytes a frame at 1920×945. The GPU half needs a run with the overlay off. Phone not measured | [16](../briefs/done/16-the-light-overlay-drawn-on-the-gpu.md) |

## Checked and dropped

- **Weather particle caps.** [performance.md](performance.md) lists uncapped spawns and an O(n)
  `splice`. Both are gone: `particles.ts` caps its pool at 512 and no longer splices, and rain now
  goes through `RainField` (`rain-field.ts`), which caps its drops at 900.
- **Texture compression (KTX2, Basis).** It is lossy, and pixel art needs exact colours. It would
  only help a large painted image, and no game draws one.
- **Mipmaps.** Off for pixel art, as [asset-pipeline.md](asset-pipeline.md) says.
- **A binary snapshot codec for Farm's WebSocket.** Measured on 2026-06-10: deflate already makes
  the bytes cheap, and parsing them takes little time next to the frame.
