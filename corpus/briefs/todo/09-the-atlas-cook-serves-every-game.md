# Task 09: the atlas cook serves every game

**Origin:** the owner, 2026-11-20: pick the best way for asset work, reverting old decisions where
that helps. This brief reverts the atlas builder being Farm's alone. The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Depends on:** nothing.

## Context

`tools/atlas-builder` bakes `PixelRecipe` grids into atlas sheets with pinned PNG bytes and a
per-sheet `inputsHash` cache. Everything it needs to know about a game is written into its code:

- it imports `@farm/atlas-recipes`;
- it lists Farm's six sheets in `sheetOrder`;
- it writes into `games/farm/client/public/atlas`;
- `fingerprint.ts` hashes Farm's `palette.ts`, `sheet-map.ts`, `types.ts` and `templates.ts`.

So no other game can have an atlas. MateQuest draws its seven combat sprites from rectangles every
frame (`games/mathquest/client/src/ui/sprites.ts`), and its design page plans pixel art "via the
atlas-recipe pipeline". Industry tools such as TexturePacker, Unity's sprite atlas and Godot's
import step all take a project's own configuration instead of hard-coding one project.

## Files you OWN

- `tools/atlas-builder/` (source, tests, `package.json`)
- `games/farm/atlas-recipes/`: a new atlas config file and its export, nothing else
- The root `package.json` `atlas` script
- `corpus/` pages for this brief: the outcome, `log.md`, [asset-pipeline.md](../../wiki/asset-pipeline.md)
  (a short "one cook for every game" section) and the Assets entry of [decisions.md](../../wiki/decisions.md)

## Files you must NOT touch

- Any recipe's pixels, `palette.ts`, `templates.ts` and `sheet-map.ts`. Farm's art does not change.
- Any `sim-core`, client or server code. Nothing at run time changes in this brief.

## What to do

1. **A config per game.** A recipe package exports an atlas config:
   - the recipe list and the frame-to-sheet function;
   - the sheet order;
   - the swatch table and the palette scope it is checked against;
   - the files whose content goes into each sheet's hash;
   - the output folder.

   Farm's config is today's hard-coded values, moved.
2. **The builder takes configs.** `buildAtlas(config, { force })` cooks one game. `npm run atlas`
   cooks every registered game, and `npm run atlas -- farm` cooks one. Keep the pinned PNG options,
   shelf packing, the 1 px padding, power-of-two sizes and the per-sheet `inputsHash` skip. Add the
   builder's own version to every hash, as `BUILDER_VERSION` already is.
3. **Each config's swatches are checked against its palette scope.** Farm's against EDG32, as the
   palette test does today. A config whose swatch is outside its scope fails the cook with the
   recipe and the character named.
4. **Document it.** On [asset-pipeline.md](../../wiki/asset-pipeline.md), say how to add a game's
   recipe set. Amend the Assets entry in [decisions.md](../../wiki/decisions.md): one build-time cook
   for every game's recipes, still no external art pipeline.

## Acceptance

- `npm run atlas -- --force` rewrites Farm's six PNGs byte for byte as before (compare with
  `git diff --stat`). The manifests are unchanged except `inputsHash`, which may change only if a
  hashed input moved. If it did, the outcome says why.
- A second `npm run atlas` reports every sheet cached.
- A builder test cooks a small fixture game, two recipes and its own palette, into a temporary
  folder. A second test shows an off-palette swatch failing the cook.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- None. Nothing shipped changes.
