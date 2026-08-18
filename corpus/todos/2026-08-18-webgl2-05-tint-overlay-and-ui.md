# WebGL2 05 — day/night tint + the 2D overlay + UI quad flush

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 2 · depends on: 01, 02 · blocks: 08

## Goal

The screen-space layer that sits on top of the world: the day/night wash, and the transparent 2D
overlay canvas that carries the entire in-canvas UI of all four games.

**Good news, and the reason this brief is smaller than it looks:** `webgpu/overlay-2d.ts` (150 LOC)
is **already backend-agnostic**. It is a transparent `<canvas>` CSS-stacked one z-index above the
GPU canvas, and its only backend coupling is two *type* imports — `Ctx2D` (relocated in brief 01)
and `ViewUniform` (from `gpu-context.ts`). It does not touch WebGPU at all. So:

1. **Move `overlay-2d.ts` up one level** to `engine/core/src/render/overlay-2d.ts` — it is shared
   infrastructure, not a WebGPU pass. Rename its `gpuCanvas` constructor parameter — it now stacks
   over a GL canvas.
   **✅ `ViewUniform` is ALREADY relocated — do not move it again.** The controller moved it to
   `engine/core/src/render/view-uniform.ts` at the wave-1 gate (2026-08-18), because briefs 03/04/06/07
   run in the same wave as this one and all needed a stable path to import from. Import from there.
   `webgpu/gpu-context.ts` re-exports it for back-compat until brief 12 deletes that file.
   **Preserve the header comment explaining why shadows are NOT drawn here** (`multiply` composite
   does nothing on a transparent surface, so shadows are GPU-side). That comment is a decision
   record; someone will otherwise re-make the mistake.
2. **Port `TintPass`** (112 LOC + `shaders/tint.wgsl`, 67 LOC) → `webgl2/tint-pass.ts` +
   `shaders/tint.{vert,frag}.glsl`. A full-screen quad, colour + alpha uniform, drawn last in the
   world pass. It takes `(color: string, alpha: number)` and resolves the hex through `rgbOf` from
   the palette module — **keep that**: it is how the palette rule reaches the GPU. The GLSL must
   contain no colour literal (brief 02's lint enforces it).

## The perf constraint — read this before touching `ui-draw.ts`

The UI layer is **CPU-rasterized onto the overlay**, not GPU-drawn: `endFrame` calls
`drawUIQuad(overlayCtx, atlases, quad, dpr)` per quad. Inside `ui-draw.ts` is the
per-`(atlas, frame, rgb)` **tint cache** from brief 118 (`4fd48dc`) that took Farm from
**3.36 → 57.06 fps** and `ui.flush` from **106.0 → 5.2 ms** at ~1,950 quads/frame. Every glyph of
in-canvas text is a tinted quad, so this cache is the difference between playable and not.

It lives in the shared CPU rasterizer and is therefore **untouched by the backend swap** — which
means the requirement here is *don't break it*, and prove it:
- Keep the `WeakMap` keyed on the `LoadedAtlasImage` **object** (so a re-baked atlas self-invalidates)
  and the 4,096-entry reset valve. Do not "simplify" either.
- Keep alpha applied at draw time, never baked into the cache.
- Keep `imageSmoothingEnabled = false` pinned before the UI flush, and the
  `globalCompositeOperation = "source-over"` reset. The existing comment explains why
  (`applyWorldTransform` is skipped when no particles/weather are active, so a resized backing store
  would otherwise leave smoothing at its default `true` → blurry UI).
- Keep the `profileUi` / `lastUiFlush` instrumentation working — it is how the next regression gets
  diagnosed, and `?profile` in the Farm client reads it.
- **DPR is capped at 2** (`Math.min(devicePixelRatio, 2)`) in the flush. Preserve exactly.

## Also resolve here: `OverlayFn`

`RendererLike.endFrame`'s 4th parameter is an `OverlayFn`. Canvas2D honours it; the WebGPU renderer
takes it as `_overlay` and **ignores it** (see the note at
[../../games/citadel/client/src/render/quads.ts](../../games/citadel/client/src/render/quads.ts)
~line 447). With one backend there is no excuse for two behaviours. **Implement it** — the overlay
canvas is exactly the right surface for it, and it costs nothing when unset. Grep for actual callers
first; if there are genuinely zero, delete the parameter from `RendererLike` instead and note it in
the tracker for brief 13. Either outcome is fine; leaving it ambiguous is not.

## Out of scope
- Particles/weather (brief 06) — they also draw on this overlay in the CPU path; 06 owns that wiring.
- The renderer's `endFrame` ordering (brief 08).

## Acceptance
- `npm run typecheck` clean; `npm run test -w @engine/core` and `-w @engine/ui` green, including a
  port of `webgpu/tint-pass.test.ts` (56 LOC) and the existing `ui-draw.test.ts` unchanged in intent.
- A test proving the tint cache still returns a **cached** canvas for a repeated
  `(atlas, frame, rgb)` and a fresh one after the atlas object is replaced.
- **Visual proof:** a screenshot with a day/night wash active *and* text-heavy UI panels open, plus
  the `?profile` `ui.flush` reading at ~2,000 quads. If `ui.flush` is materially above ~5 ms, the
  cache is not biting — stop and report rather than shipping the regression.
- Nothing under `webgpu/` (other than the `overlay-2d.ts` move) or `canvas2d/` modified.
