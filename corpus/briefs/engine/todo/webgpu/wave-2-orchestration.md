# Wave 2 — WebGpuRenderer Orchestration

**Agents:** 1 (sole writer; high cross-file read). **Depends on:** all of Wave 1 merged.

## Goal

Fill the body of `WebGpuRenderer` (`render/webgpu/renderer.ts`) so it implements
`RendererLike` fully by orchestrating `GpuContext`, `GpuAtlasStore`, `SpriteBatch`,
`StaticLayerPass`/`WaterPass`, and `Overlay2D`. Also implement `tryCreateWebGpuRenderer`.

## Files you own

- `packages/engine/src/render/webgpu/renderer.ts` (replace the Wave-0 stub bodies).

## Files you must NOT touch

The collaborators (Wave 1 modules) — *use* them, don't edit them. If a collaborator's
signature is wrong for your needs, STOP and report; do not edit it yourself. Do not touch
the factory's default selection (Wave 3) — but DO make `tryCreateWebGpuRenderer` actually
construct and return a working `WebGpuRenderer`.

## What to implement (map each `RendererLike` member)

- **constructor / init:** store `camera`, `clearColor`, `pixelSnap`. Construct
  `Overlay2D`. Provide `static async create(canvas, camera)` that does
  `GpuContext.create(canvas)` then builds `GpuAtlasStore`, `SpriteBatch`, the static/water
  passes, and the overlay. `tryCreateWebGpuRenderer` calls `WebGpuRenderer.create`.
- **addAtlas/setAtlas:** delegate to `GpuAtlasStore.add`. **getAtlas:** `store.get`.
- **bakeStaticLayer:** call `StaticLayerPass.bake(atlasesMap, sprites, w, h, decorate)`.
  You need the atlases as the `Map<string, LoadedAtlasImage>` the bake helper expects —
  expose that from `GpuAtlasStore` (read its `get`/internal map; if not exposed, report —
  but `GpuAtlasStore` keeps the `LoadedAtlasImage`s, so add a small read accessor request
  to Wave 1b BEFORE Wave 2 if needed; otherwise the orchestrator can keep its own
  `Map` of atlases in parallel).
- **bakeWaterPattern / setWaterScroll / setWaterSwell / clearStaticLayer:** delegate to the
  water/static passes.
- **beginFrame:** resize via `GpuContext.resize` using the same DPR rule as Canvas2D; reset
  the sprite queue + shadow queue; recompute the cull rect with `CULL_MARGIN = 32` exactly
  as `Canvas2dRenderer.beginFrame`.
- **push / pushShadow:** cull with the same `inView` test, enqueue (reuse the pooled-array
  pattern from Canvas2D to avoid per-frame allocations).
- **endFrame(wash, particles, weather):** the full per-frame sequence from
  `01-architecture.md §4`:
  1. Compute `sx, sy, ox, oy` (pixel-snap rounding) from camera + canvas size; build the
     `ViewUniform`; `gpu.setView(view)`.
  2. `encoder = device.createCommandEncoder()`; `pass = gpu.beginPass(encoder, clearRgba)`
     where `clearRgba` = `clearColor` parsed from its EDG hex string to premultiplied
     floats (runtime parse — NOT a literal).
  3. Set the view bind group (group 0) once on the pass.
  4. `WaterPass.draw` (under), then `StaticLayerPass.draw`.
  5. **Shadows on GPU:** before sprites, emit each queued shadow as a dark translucent
     ellipse/quad (low layer). Simplest: a small filled-ellipse instance in a dedicated
     tiny pipeline, OR a 1×1 black texture quad scaled to the ellipse bounds with alpha.
     Document the approach. (This is the GPU path Wave 1d deferred to you.)
  6. Sort the sprite queue with `compareSprite`; walk it, converting each `Canvas2dSprite`
     to a `GpuSpriteInstance` (apply `y-z` lift, pixel-snap, `tintRgba`→(r,g,b,a) floats,
     `flipX`, `rotation`). Group consecutive sprites by `atlasId`; for each group call
     `SpriteBatch.flush(pass, store.bindGroup(atlasId), groupInstances)`. **Port the x-ray
     pass**: track occludable sprites, and for any covered by a later non-UI world sprite
     (`spritesOverlap`, `layer < GHOST_UI_LAYER=80`), re-emit it at `alpha *
     GHOST_ALPHA=0.4`.
  7. `pass.end()`; `device.queue.submit([encoder.finish()])`.
  8. `Overlay2D.beginFrame()`; `overlay.applyWorldTransform(view)`;
     `particles?.draw(overlay.ctx)`; `weather?.count && weather.draw(overlay.ctx)`;
     then `overlay.resetTransform()` and draw the screen-space `wash`
     (`fillRect` whole canvas at `wash.alpha`, color parsed from EDG hex at runtime).

## Parity checklist to self-verify against `Canvas2dRenderer.endFrame`

- clear color, water-under-static order, visible-rect clipping, sprite sort key
  (layer then `sortY ?? y`), z-lift, pixel-snap rounding of both offsets and per-sprite
  positions, tint multiply semantics, x-ray pass thresholds, particles before weather
  before wash, wash in screen space.

## Notes / pitfalls

- Reuse the numeric constants (`CULL_MARGIN`, `GHOST_ALPHA`, `GHOST_UI_LAYER`) — consider
  extracting them to a shared const module imported by both renderers to avoid drift; if
  you do, that new file is yours (note it in your report). Otherwise duplicate with a
  comment pointing at the Canvas2D source.
- Hex→float parsing helper: write a tiny `hexToRgbaFloats(hex, alpha)` (no literal colors).
- Device-loss: if `device.lost` fires, log and stop drawing (do not crash the rAF loop).
- No `any`.

## Acceptance & verify

- `npm run typecheck -w @engine/core` and `npm run typecheck` (root) clean.
- `npm run test -w @engine/core` green (no regressions; WebGPU isn't exercised under jsdom).

Commit: `webgpu(wave-2): WebGpuRenderer orchestration + tryCreateWebGpuRenderer`.
