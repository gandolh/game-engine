# sweep-04 — the UI is the only surface left on the CPU rasterizer: ~7,272 Canvas2D `drawImage` calls per frame

status: todo
created: 2026-09-19
context: found by a read-only structure/performance/compatibility sweep on 2026-09-19. This is the
largest *measured* slice of a Farm frame and the one surface the WebGL2 migration ported forward
unchanged instead of moving to the GPU. **Check the two non-relitigation notes below before starting** —
they are the reason this is new work and not a re-run of brief 118.

## The gap

Every UI quad — every glyph, icon shade-mask, panel background, hotbar slot — is rasterized on the
**CPU**, one `drawImage` per quad, onto a second stacked `<canvas>`:

[`engine/core/src/render/webgl2/renderer.ts`](../../../engine/core/src/render/webgl2/renderer.ts) (the tail
of `endFrame`, ~line 712):

```ts
for (let ui = 0; ui < this._uiLen; ui += 1) {
  drawUIQuad(overlayCtx, this._atlases, this._uiQueue[ui]!, dpr);
}
```

`overlayCtx` is a `CanvasRenderingContext2D` from
[`Overlay2D`](../../../engine/core/src/render/overlay-2d.ts) — a transparent canvas CSS-stacked one
z-index above the GL canvas. `drawUIQuad` lives in
[`ui-draw.ts`](../../../engine/core/src/render/ui-draw.ts) and reaches the per-`(atlas, frame, rgb)`
`tintCaches` WeakMap of pre-composited canvases that brief 118 added.

**Measured, on the record** ([performance.md](../../wiki/performance.md), post-migration reading
2026-08-18, Farm via `?profile`):

| metric | value |
|---|---|
| `ui.flush` | **3.49 ms** mean / 5.10 p95 |
| `ui.quads` | mean **7,272** |
| `render.endFrame` | 7.73 mean / 9.60 p95 |
| `frame` (JS) | 12.09 mean / **17.10 p95** |

`ui.flush` is ~45% of `render.endFrame` and ~29% of the whole frame. The frame's **p95 is 17.10 ms,
over the 16.6 ms 60 Hz budget** — so this is not a hypothetical headroom argument.

Meanwhile, four files away, the engine already owns
[`SpriteBatch`](../../../engine/core/src/render/webgl2/sprite-batch.ts): instanced, 16 floats per quad
into one `Float32Array`, one `drawArraysInstanced` for thousands of quads, **with a per-instance
tint already in the vertex format** (`LOC.tint`, `inst.r/g/b/a`). The tint cache exists to emulate on
the CPU exactly what that attribute does for free.

## Why the two obvious "this was already decided" readings are both wrong

Read these before dismissing this brief — I checked both.

1. **The WebGL2 migration did not decide the UI belongs on Canvas2D.** It ported `Overlay2D` forward
   as a like-for-like port
   ([webgl2-05](2026-08-18-webgl2-05-tint-overlay-and-ui.md), whose brief title is literally
   "tint + overlay-2d + UI quads"), and its BUILD-STATE records *"Two stacked canvases at 1280×577
   (GL + `Overlay2D`), exactly as designed"* — i.e. the port matched its own spec. There is **no entry
   in [decisions.md](../../wiki/decisions.md)** saying the UI flush stays on the CPU. Nothing to relitigate.
2. **Brief 118's non-goal is the emission *API*, not the flush backend.**
   [118](118-fps-regression-ui-glyph-tint-path.md) locks *"the per-glyph quad emission API"*
   as a non-goal. This brief does not touch it: `@engine/ui` keeps emitting the same quads through the
   same call, and `_uiQueue` keeps the same shape. Only what consumes `_uiQueue` changes. Say so in the
   closeout so the next reader does not have to re-derive it.

Also note 118's own **F2** — *"overlay dirty-skip: skip the clear+redraw when this frame's UI quad
list is identical to last frame's"* — was written as the fallback, flagged *"this is invasive; take it
only with a number proving F1 wasn't enough."* That is the alternative to this brief, and it is the
weaker one: it optimizes the frames where nothing changed, while Farm's world-anchored panels
(inspect card, notice board, standings post) move with the camera **every** frame, which 118 already
warned about.

## The second cost, which is not about milliseconds

`Overlay2D` forces a **second full-size canvas** for the life of the app:

- its own DPR-scaled backing store, re-derived every frame in `beginFrame()`;
- a full-surface `clearRect` every frame;
- CSS `width`/`height`/`left`/`top`/`z-index` kept in sync with the GL canvas every frame;
- a **third hardcoded copy of the DPR cap** (`overlay-2d.ts` line ~94 — see
  [sweep-06](2026-09-19-sweep-06-dpr-cap-duplicated-and-hollow-uncapped.md)).

Two canvases that must stay pixel-aligned is a standing compatibility surface. Retiring the UI half of
`Overlay2D`'s job shrinks it.

## What to do — measure, then move, in that order

1. **Re-measure first, on real hardware.** The 3.49 ms figure is from 2026-08-18. Capture a fresh
   `?profile` export with all panels open at default zoom, same conditions as
   [performance-measurements.md](../../wiki/performance-measurements.md)'s table style. If `ui.flush` has
   moved, the ranking changes and this brief may need re-scoping. **A number from a previous session is
   not a baseline for this one.**
2. **Add a screen-space sprite pass**, not a new renderer. Push `_uiQueue` through `SpriteBatch` with
   an identity (screen-space) `ViewUniform` — the batch already takes one via `setView`, and UI quads
   are already in screen space with DPR applied. Draw it **after** the wash and light passes, which is
   where the current flush sits, so composite order is unchanged.
3. **Let the per-instance tint replace the tint cache.** Feed the quad's colour into
   `inst.r/g/b/a`. If that holds, `ui-draw.ts`'s `tintCaches` WeakMap and its
   `createOffscreen`-per-(atlas,frame,rgb) machinery become dead and should be deleted — with the
   caveat below.
4. **Keep `Overlay2D` alive.** Particles, weather, and the day/night wash still use it
   ([overlay-2d.ts](../../../engine/core/src/render/overlay-2d.ts) header), and its shadow-mode note
   explains why `multiply` cannot move here. This brief removes the **UI** flush from it, nothing else.
5. **Do not delete `drawUIQuad` or `raster2d.ts`'s tint path yet.** The same CPU rasterizer bakes
   textures for `static-layer-pass`, `water-pass` and `overlay-light-pass`, and
   [performance.md](../../wiki/performance.md) records it as *"still load-bearing for texture baking."*
   Grep the callers before removing anything.

## The risk that decides whether this ships

**Glyph fidelity.** The UI is pixel art under a fixed palette, drawn `imageSmoothingEnabled = false`
with an explicit "force nearest-neighbour" comment at the flush site. Moving to the GPU means the
sampler, not the 2D context, decides filtering. Get `NEAREST` min/mag on the atlas texture and prove
it: the acceptance below asks for a pixel comparison, not a screenshot that looks fine.

## Files you OWN
- `engine/core/src/render/webgl2/renderer.ts` (the UI-flush tail of `endFrame`)
- `engine/core/src/render/webgl2/sprite-batch.ts` (if it needs a screen-space entry point)
- `engine/core/src/render/ui-draw.ts` (only once the GPU path is proven)

## Files you must NOT touch
- `@engine/ui` — no widget, layout, text or icon module changes. If this brief needs an `@engine/ui`
  edit, the emission API moved and the brief is out of scope.
- `Overlay2D`'s particle / weather / wash path.
- The shadow path (`shadow-batch.ts`) — see `overlay-2d.ts`'s header for why shadows are GPU-side.

## Acceptance
- **A before/after `?profile` export pair** on the same machine, in
  [performance-measurements.md](../../wiki/performance-measurements.md), same table shape as the
  2026-07-15 and 2026-08-18 entries. `ui.flush` and `frame` p95 both reported. If `frame` p95 does not
  drop below 16.6 ms, say so plainly rather than reporting the `ui.flush` win alone.
- **UI pixels identical.** A cropped pixel diff of the panel area, at rest, before and after — the
  three-frame static-scene technique the 2026-09-19 log entry describes for MateQuest's buttons.
  "Looks the same" is not the bar.
- Palette guard green (`palette.test.ts`) — no colour may enter the shader path as a literal; the GLSL
  lint applies to any new shader.
- `npm run gates`. The startup smokes matter here: this touches a barrel-adjacent render module, and
  [decisions.md](../../wiki/decisions.md) → Renderer records that typecheck plus 689 green tests missed
  exactly that class of break.
- Determinism untouched by construction (render-only). No sim run needed; say that in the closeout
  rather than running one for form.
