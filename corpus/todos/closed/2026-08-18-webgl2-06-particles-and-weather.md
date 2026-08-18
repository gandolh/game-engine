# WebGL2 06 — GPU particles + GPU weather (rain/snow)

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 2 · depends on: 01, 02 · blocks: 08

## Goal

Port the two effect passes to `engine/core/src/render/webgl2/`:

| From | To | LOC |
|---|---|---|
| `webgpu/particle-batch.ts` + `shaders/particle.wgsl` | `webgl2/particle-batch.ts` + `shaders/particle.{vert,frag}.glsl` | 158 + 178 |
| `webgpu/weather-pass.ts` + `shaders/weather.wgsl` | `webgl2/weather-pass.ts` + `shaders/weather.{vert,frag}.glsl` | 293 + 279 |

Both have a one-method surface — `draw(target, particles: ParticleSystem)` and
`draw(target, weather: RainField)` — so the port is contained. `weather.wgsl` is the largest shader
in the repo (279 LOC) and uses `@builtin(instance_index)`, which becomes `gl_InstanceID`.

## The dual-path design you must preserve

`WebGpuRenderer` has a **`useGpuEffects` flag**, and effects render one of two ways:

- **`useGpuEffects === true`** → GPU passes, inside the world render pass, *after* sprites and
  *before* the cloud/tint passes. Weather goes GPU-side **only when `weather instanceof RainField`**.
- **`useGpuEffects === false`**, *or* a weather object that is not a `RainField` → the **CPU** path:
  `particles.draw(overlayCtx)` / `weather.draw(overlayCtx)` onto the `Overlay2D` canvas under
  `applyWorldTransform(overlayView)`.

That second path is why `WeatherLike` is structurally typed (`{count, draw(ctx)}`) and why
`rain-field.ts` imports `Ctx2D`. Citadel passes its `RainField` straight through
([../../games/citadel/client/src/render/weather.ts](../../games/citadel/client/src/render/weather.ts)),
and Citadel's `citadel-fx.ts` documents its particles as "rendered natively by the WebGPU backend's
particle pass". **Keep both paths and the `instanceof RainField` branch exactly.** The CPU path is
not dead code — it is the escape hatch for any game-supplied `WeatherLike` that is not a RainField,
and it survives the migration untouched because it never used WebGPU.

Note the `overlayView` uniform differs from the GPU view: `{scaleX: sx, scaleY: sy}` (both
positive, no clip-space conversion) versus the GPU's `scaleY: -sy * 2 / canvasH`. Do not unify them.

## Notes
- The particle/weather shaders animate from `view.timeSec` and `view.windStrength`
  (`1.0 + 0.15 * sin(t * 0.37)`), both supplied per-frame in the shared view uniform. Read them the
  same way; do not add a second time source.
- `performance.now()` in the *render* path is fine and stays — the sim-side ban on `Date.now()` /
  `Math.random()` applies to sim code, and rendering is downstream of the snapshot. **Do not**
  introduce randomness into a shader that would make two clients disagree visually in a way anyone
  could mistake for a sim divergence; particle jitter must keep coming from the same inputs it does
  today.
- Blend state: additive vs premultiplied differs between the particle and weather pipelines. Read
  each `createRenderPipeline` blend descriptor and translate literally.
- Historical caution from [../../wiki/performance.md](../../wiki/performance.md): the CPU weather path had
  an uncapped spawn and an O(n) `splice` removal. Those were investigated and **deliberately not
  fixed** (they never bit at observed levels). Do not fix them here — a backend port that also
  changes spawn behaviour is unreviewable.

## Out of scope
- Cloud shadow / haze (brief 07) — a different pass despite the atmospheric kinship.
- `Overlay2D` itself (brief 05 relocates it). Consume it; don't move it.
- `RainField` / `ParticleSystem` logic — both are backend-neutral and stay put.

## Acceptance
- `npm run typecheck` clean; `npm run test -w @engine/core` green, including a port of
  `webgpu/weather-pass.test.ts` (72 LOC).
- A test proving the `instanceof RainField` branch: a non-RainField `WeatherLike` must reach the
  CPU `draw(ctx)` path and **not** the GPU pass, with `useGpuEffects` true.
- **Visual proof:** screenshots of rain and of snow with `useGpuEffects` true, plus one with it
  false (CPU path), showing the same effect through both. Paths in the tracker.
- Nothing under `webgpu/` or `canvas2d/` modified.
