# Task 15: the sprite sort under 1 ms

**Origin:** the [sprite sort todo](../../todos/2026-11-20-sprite-sort-only-on-change.md), promoted by
[brief 07](07-the-real-gpu-baseline.md)'s laptop reading on 2026-11-23. The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Sonnet ([routing.md](../../routing.md)). It is engine code with a test that pins the result.

**Depends on:** none.

## Context

The WebGL2 renderer sorts its whole sprite queue with `compareSprite` every frame
(`engine/core/src/render/webgl2/renderer.ts`, `endFrame`; the comparator is in
`engine/core/src/render/raster2d.ts`). The trigger was a sort above 1 ms at p95 in a bench scene on a
reference device.

On the Windows laptop's AMD iGPU, Farm's bench scene at 1920×945 sorts 2,089 sprites on an average frame
and 4,638 at p95, at the widest zoom. A CPU profile of that scene
([real-gpu-readings.md](../../wiki/real-gpu-readings.md), "Where Farm's frame goes") puts **1.07 ms per
frame, on average,** in `compareSprite` alone. `endFrame`'s own 0.67 ms, which includes the sort's
built-in work, comes on top. The widest frames sort twice as many sprites, so the p95 is well above 1 ms.
Farm is the one game on the 60 fps line: it misses a 120 Hz refresh on 5.7–7.2% of frames, and it is
CPU-bound (6.1–6.3 ms of CPU against 2.6–2.7 ms of GPU). The emulated phone pass ran its
`render.endFrame` at 16.9 ms with the CPU slowed 4×.

Why the order matters beyond looks: the sorted order also decides how many draw groups a frame costs.
Since brief 10 every game draws from one atlas page, so that risk is small today, but a wrong order still
draws a sprite over the wrong neighbour.

## Files you OWN

- `engine/core/src/render/webgl2/renderer.ts` (the sort in `endFrame`, and a sort time on `lastDrawStats`)
- `engine/core/src/render/raster2d.ts` if the comparator or a key function changes there
- Their tests, and a new test file for the sort if that reads better
- `games/farm/client/src/main/render-loop.ts`, only to record the new `render.sort` step next to
  `draw.sprites`
- `corpus/` pages for this brief: the outcome, `log.md`, the todo's status line,
  [frame-budget.md](../../wiki/frame-budget.md) (its brief table and todo row) and
  [real-gpu-readings.md](../../wiki/real-gpu-readings.md) (a line with the after numbers)

## Files you must NOT touch

- `static-layer-pass.ts`, which sorts once per bake, not per frame.
- What a sprite draws on top of. The order after this brief is exactly today's order (below).

## What to do

1. **Time the sort first.** Wrap the sort in `endFrame` in `performance.now()`, put the milliseconds on
   `lastDrawStats` as `sortMs`, and have Farm record them as `render.sort` with `frameProfiler.add`, the
   way it records `draw.sprites`. Run `npm run bench -- <folder> farm`
   and keep the export: that is the before. CPU milliseconds are meaningful headless
   ([bench-scenes.md](../../wiki/bench-scenes.md)).
2. **Make the sort cheaper without changing the order.** Today's order is `Array.prototype.sort` with
   `compareSprite`: by `layer`, then by `sortY ?? y`, and ties keep the order sprites were pushed in,
   because that sort is stable. Keep exactly that. The usual answers, pick by measurement:
   - one numeric key per sprite (the layer and `sortY ?? y` packed into a `Float64Array`), sorting an
     index array by key with the push index as the tie-break, so no comparator reads object properties;
   - starting from last frame's order, since the camera and the sprites move little between frames, and
     finishing with an insertion pass, which is close to linear on nearly sorted input.
   Reuse the typed arrays across frames: no allocation per frame.
3. **Measure the after** with the same command and the same scene.

## Acceptance

- A test pushes a few thousand sprites with random layers, random `sortY`/`y` values and many exact ties,
  sorts them through the renderer's path, and compares the order with
  `queue.slice().sort(compareSprite)`. They are equal, element for element, for several seeds, and again
  after a second frame with moved sprites.
- Farm's headless bench at 1280×800 shows `render.sort` before and after. The after's p95 is at most half
  the before's. Put both numbers in the outcome.
- The headless bench's draw groups, UI quads and texture bytes stay within the budgets on
  [frame-budget.md](../../wiki/frame-budget.md).
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- On the laptop, rerun Farm's bench (`?bench&profile`) and say whether `render.sort` is under 1 ms at p95.
- Deploy the three games that draw through this renderer, from the vps-deploy checkout:
  `node cli.ts farm-valley deploy`, `node cli.ts citadel deploy` and `node cli.ts mathquest deploy`.
