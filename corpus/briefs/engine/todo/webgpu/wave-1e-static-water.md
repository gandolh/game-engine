# Wave 1e — Static Layer + Water Passes

**Agents:** 1 (parallel, worktree-isolated). **Depends on:** Wave 0 (contracts). Reads the
shapes of `GpuContext` (1a) and `GpuAtlasStore` (1b) but must not edit them.

## Goal

Implement `StaticLayerPass` and `WaterPass` (`render/webgpu/static-layer-pass.ts`) plus
`shaders/water.wgsl`: bake the world's static sprites + procedural decorators into a GPU
texture (reusing the existing Canvas2D bake), and render the tiling animated water with
scroll + swell, matching `Canvas2dRenderer`'s water behaviour.

## Files you own

- `packages/engine/src/render/webgpu/static-layer-pass.ts` (fill stub).
- `packages/engine/src/render/webgpu/shaders/water.wgsl` (overwrite placeholder).

## Files you must NOT touch

`gpu-context.ts`, `texture-atlas.ts`, `sprite-batch.ts`, `overlay-2d.ts`, the interface,
factory, index, and the existing `canvas2d/draw.ts` (you will *import* `drawSprite`/
`compareSprite`/`createOffscreen` from it — do not modify them).

## Static layer

The existing `bakeStaticLayer` (in `Canvas2dRenderer`) already produces a correct
world-pixel image via `drawSprite` + a `decorate` callback. Reuse it wholesale:

1. `bake(atlases, sprites, worldWidth, worldHeight, decorate?)`:
   - `surface = createOffscreen(ceil(worldWidth), ceil(worldHeight))` (from `canvas2d/draw`).
   - Get its 2D ctx, `imageSmoothingEnabled = false`, `clearRect`.
   - Sort sprites with `compareSprite`, `drawSprite(ctx, atlases, s)` each (identical to the
     Canvas2D path — keeps pixels byte-identical).
   - Run `decorate?.(ctx, w, h)` (ground-noise, water-depth work unchanged).
   - Upload `surface` to a `GPUTexture` via `copyExternalImageToTexture`
     (`{ source: surface }`). Store texture + dimensions.
2. `draw(pass, view, visRect)`: draw the visible sub-rect of the static texture as a single
   textured quad, mirroring the 9-arg `drawImage(staticLayer, visL,visT,visW,visH, …)`
   visible-rect clipping in `Canvas2dRenderer.endFrame`. Compute `visL/visT/visR/visB`
   exactly as the current code does (clamp to `[0, staticLayerW/H]` and the camera rect).
   A simple textured-quad pipeline with the view uniform + a `nearest` sampler suffices.
3. `clear()`: drop the texture (for `clearStaticLayer`).

## Water

`bakeWaterPattern(atlases, frame, atlasId, tileSize, pixelScale=1)`:
- Reproduce the current logic: `scale = max(1, round(pixelScale))`, `size = max(1,
  ceil(tileSize)*scale)`. Draw the atlas frame into a `size×size` OffscreenCanvas
  (`drawImage` with the frame rect → 0,0,size,size), upload to a small `GPUTexture` with a
  **repeat** sampler.
- `setWaterScroll(ox, oy)` / `setWaterSwell(alpha, ox, oy)`: store offsets (wrapped to tile
  size, as the current code does). These feed `water.wgsl` as uniforms.
- `draw(pass, view, visRect, zoomedOut)`: fill the visible world rect by drawing a quad
  over `[visL,visT]..[visR,visB]`; the fragment samples the water texture in world space
  with the scroll offset, tiling via `repeat`. If `setWaterSwell` alpha > 0, do a second
  low-alpha pass with the swell offset (or fold into one shader with two samples). When
  `zoomedOut` (camera `sx < 1`), use a **linear** sampler to avoid the nearest-neighbor
  shimmer the current code guards against (`waterSmooth = sx < 1`); else nearest.

### `water.wgsl`

- Vertex: place the quad covering the visible world rect (via view uniform).
- Fragment: compute world-space UV = `(worldPos + scrollOffset) / tileSize`, sample
  (repeat). Output premultiplied. No color hex literals — water color comes from the
  sampled texture. Swell alpha arrives as a uniform.

## Notes / pitfalls

- Draw order (enforced by Wave 2): **water first, then static layer on top** (static is
  transparent over ocean/bridge tiles so water shows through) — same as Canvas2D.
- `createOffscreen` already falls back to `HTMLCanvasElement` when `OffscreenCanvas` is
  absent; `copyExternalImageToTexture` accepts both. Keep that fallback.
- Decorator callbacks must receive a real 2D context — the OffscreenCanvas bake provides it,
  so ground-noise/water-depth keep working with zero changes.
- No `any`.

## Acceptance & verify

- `npm run typecheck -w @engine/core` clean.
- Self-review water UV/scroll math and static visible-rect math against
  `Canvas2dRenderer.endFrame` lines for water + `drawImage`.

Commit: `webgpu(wave-1e): static-layer + water passes + water.wgsl`.
