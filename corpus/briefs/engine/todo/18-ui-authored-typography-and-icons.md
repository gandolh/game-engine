# Engine brief 18 — @engine/ui authored typography + icon glyphs

status: todo
source: [todos/2026-06-30-engine-ui-authored-typography-and-icons.md](../../../todos/2026-06-30-engine-ui-authored-typography-and-icons.md) — that todo is the spec (scope 1–4 + acceptance); this brief promotes it into the engine queue and adds sequencing notes.

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
