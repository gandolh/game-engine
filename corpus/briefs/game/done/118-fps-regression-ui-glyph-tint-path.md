# Task 118 — FPS regression: profile gate + fix the per-glyph UI tint path

> **DONE 2026-07-15 (`4fd48dc`).** Profile gate CONFIRMED the hypothesis on the affected
> machine: `ui.flush` (new sub-timer) mean **106.0 ms of `frame` 116.6 ms (~91%)** at ~1,950
> quads/frame, fps 3.36. **F1 shipped**: per-(atlas, frame, rgb) tint cache in `drawUIQuad`,
> WeakMap-keyed by the atlas *object* (re-bake self-invalidates), per-atlas 4,096-entry reset
> valve, alpha draw-time only. Result same scene, panels open: **fps 57.06, `ui.flush` 5.2 ms,
> `render.endFrame` 6.1 ms**. **F2 not taken** (gate closed — F1 sufficed); **F3 dismissed**
> (endFrame−ui.flush ≈ 1.3 ms). The 5-ms residual flush is ~1,936 plain drawImage calls.
> Gates: typecheck 14/14, full suite green (engine/core 194 incl. 4 new cache tests + a
> recorder `ga` extension), Farm `CHECK_DETERMINISM=1` MATCH, UI visually verified in-browser.
> Numbers: [performance-measurements.md](../../../wiki/performance-measurements.md) 2026-07-15.

## Context

Observed 2026-07-15 on the user's real hardware (Windows 11, WebGPU backend — Farm pins
`backend: "webgpu"` and throws rather than falling back): **5 fps, ~216 ms/frame, 583
entities**, day 0, sunny, default whole-world view. The last real-GPU baseline
(2026-06-12, brief 84) was **99 fps / 5 ms frame JS** — see
[performance-measurements.md](../../../wiki/performance-measurements.md). The regression window
is the **2026-07-01 in-canvas UI migration**: all DOM panels became `@engine/ui` trees drawn
through the renderer's UI seam.

**Prime suspect (codebase exploration 2026-07-15).** Text in `@engine/ui` emits **one tinted
quad per glyph** ([draw.ts](../../../../engine/ui/src/text/draw.ts)); every tinted quad is
rasterized by [ui-draw.ts](../../../../engine/core/src/render/ui-draw.ts) `drawUIQuad` via a
**5-op Canvas2D composite round-trip** (clear → drawImage → `multiply` fill →
`destination-in` drawImage → final drawImage) on the Overlay2D canvas, inside
`WebGpuRenderer.endFrame` ([renderer.ts:554-570](../../../../engine/core/src/render/webgpu/renderer.ts#L554-L570)).
The relationships matrix alone is ~900+ glyphs; with observer/slate/feed/hotbar/clock the frame
carries thousands of tinted quads, each paying composite-mode switches at ≤2× DPR. Note the
existing per-panel dirty guards do NOT help here: `renderTree` re-submits every glyph quad
every frame by design; the cost lands under `render.endFrame`, **not** under the `panels`
sub-timer.

Online research (2026-07-15) confirms the standard fix: cache the tinted result per
(glyph, color) instead of compositing per draw — Phaser's canvas `BitmapText` tint uses a
cached-tint canvas ([phaser#3855](https://github.com/photonstorm/phaser/issues/3855)); tint
caches pre-populated for known colors are the recommended pattern for palette-fixed games
([Sprite Tinting](https://github.com/mattdesl/bento/wiki/Sprite-Tinting),
[MDN globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)).
Both games' palettes are fixed (EDG32 / Apollo-46), so the cache is small and bounded.

**Ordering interplay:** capture the baseline profile BEFORE brief
[117](../todo/117-collapsible-hud-panels.md) lands (or run with all panels forced open) — 117 hides
most glyphs by default and would mask the regression.

## Files you OWN

- `engine/core/src/render/ui-draw.ts` (+ a colocated test) — the tint cache.
- `engine/core/src/render/webgpu/renderer.ts` — dev-only profiling seam around the UI flush
  (and, only if the F2 gate opens, the overlay dirty-skip).
- `games/farm/client/src/main/render-loop.ts` / `profile-export.ts` — only if a new sub-timer
  label needs plumbing into the report.
- Corpus at closeout: `wiki/performance.md`, `wiki/performance-measurements.md`, `status.md`,
  `log.md`.

## Files you must NOT touch

- `games/farm/sim-core/**`, `games/farm/server/**` — render-only work; the sim, snapshots, and
  transport are out of scope.
- `engine/ui/src/text/**` public API — glyph-quad emission stays as is; the fix is in the
  rasterizer, so Citadel benefits for free.
- `games/farm/client/src/ui/canvas/**` — panel visibility is brief 117's contract.

## What to do

1. **Profile gate (gates everything — the corpus rule: no optimization without a before/after
   number).** `npm run dev` + `?profile` on the affected machine; use the profile-export button
   / `window.__exportProfile()`. Add a `PROFILE_ENABLED`-gated sub-timer around the Overlay2D
   UI flush loop in `endFrame` (e.g. `ui.flush`) plus a UI-quad count, so the report separates:
   GPU submit vs overlay UI flush vs `panels` (tree refresh/layout) vs `pushSprites`/`interp`.
   Record the baseline export. **If the numbers contradict the hypothesis** (UI flush is NOT the
   dominant cost), stop fixing, write the corrected attribution into
   `performance-measurements.md`, and re-rank — do not ship F1 speculatively.
2. **F1 — per-(atlasId, frame, rgb) tint cache in `drawUIQuad`.** On first miss, run the
   existing composite once into a cached canvas (a `Map` keyed `atlasId/frame/#rrggbb`, or
   per-color cache atlases — implementer's choice); thereafter one `drawImage` per quad.
   Preserve exact semantics: untinted/white fast path, graceful missing-atlas/frame skips, alpha
   applied at draw time (never baked into the cache), and identical output pixels. Bound the
   cache (fixed palette × glyph/icon frames is naturally small; evict-on-grow is fine as a
   safety valve). Unit-test cache-hit behavior + pixel parity with the uncached path.
3. **Re-measure** (same machine, same scene, panels open). Target: `render.endFrame` back to
   single-digit ms; fps near display rate.
4. **F2 (only if F1 leaves the UI flush hot) — overlay dirty-skip.** Skip the Overlay2D
   clear+redraw when this frame's UI quad list is identical to last frame's and no
   particles/weather drew on the overlay. Beware world-anchored panels (inspect card, notice
   board, standings post) — they move with the camera every frame, so equality must be on the
   final quad list, not on panel dirty flags. This is invasive; take it only with a number
   proving F1 wasn't enough.
5. **F3 (cheap check while profiling):** `_ghostCovered` in the WebGPU renderer is an
   O(occludable × queue) scan — at 583 entities confirm it's negligible in the profile; fix
   only if it shows up.
6. **Non-goals (locked; do not relitigate):** the uncapped `setTimeout` render loop (kept by
   user decision 2026-06-12, brief 84), the WebGPU backend choice, the per-glyph quad emission
   API, and anything sim-side.

## Acceptance

- Baseline + post-fix profile exports captured on the affected machine and recorded in
  `wiki/performance-measurements.md` (dated section, same table style as 2026-06-10/12).
- FPS at default zoom **with all panels open** returns to ≥55 on that machine — or, if the
  hypothesis was falsified at step 1, a written, measured attribution of where the 216 ms goes
  plus a re-ranked fix list in `wiki/performance.md`.
- Rendering output unchanged (UI pixels identical; palette guard green). `npm run typecheck` +
  `npm run test` green, including the new ui-draw cache test.
- Determinism untouched by construction (render-only), but run `CHECK_DETERMINISM=1` once as
  the standard belt-and-braces.
- Closeout: update `wiki/performance.md` (new Tier-0 section for this regression, superseding
  banner style), `status.md`, `log.md`.
