---
summary: The 60 fps rule (the bar, the reference devices, the metric), the 2026-11-20 asset pick and the three decisions it reverts, the brief order 05-14, and the measure-first todos with the trigger that promotes each.
updated: 2026-11-21
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
knows today whether any game misses 60 fps on real hardware. The first three briefs build the
measurement, and nothing that only helps speed gets built before a number says it is needed.

## The bar

- **The rule.** In each game's bench scene ([brief 06](../briefs/done/06-a-bench-scene-in-every-game.md);
  the four scenes and how to run them are on [bench-scenes.md](bench-scenes.md)),
  on each reference device, the frame interval's 95th percentile is at most 16.7 ms, and fewer than
  1% of frames take longer than 33.3 ms. A 120 Hz display does not raise the bar. The rule stays 60 fps.
- **The reference devices.**
  - The Windows 11 laptop with the AMD Radeon integrated GPU (Chrome, ANGLE on Direct3D 11), the
    machine behind the 2026-06-12 and 2026-07-15 readings.
  - The owner's Android phone, in Chrome. Android is the phone this estate tests on.
- **What a builder can check.** Builders run in a sandbox where WebGL is SwiftShader, so their
  frame times mean nothing. A brief's Acceptance uses counters that don't depend on the GPU: draw
  groups, GL calls, texture bytes uploaded, UI quads and the CPU milliseconds of named steps. The
  real-GPU reading is an owner step.
- **The budgets per scene** (draw groups, texture megabytes, UI quads) come from the baseline in
  [brief 07](../briefs/todo/07-the-real-gpu-baseline.md), which writes them here.

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
| [07](../briefs/todo/07-the-real-gpu-baseline.md) | The owner's real-GPU sitting, recorded, with budgets set and todos promoted | 06 and the owner |
| [08](../briefs/done/08-farm-renders-on-request-animation-frame.md) | Farm renders on `requestAnimationFrame` | 05 |
| [09](../briefs/done/09-the-atlas-cook-serves-every-game.md) | The atlas cook takes any game's recipe set, with Farm's output unchanged | none |
| [10](../briefs/done/10-one-runtime-atlas-page-per-game.md) | One runtime page per game, so Farm's world sprites draw as one group, not 49 | 09 |
| [11](../briefs/done/11-recipe-checks-as-tests.md) | Stray-pixel, floor-row and corner checks on every recipe | 09 |
| [12](../briefs/done/12-mathquest-draws-combat-sprites-from-an-atlas.md) | MateQuest's seven combat sprites become recipes on an atlas | 10 |
| [13](../briefs/todo/13-the-sprite-gen-pixel-draw-trial.md) | A blind trial of `pixel-draw` against an agent writing recipes | 11, 12 and the owner |
| [14](../briefs/todo/14-mathquest-combat-sprites-as-pixel-art.md) | MateQuest's combat sprites redrawn as real pixel art | 13 |

## Measure-first todos

Each todo names the number that promotes it to a brief. Brief 07 checks every trigger against the
baseline, and so does any later bench reading.

| Todo | Promote when |
|---|---|
| [Static layer as tile chunks](../todos/2026-11-20-static-layer-as-tile-chunks.md) | The static layer's GPU time or memory breaks the bar on a reference device |
| [Sprite sort only on change](../todos/2026-11-20-sprite-sort-only-on-change.md) | The per-frame sort takes more than 1 ms at p95 in a bench scene |
| [Ghost pass scan](../todos/2026-11-20-ghost-pass-scan.md) | The occluder ghost check takes more than 1 ms at p95 |
| [Worker snapshot transfer](../todos/2026-11-20-worker-snapshot-transfer.md) | Receiving and applying a snapshot takes more than 2 ms at p95 on the main thread |
| [Hollow 3D culling](../todos/2026-11-20-hollow-3d-culling.md) | Hollow breaks the bar on the iGPU, or runs slower framed in the portal than direct |
| [Allocation-free frames](../todos/2026-11-20-allocation-free-frames.md) | Long frames line up with garbage-collection drops in the heap reading |
| [Animation tags in the manifest](../todos/2026-11-20-animation-tags-in-the-manifest.md) | The first animated MateQuest sprite, or the next new Farm animation |
| [Recipe and PNG round trip](../todos/2026-11-20-recipe-and-png-round-trip.md) | Someone wants to edit art in a pixel editor such as Aseprite |
| [Light overlay as a full-canvas upload](../todos/2026-11-21-light-overlay-full-canvas-upload.md) | Farm's light overlay (its canvas paint plus the upload) takes more than 1 ms at p95, or the GPU time drops by more than 1 ms with it off. Measured on SwiftShader by brief 05: 4,096,000 bytes uploaded every frame at 1280×800 |

## Checked and dropped

- **Weather particle caps.** [performance.md](performance.md) lists uncapped spawns and an O(n)
  `splice`. Both are gone: `particles.ts` caps its pool at 512 and no longer splices, and rain now
  goes through `RainField` (`rain-field.ts`), which caps its drops at 900.
- **Texture compression (KTX2, Basis).** It is lossy, and pixel art needs exact colours. It would
  only help a large painted image, and no game draws one.
- **Mipmaps.** Off for pixel art, as [asset-pipeline.md](asset-pipeline.md) says.
- **A binary snapshot codec for Farm's WebSocket.** Measured on 2026-06-10: deflate already makes
  the bytes cheap, and parsing them takes little time next to the frame.
