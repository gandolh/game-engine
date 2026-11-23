# Task 23: recipes to PNG and back

**Origin:** the [recipe and PNG round trip todo](../../todos/2026-11-20-recipe-and-png-round-trip.md),
promoted by the owner on 2026-11-23 with the rest of the measure-first todos: build light optimizations that
are not too heavy, complex or wide ([decisions.md](../../wiki/decisions.md) → Frame budget). The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** none. Brief 13 plans `tools/recipe-import` for its `grid.txt` drafts. If 13 has built it,
add the PNG input to that tool; if not, create the tool with PNG input, and brief 13 adds `grid.txt` to it.

## Context

Recipes are text, which suits agents and diffs, but no pixel editor opens them. Studios that keep a text or
data source still let artists work in their editor, through an export and an import. Each game draws from a
fixed palette, enforced by the palette guard test, so an editor has to offer only those colours.

The cook already writes PNGs with `pngjs` (`tools/atlas-builder`).

## Files you OWN

- `tools/recipe-export/` (new) and `tools/recipe-import/` (new, or brief 13's), their `package.json` with
  pinned versions, a `test` script and tests
- The root `package.json`, only for two scripts that run them
- `corpus/` pages for this brief: the outcome, `log.md`, the todo's status line and
  [asset-pipeline.md](../../wiki/asset-pipeline.md) (how to edit a sprite in a pixel editor)

## Files you must NOT touch

- Any game's recipes or palette: the tools read them and write new files only where asked.
- The atlas cook.

## What to do

1. **Export.** `recipe-export <game> <frame>` writes the recipe as an indexed PNG whose palette is the
   game's swatch table, in order, with index 0 transparent, so Aseprite or LibreSprite offer only legal
   colours.
2. **Import.** `recipe-import <game> <file.png>` reads an indexed or RGBA PNG, maps each pixel to the
   game's palette by exact colour, refuses any colour that isn't in it (naming the pixel and the colour),
   and writes the recipe file. A recipe character that two swatches share resolves to the first in the
   swatch table, as the palette guard does.
3. **Document the loop** on [asset-pipeline.md](../../wiki/asset-pipeline.md): export, edit, import, cook.

## Acceptance

- A test exports every Farm and MateQuest recipe and imports it back to a byte-identical recipe.
- A test imports a PNG with one off-palette pixel and gets a refusal naming it.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- None. Try it once if you like: export a sprite, open it in a pixel editor, change a pixel, import it.
