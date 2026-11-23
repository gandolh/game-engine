---
summary: The atlas cook as of 2026-11-21: one cook for every game's recipes through a per-game AtlasConfig (how to add a game, the palette check), and one runtime page per game (the packing rule, the page-aware loader, texture grouping, and the measured 49 → 1 draw groups).
updated: 2026-11-21
---

# The atlas cook

The background (the bake principle, cooking and atlas research, the cache keys) is on
[asset-pipeline.md](asset-pipeline.md); the decisions are in the Assets entry of [decisions.md](decisions.md).

## One cook for every game (brief 09)

[tools/atlas-builder](../../tools/atlas-builder/) knows no game. Each recipe package exports an
`AtlasConfig` ([config.ts](../../tools/atlas-builder/src/config.ts)): its recipes and the frame-to-sheet
function, the sheet order, the swatch table and the palette it is checked against, the files hashed into
each sheet, the output folder and the URL prefix. `buildAtlas(config, { force })` cooks one game, `npm run
atlas` cooks every registered game, and `npm run atlas -- farm` (or `-- --force`) one. Shelf packing, the
1 px padding, power-of-two sides, pinned PNG bytes and the per-sheet `inputsHash` skip are unchanged, and
`BUILDER_VERSION` is in every hash.

**Adding a game's recipe set:**

1. A recipe package in the game (`games/<game>/atlas-recipes/`) with recipes as character grids and a
   swatch table, colours from the game's palette.
2. An `atlas-config.ts` exporting `ATLAS_CONFIG`, as Farm's
   ([atlas-config.ts](../../games/farm/atlas-recipes/src/atlas-config.ts), exported as
   `@farm/atlas-recipes/atlas`). `palette` names an engine palette (`"EDG32"`) or lists the game's own
   colours (`{ name, colors }`). `hashInputs` lists every file a sheet's pixels come from, so a change re-cooks
   it. The game never imports the tool: the shape is checked where the cook registers it.
3. Add it to [games.ts](../../tools/atlas-builder/src/games.ts) and to the builder's dependencies.

A swatch outside the config's palette, or a character with no swatch, fails the cook with the recipe and
the character named. Farm's config is the values that were written into the cook, moved; its PNGs and
manifests came out byte for byte the same.

## One runtime page per game (brief 10)

WebGL2 batches per texture: [webgl2/renderer.ts](../../engine/core/src/render/webgl2/renderer.ts) ends a
draw group when the texture changes. With one texture per sheet, Farm's layer-40 dressing alternated `props`
and `buildings` and cost 40 of 49 groups. So the run time now sees one page, while the sheets stay what they
were for authoring and the per-sheet cache:

- **The cook** ([pages.ts](../../tools/atlas-builder/src/pages.ts)) packs a game's cooked sheets as whole
  blocks: tallest first into columns, in the smallest power-of-two page that holds them (the squarer on a
  tie), at most 2048 px a side, a second page only if the blocks don't fit one. `index.json` gains `pages`,
  `placements` (each sheet's page and corner) and `pagesHash`, a hash of every sheet's `inputsHash`, so the
  page is composed again only when a sheet changed. Farm: one 512×1024 `page-0.png`.
- **The loader** (`loadAllAtlasSheets`) fetches each page once and gives every sheet on it the page's
  bitmap, the page's size and its frames offset by the sheet's corner (`sheetOnPage`). Every
  `(atlasId, frame)` lookup keeps working, including the CPU raster that bakes the static layer.
- **The GL store** uploads one texture per bitmap, so sheets on one page share it; **the renderer** runs a
  group while the texture stays the same, and `lastDrawStats.atlases` counts textures.

Measured: the draw-group probe went from 49 groups to 1 (seed `0xc0ffee`); Farm creates 6 textures at
boot instead of 11; the bench scene's main pass draws 1 group a frame instead of 47.8. The `?card` scene
renders byte for byte the same, and `npm run preview` writes the same PNG.
