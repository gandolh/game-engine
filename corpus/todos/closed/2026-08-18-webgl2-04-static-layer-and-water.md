# WebGL2 04 — static terrain layer + animated water

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 2 · depends on: 01, 02 · blocks: 08

## Goal

Port the largest file in the backend — `webgpu/static-layer-pass.ts` (585 LOC), which holds **two**
classes — to `engine/core/src/render/webgl2/static-layer-pass.ts` +
`webgl2/water-pass.ts`, with `shaders/water.{vert,frag}.glsl` from `shaders/water.wgsl` (165 LOC).

**`StaticLayerPass`** — the baked terrain backdrop. `bake(...)` rasterizes tiles on the **CPU** into
an offscreen 2D canvas (`createOffscreen` + `drawSprite` from `raster2d.ts` after brief 01, at
today's lines ~230 and ~470) and uploads the result as one texture; `draw(view, visRect)` blits the
visible sub-rect. **The CPU bake is not changing** — only the upload and the blit become GL. This is
the single most important thing to understand before starting: this pass is mostly 2D-canvas code
that happens to end in a texture upload, and that half is already backend-neutral.

**`WaterPass`** — animated water: `bakePattern`, `setDepthMask`, `setScroll`, `setSwell`, and a
`draw(view, visRect, zoomedOut)` that does a scrolling pattern fill plus a second swell pass, with a
depth mask and a `zoomedOut` branch (`sx < 1`).

Keep both public APIs identical — brief 08 calls `_waterPass.draw(...)` then `_staticPass.draw(...)`
in that order, and `Canvas2dRenderer`'s `bakeWaterPattern`/`setWaterScroll`/`setWaterSwell`/
`setWaterDepthMask` reach these through `RendererLike`.

## Notes
- Also port **`assertTextureWithinLimits(device, w, h, label)`** (line ~46). WebGPU's
  `maxTextureDimension2D` becomes `gl.getParameter(gl.MAX_TEXTURE_SIZE)`. This guard is load-bearing
  history: Citadel's 256×256 map sits **exactly on the WebGPU default texture limit** (corpus
  citadel-decisions, note near line 147). The WebGL2 limit is a *different* number on different
  drivers, so the guard must read the real parameter and its error message must name the actual
  limit it found — not a hardcoded 8192.
- `VisibleRect` (`{visL, visT, visR, visB}`) is exported from this file today and consumed by the
  renderer. Keep it exported from the WebGL2 module at the same shape.
- Water is where a **wrap-mode** difference will bite: the scrolling pattern needs `REPEAT`, while
  everything else in this engine is `CLAMP_TO_EDGE`. WebGL2 allows `REPEAT` on NPOT textures (unlike
  WebGL1) — but the baked pattern's dimensions come from atlas frames, so assert the sampler state
  per-texture rather than globally.
- `_view` is currently unused by both `draw` methods (they take `visRect` and read the shared view
  uniform). Preserve that — do not "fix" it into a per-pass view upload.
- The **depth mask** is a texture/uniform, unrelated to a GL depth buffer. Do not introduce
  `gl.enable(DEPTH_TEST)` for it (brief 02 creates the context with `depth: false`).

## Out of scope
- Sprites, shadows, effects, tint (03, 05–07). The terrain sits *under* all of them.
- Any change to how tiles are chosen or baked — this is a backend port, not a terrain change.

## Acceptance
- `npm run typecheck` clean; `npm run test -w @engine/core` green, including a WebGL2 sibling of
  `webgpu/static-layer-pass.test.ts` (57 LOC — port its cases).
- `assertTextureWithinLimits` has a test proving it **throws** above the reported limit and passes
  at exactly the limit. Regression-guard for the Citadel 256×256 edge.
- **Visual proof required** (see 03's acceptance): a screenshot of baked terrain + scrolling water,
  at a zoomed-in camera *and* at `sx < 1` (the `zoomedOut` branch — the establishing view, which is
  Farm's default zoom and therefore the most-seen frame in the game). Path recorded in the tracker.
- Nothing under `webgpu/` or `canvas2d/` modified.
