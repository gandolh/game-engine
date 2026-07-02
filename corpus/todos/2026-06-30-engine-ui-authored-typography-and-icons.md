---
title: "@engine/ui — authored typography + icon assets (replace the minimal 5×7 bitmap font)"
created: 2026-06-30
status: todo
tags: [engine, ui, render, typography, assets, citadel, farm]
---

> **➡️ Promoted 2026-07-03:** now [engine brief 18](../briefs/engine/todo/18-ui-authored-typography-and-icons.md)
> (this todo stays the spec; the brief adds sequencing notes).

# Author proper typography + icon glyphs as assets for the in-canvas UI

The `@engine/ui` text stack currently renders through a **minimal, hand-coded 5×7 ASCII
bitmap font** ([engine/ui/src/text/glyphs.ts](../../engine/ui/src/text/glyphs.ts) —
codepoints `0x20–0x7e` only, baked to an atlas in
[font-atlas.ts](../../engine/ui/src/text/font-atlas.ts)). That is functional but:

- **ASCII-only, no icons.** Emoji / pictographic glyphs can't render in-canvas, which is
  why the Citadel **build bar** migration fell back to *text labels* instead of the old
  emoji icon grid (see [all-GUI-in-game](2026-06-28-citadel-ui-all-rendered-in-game.md)).
- **Coarse + utilitarian.** A 5×7 mask reads as placeholder, not the authored cozy-pivot
  pixel aesthetic the rest of the game has.

## Scope
Author real assets — **a richer pixel font + a set of UI icon glyphs** — and draw the
in-canvas UI from *those assets* (a baked sprite atlas) rather than the minimal generated
bitmap:

1. **A proper authored pixel font** (a wider/cleaner glyph set, EDG32-tintable mask, ideally
   with a few weights/sizes) baked to an atlas the existing `drawText`/`layoutText` path can
   consume (keep the `UISurface` seam — just swap the glyph source).
2. **UI icon glyphs** for the build bar + HUD: per-building/tool icons (house/farm/mill/…/road/
   demolish/upgrade) + good icons (grain/flour/bread/wood/planks/stone/tools) as atlas frames,
   exposed as an `icon(name)` widget so buttons/chips show an authored icon, not text.
3. Wire the **build bar** back to an **icon grid** (the cozy compact look) once icons exist;
   the goods strip can show good-icons instead of colour-coded text.
4. EDG32 palette throughout (guard test); deterministic bake (headlessly testable raster like
   the current font atlas).

## Why
"All GUI in-game" should *look* authored, not like a debug font. Icons also make the build bar
compact again (text labels are wide). This is the asset investment that lets the in-canvas UI
match the game's pixel aesthetic — shared across Citadel + Farm Valley.

## Acceptance
- The in-canvas UI renders from an **authored** font atlas (not the 5×7 generated mask); a set
  of building/tool/good **icon glyphs** exists as atlas frames with an `icon()` widget; the
  Citadel build bar uses the icon grid again; EDG32-clean; deterministic bake; tests green.
