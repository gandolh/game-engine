# Task 23: recipes to PNG and back

**Origin:** the [recipe and PNG round trip todo](../../todos/closed/2026-11-20-recipe-and-png-round-trip.md),
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

## Outcome (2026-11-23)

Built: `tools/recipe-export` (`npm run recipe:export -- <game> <frame> [--out <file|folder>]`) and `tools/recipe-import` (`npm run recipe:import -- <game> <file.png> [--frame <name>] [--out <file>]`). How to use them is in [asset-pipeline.md](../../wiki/asset-pipeline.md).

- **Export.** Indexed PNG (8-bit, colour type 3) with the swatch table as PLTE in order, index 0 transparent through tRNS. `pngjs` cannot write indexed PNGs, so `export.ts` writes the chunks itself (zlib deflate, `zlib.crc32`). The game lookup uses the cook's registered `AtlasConfig`s, so a game added to the cook is covered; it finds the recipe folder through the `palette.ts` in the config's `hashInputs`.
- **Import.** Reads indexed or RGBA PNGs (`pngjs` decodes both to RGBA), exact-colour match. Refuses off-palette and partly transparent pixels, naming each (first eight listed) and the colour; refuses a size mismatch. The one-reader-per-format seam is `src/png.ts` (`readPngGrid`); brief 13 adds a `grid.txt` reader beside it and calls `importRecipeText`.
- **Byte-identical: the original file is the template** (no sidecar). Only the characters inside the `pixels: [ ... ]` rows are replaced, so comments, `size`, spacing and the trailing newline survive. A pixel that keeps its colour keeps its character (Farm's `g` and `L` share a colour); a changed pixel gets the first swatch with that colour. The import needs the game's own recipe file to exist and reads it only; `--out` decides where the result goes, stdout without it.
- **Not covered:** the 143 of Farm's 382 frames generated in code from `templates.ts` (`farmer/*` poses and the like) have no recipe file. They export, and import refuses them with a message. All 239 Farm and 7 MateQuest recipe files round-trip.
- **Tests:** `import.test.ts` round-trips every file recipe of both games through a real PNG in a temp dir; one off-palette pixel gives a refusal naming `pixel (3, 5)` and `#010203`; also partial alpha, wrong size, first-in-table, transparent pixels, generated frames. `export.test.ts` checks the PNG's type, palette and decoded pixels. Nothing writes into a game.
- **Trap:** npm runs a workspace script from its own folder, so the CLIs read `INIT_CWD` for relative paths. `npm --prefix <repo> run ...` from elsewhere makes `INIT_CWD` the repo root; run from the folder you mean.
- **Outside the owned files:** `engine/core/src/layering.test.ts` lists every workspace and failed on the two new ones; they are added with scope `null` (they import no game; they reach the games through `@tool/atlas-builder`).
