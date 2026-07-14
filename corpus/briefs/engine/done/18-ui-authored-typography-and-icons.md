# Engine brief 18 — @engine/ui authored typography + icon glyphs

status: DONE (2026-07-14)

> **✅ DONE 2026-07-14.** Shipped: the UNSCII font (public domain; `BODY_FONT` 8×8 +
> `DISPLAY_FONT` 8×16, vendored `.hex` → committed glyph tables, deterministic boot-time bake),
> a 34-icon set at 16×16 as **shade-index masks** with a caller-supplied 3-colour ramp (so ONE set
> serves Apollo-46 Citadel and EDG32 Farm while the engine imports neither), an `icon()` widget,
> Citadel's build bar restored to a compact **icon grid**, and the goods strip iconified. The 5×7
> font is deleted, not demoted.
>
> Two things the brief did not anticipate, both now durable knowledge in
> [wiki/engine-ui.md](../../../wiki/engine-ui.md):
> 1. **The reflow was the real work.** 5px → 8px glyphs broke four layouts, and **no unit test
>    caught any of them** — all four needed a browser. Their common shape: something positioned by
>    a constant or a guess rather than by the laid-out rect (a magic `panel.height * 0.52`; a
>    container shorter than its own default padding; a node reserving a text line where a 26px
>    sprite gets drawn).
> 2. **Labels could not wrap** — `LabelNode` never exposed the text engine's wrap support, so any
>    fixed-width panel holding dynamic text overflowed by construction. `label({ maxWidth })` is new.
>
> The brief's suggestion to "consider reusing the recipe/rasterize machinery" from Citadel was
> **correctly not taken** — the engine may never import a game. The icon pipeline re-implements the
> few lines it needs, and stores shades rather than palette chars.
>
> Gates: typecheck 0; full suite **2241 green**; both games browser-verified on a real GPU.
source: [todos/closed/2026-06-30-engine-ui-authored-typography-and-icons.md](../../../todos/closed/2026-06-30-engine-ui-authored-typography-and-icons.md) — that todo is the spec (scope 1–4 + acceptance); this brief promotes it into the engine queue and adds sequencing notes.

## Summary

Replace the hand-coded 5×7 ASCII bitmap font ([engine/ui/src/text/glyphs.ts](../../../../engine/ui/src/text/glyphs.ts))
with an authored pixel font + a UI icon-glyph set (buildings/tools/goods) baked to an
atlas, exposed via an `icon(name)` widget — then restore the Citadel build bar's compact
icon grid (currently wide text labels) and iconify the goods strip.

## Sequencing / design notes beyond the todo

- Keep the `UISurface` seam: swap the glyph source under `drawText`/`layoutText`, don't
  fork the text path. The font-atlas bake stays deterministic + headlessly testable (the
  current `font-atlas.ts` pattern is the model).
- Author icons with the same discipline as the Citadel sprite recipes (EDG32 roles,
  silhouette-first at ~8–12px, tintable masks) — consider reusing the recipe/rasterize
  machinery rather than a parallel pipeline.
- Farm's in-canvas UI (hotbar, inspect card, HUD) consumes the same stack — pick up its
  font sizes/weights needs while at it (world-clock/playback-controls already carry
  "ASCII-only" workaround comments to retire).
- Both games' UIs re-verified in a real browser (per the UI acceptance rule); the a11y
  mirror strings stay text regardless of icons.

## Acceptance

Per the source todo: authored font atlas in use (5×7 mask retired or demoted to fallback),
`icon()` widget + building/tool/good glyph set, Citadel build bar back to an icon grid,
EDG32 guard green, deterministic bake, both games' UI tests green + browser pass.
