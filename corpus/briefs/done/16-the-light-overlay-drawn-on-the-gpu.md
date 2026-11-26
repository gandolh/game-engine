# Task 16: the light overlay drawn on the GPU

**Origin:** the [light overlay todo](../../todos/closed/2026-11-21-light-overlay-full-canvas-upload.md), promoted
by the owner on 2026-11-23 with the rest of the measure-first todos: build light optimizations that are not
too heavy, complex or wide ([decisions.md](../../wiki/decisions.md) → Frame budget). The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** none.

## Context

Farm paints its night light pools with the CPU 2D canvas API and uploads the whole canvas as a texture
every frame. `makeLightOverlay` (`games/farm/client/src/render/lights.ts`) returns an `OverlayFn` that
draws one radial gradient per light (three colour stops: the peak at 0, 40% of it at 0.45, nothing at the
rim) with `globalCompositeOperation = "lighter"`. `OverlayLightPass`
(`engine/core/src/render/webgl2/overlay-light-pass.ts`) runs that function on an offscreen canvas the size
of the drawing buffer, then `texImage2D`s it.

On the laptop's bench run that is 7,257,600 bytes uploaded every frame at 1920×945, about 770 MB a second at
106 fps ([real-gpu-readings.md](../../wiki/real-gpu-readings.md)). Its main-thread cost is small (0.16 ms a
frame), but the bandwidth is what a phone has least of. Every other pass in the renderer draws instanced
quads with a shader.

Farm is the only game that passes an overlay. Citadel routes its light pools through the sprite batch
and passes none (`games/citadel/client/src/render/atmosphere.ts`).

## Files you OWN

- `engine/core/src/render/webgl2/overlay-light-pass.ts`, a new pair of shaders in
  `engine/core/src/render/webgl2/shaders/`, and their tests
- `engine/core/src/render/renderer.ts` and `engine/core/src/render/webgl2/renderer.ts`, only for the
  overlay's type and the `endFrame` parameter that carries it
- `games/farm/client/src/render/lights.ts` and the two lines in `games/farm/client/src/main/render-loop.ts`
  that build and pass the overlay
- `corpus/` pages for this brief: the outcome, `log.md`, the todo's status line,
  [frame-budget.md](../../wiki/frame-budget.md) and [real-gpu-readings.md](../../wiki/real-gpu-readings.md)

## Files you must NOT touch

- Citadel, Hollow and MateQuest.
- The other passes, and the order the passes draw in.

## What to do

1. **Replace the callback with data.** The overlay becomes a list of light pools in screen space: centre,
   radius, colour and peak alpha, the values `makeLightOverlay` already computes. Farm's `lights.ts` returns
   that list instead of a painting function. Colours stay palette roles (`rgbOf` of an EDG32 constant), never
   literals.
2. **Draw the pools as instanced quads.** One quad per pool, additive blending as now
   (`gl.blendFunc(gl.ONE, gl.ONE)`), and a fragment shader that reproduces the three stops: a piecewise-linear
   falloff in the distance from the centre over the radius. GLSL ES 3.00 with no colour literals; the
   per-directory `glsl-lint.test.ts` enforces both. Reuse typed arrays across frames.
3. **Delete the offscreen canvas and its upload.** Nothing in the pass allocates or uploads per frame.

## Acceptance

- Farm's headless bench (`npm run bench -- <folder> farm`) shows 0 texture bytes uploaded a frame, down
  from 4,096,000 at 1280×800. Put both numbers in the outcome.
- A screenshot of Farm at night, same seed and tick, before and after, side by side in
  `corpus/verify/<date>-light-overlay/`. The pools sit in the same places with the same colours; the edge of
  each pool may be smoother, not harder.
- A unit test of the falloff function at 0, 0.45 and 1 of the radius matches the three stops.
- The draw groups and UI quads stay within the budgets on [frame-budget.md](../../wiki/frame-budget.md).
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Deploy the Farm client from the vps-deploy checkout: `node cli.ts farm-valley deploy`.
- Optional: a session on the laptop reruns Farm's bench there (the driver is in
  `corpus/verify/2026-11-23-real-gpu-baseline/tools/`) and records the GPU time before and after.

## Outcome (2026-11-23)

Farm's night light pools are instanced quads now. Nothing in `OverlayLightPass` allocates, bakes a canvas
or uploads a texture; the only per-frame upload is a small instance buffer (32 bytes a pool).

- **What changed.** `OverlayFn` (a 2D canvas callback) is replaced by `LightOverlay`, a list of `LightPool`
  (centre, radius, colour 0..1, peak alpha) in `engine/core/src/render/renderer.ts`, exported from
  `@engine/core/render`. `endFrame`'s fourth parameter takes it. `OverlayLightPass` packs the pools into a
  reused `Float32Array` and draws them in one `drawArraysInstanced` call with `gl.blendFunc(gl.ONE, gl.ONE)`.
  `overlay-light.vert.glsl` expands one quad per pool; `overlay-light.frag.glsl` computes the three-stop
  falloff. The two falloff stops (0.45 and 0.4) are uniforms fed from `LIGHT_FALLOFF_MID_AT` and
  `LIGHT_FALLOFF_MID_SHARE`, so the unit-tested `lightFalloff` and the shader share one source. Colours stay
  palette roles: Farm's `lights.ts` still takes `rgbOf` of each emitter's EDG32 constant and passes it as
  instance data.
- **By day nothing is drawn.** `makeLightOverlay` returns `undefined` at or below the night gate, so the pass
  does no GL call. Before, the pass baked and uploaded a blank canvas all day.
- **`render-loop.ts` needed no edit.** It already passes the return value of `makeLightOverlay` to `endFrame`.
- **Numbers.** Farm, headless, 1280x800 (`npm run bench -- <folder> farm`, one run each):

  | | Before | After |
  |---|---:|---:|
  | Texture bytes uploaded a frame (mean) | 4,096,000 | 0 |
  | Draw groups (mean / p95) | 1 / 1 | 1 / 1 |
  | UI quads (mean) | 1,775 | 1,775 |

  Draw groups and UI quads are inside the budgets on [frame-budget.md](../../wiki/frame-budget.md).
- **Screenshots.** [verify/2026-11-23-light-overlay/](../../verify/2026-11-23-light-overlay/): the whole
  frame before and after side by side, and a 4x crop of two houses. Farm shows night at the start of a run
  (the day fraction is near 0), so both were taken on seed `0xc0ffee` at a 1280x800 viewport, started from
  the dev client's Start button and stopped with Pause: before at tick 13, after at tick 62 (the sim is
  wall-clock paced, so the tick can't be matched exactly; nightness is 1 at both, so the pools are at full
  peak in both). The pools sit in the same places with the same colours; the pool edges read the same or
  smoother.
- **Tests.** `overlay-light-pass.test.ts` (the falloff at 0, 0.45 and 1 of the radius and linear between;
  no-op without pools; one additive instanced call and no texture call; clip-space uniforms; staging array
  reused, buffer grown only when needed), and `lights.test.ts` rewritten for the pool list.
- **Left alone.** `games/citadel/client/src/render/atmosphere.ts` still names `OverlayFn` in a comment; the
  brief forbids touching Citadel, so the comment is stale.
