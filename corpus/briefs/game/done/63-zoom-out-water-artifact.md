# Brief 63 — Fix the water artifact at far zoom-out

**Status:** done (merged 2026-06-10) · **Area:** `packages/engine` (renderer) + `packages/farm-valley` (water bake/scroll) · **Drafted:** 2026-06-10

Zooming out toward the 0.5× minimum makes the water look wrong (shimmer/moiré/noise as it drifts). Diagnose precisely, then fix. Render-only; zero sim impact.

## Read first

- [corpus/wiki/performance.md](../../../wiki/performance.md) — render budget context (~1.4ms/16.6ms, lots of headroom).
- Brief [30-procedural-ground-texture](../done/30-procedural-ground-texture.md) / [32-rendering-overhaul](../done/32-rendering-overhaul.md) for water-pattern history.

## How water rendering works (verified against code 2026-06-10)

- Water is **one repeating `CanvasPattern`**, not per-tile draws. `bakeWaterPattern()` in [packages/engine/src/render/canvas2d/renderer.ts](../../../../packages/engine/src/render/canvas2d/renderer.ts) (~131-170) upscales the 16×16 `tile/ocean` atlas frame nearest-neighbor to 48×48 (pixelScale=3, set in [farm-valley/src/main/static-layer.ts](../../../../packages/farm-valley/src/main/static-layer.ts) ~line 38 — the comment says 3px features were chosen precisely so ripples "still read" at zoom 0.5).
- Each frame the pattern is scrolled via `DOMMatrix` translate (`setWaterScroll`, sin/cos drift ±~9.6px from [render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts) ~124-135) and filled over the visible rect (~renderer.ts 287-300) **under** the baked static island layer.
- The camera transform is `ctx.setTransform(sx, 0, 0, sy, …)` with `sx = canvas.width / camera.worldUnitsX` (~renderer.ts 257-270) and `imageSmoothingEnabled = false` everywhere. At zoom 0.5 with arbitrary canvas sizes and DPR (clamped to 2 in [main/camera.ts](../../../../packages/farm-valley/src/main/camera.ts) ~115), `sx` is generally **fractional < 1** — nearest-neighbor downsampling drops pattern rows/columns inconsistently, and the per-frame sub-pixel scroll makes the dropped set change every frame → shimmer/moiré. This is the leading hypothesis; confirm before fixing.

## Tasks

- [ ] **1. Reproduce + characterize (do this first, don't skip to a fix).** In `npm run dev`, zoom to 0.5 on a mostly-water view. Confirm whether the artifact is (a) scroll-driven shimmer (freeze it: temporarily hardcode `setWaterScroll(0,0)` — artifact becomes a static moiré?), (b) DPR-dependent (toggle browser zoom / set the DPR clamp to 1), (c) fractional-scale-dependent (resize window so canvas px / worldUnits is exactly 0.5). Write down which. One Playwright screenshot per condition is a fine artifact for the PR.
- [ ] **2. Fix per diagnosis.** Candidate fixes, in preference order — pick what the evidence supports:
  - **(a) Smooth the water fill only at downscale.** Around the water `fillRect`, set `ctx.imageSmoothingEnabled = true` when the effective scale `sx < 1`, restore `false` right after. Land/sprites stay crisp pixel-art; only the water (which is noise-like anyway) gets bilinear minification. Cheapest real fix for nearest-neighbor minification shimmer.
  - **(b) Bake a second, coarser water pattern for low zoom.** A pre-downscaled (mip-style) 24×24 surface selected when `zoom < 0.75` — avoids per-frame smoothing-state flips if (a) shows seams or perf cost.
  - **(c) Snap the scroll offset to whole device pixels at low zoom** (`Math.round(offset * sx) / sx`) — kills frame-to-frame twinkle if the artifact is purely scroll-driven.
  - Raising `pixelScale` 3→4 is a tempting one-liner but only shrinks the artifact; don't ship it as the sole fix unless step 1 proves it sufficient. Raising the min-zoom clamp hides the bug — last resort only.
- [ ] **3.** Verify the fix at zoom 0.5, 0.6, 0.75, 1, and at DPR 1 and 2. Confirm the water still animates and shorelines/foam still align.
- [ ] **4.** Check frame time stayed flat (perf overlay or a quick before/after of the render-loop timing the performance wiki page describes).
- [ ] **5.** `npm run typecheck` + `npm run test`; update [performance.md](../../../wiki/performance.md) if the water path changed shape.

## Acceptance

- No visible shimmer/moiré on water at min zoom on both DPR 1 and 2.
- Land tiles and sprites remain nearest-neighbor crisp at all zooms.
- Render frame time unchanged within noise.

## Risks / notes

- `imageSmoothingEnabled` is set in three places (renderer.ts ~59/118/271) — if using fix (a), scope the flip tightly to the water fill so the static-layer blit isn't accidentally smoothed.
- Coordinate with **brief 60** (same wheel handler / zoom constants — trivial rebase) and **brief 64** (subtle waves builds on this same pattern + scroll path — **land 63 before 64** so waves are tuned against the fixed baseline).
