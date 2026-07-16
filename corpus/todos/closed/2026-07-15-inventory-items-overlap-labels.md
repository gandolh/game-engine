---
title: "Farm Valley UI — Inventory items not placed under their section label; they overlap the text"
created: 2026-07-15
status: closed (2026-07-16, `9744207` — slot glyph reserved text height, icon painted 30px over it)
tags: [farm, ui, bug]
---

# Inventory items overlap their section labels

In the Inventory window, items are not laid out *under* their label — they are
drawn on top of / overriding the label text.

## Context

- Layout bug in the inventory panel's vertical flow: the item grid/rows likely
  don't advance the y-cursor past the label's height (or the label is drawn at
  the same origin as the first item row).
- Same UI stack as the other panel bugs filed 2026-07-15
  ([farmers-window-flicker](2026-07-15-farmers-window-flicker.md),
  [shop-window-too-short](2026-07-15-shop-window-too-short.md)) — likely worth
  fixing the three panel-layout issues in one pass.

## Acceptance

Each inventory section label renders on its own line with its items laid out
below it; no text/item overlap at any inventory fill level.

## Resolution (2026-07-16)

The slot `glyph` label had no fixed layout size, so it measured one text line (~10px) tall while
`drawIcons` paints a full 30px `ICON_SIZE` sprite over its rect — spilling ~20px down over the
caption/count text. `hotbar.ts` already carried the exact fix (with a comment); `inventory.ts` was
missing the same reservation: `layout: { width: ICON_SIZE, height: ICON_SIZE }`. New
`inventory.test.ts` (none existed) covers refresh, the non-overlap regression, and slot-pool
resizing. Fixed in the same pass as the other two 2026-07-15 panel bugs, as this todo suggested.
