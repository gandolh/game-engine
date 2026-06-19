---
title: "Engine — pre-allocate per-draw WebGPU uniform scratch buffers"
created: 2026-06-19
status: open
tags: [engine, render, webgpu, perf]
---

# Engine — pre-allocate per-draw WebGPU uniform scratch buffers

Two WebGPU passes allocate a fresh `Float32Array` **inside `draw()`** — i.e. every
frame, per viewer — just to `writeBuffer` it and throw it away. Classic avoidable
GC churn on the render thread. Pre-allocate the scratch array once (constructor or
field) and `.set()`/index into it each frame instead.

## Context

Both confirmed in the per-frame draw path (not bake):

- [static-layer-pass.ts:241](../../engine/core/src/render/webgpu/static-layer-pass.ts#L241) —
  `const data = new Float32Array([srcU0, srcV0, srcU1, srcV1, visL, visT, visR, visB]);`
  inside `StaticLayerPass.draw()`. An 8-float array allocated every frame.
- [static-layer-pass.ts:486](../../engine/core/src/render/webgpu/static-layer-pass.ts#L486) —
  `const data = new Float32Array(WATER_UNIFORM_FLOATS);` (36 floats) inside
  `WaterPass.draw()`, then filled field-by-field and uploaded.

Fix: add a private `readonly scratch = new Float32Array(N)` per pass, mutate it in
place each frame, and pass it to `queue.writeBuffer`. The water pass already fills
by index (`data[0]=…`), so it's a one-line swap of the allocation site.

Render-only, determinism-safe (no sim state touched). Low risk; the win is GC
pressure, not frame time — most valuable on weak/integrated GPUs and once Citadel's
256×256 MP world drives more draws. Note: the existing sprite-batch staging buffer
already reuses its buffer, so this just brings the two static passes in line.

## Acceptance

- No `new Float32Array(...)` inside any WebGPU `draw()` body; scratch buffers are
  fields reused across frames.
- Typecheck clean; render output unchanged (visual parity); the EDG32 palette guard
  and determinism diff still pass (sim untouched).
