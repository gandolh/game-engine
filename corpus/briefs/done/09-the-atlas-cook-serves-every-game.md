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

## Outcome (2026-11-21)

Done. [tools/atlas-builder](../../../tools/atlas-builder/) is now a cook that knows no game:

- [config.ts](../../../tools/atlas-builder/src/config.ts): `AtlasConfig` (id, recipes, `sheetOf`, `sheetOrder`,
  `swatches`, `palette`, `hashInputs`, `outDir`, `urlBase`) and `checkSwatches`. `palette` is an engine
  palette by name (`"EDG32"`, resolved by the cook) or a game's own `{ name, colors }`. Naming keeps the
  recipe package free of an engine import, which would have pulled the render barrel's shader typings into
  it; MateQuest's `MATE_PAL` subset (brief 12) will be listed.
- [cook.ts](../../../tools/atlas-builder/src/cook.ts): `buildAtlas(config, { force })`, with the same shelf
  packing, 1 px padding, power-of-two sizes, pinned PNG options and per-sheet `inputsHash` skip. A cached
  manifest that points at a different URL base is cooked again, since the base is config, not a hashed file.
- [fingerprint.ts](../../../tools/atlas-builder/src/fingerprint.ts): `computeSheetHash(sheetId, files)`, still
  `BUILDER_VERSION`, the PNG options and the pack constants, then the config's files in order.
- [games.ts](../../../tools/atlas-builder/src/games.ts) registers Farm; [index.ts](../../../tools/atlas-builder/src/index.ts)
  is the CLI. The root script is `npm run build -w @tool/atlas-builder --`, so `npm run atlas -- farm` and
  `npm run atlas -- --force` reach the cook (before, `--force` after `npm run atlas --` went to npm). An
  unknown id exits 2 naming the registered games.
- Farm's config is [atlas-config.ts](../../../games/farm/atlas-recipes/src/atlas-config.ts), exported as
  `@farm/atlas-recipes/atlas`. It is a subpath export rather than a line in `index.ts` because `index.ts` is a
  hashed input of the four sheets with generated frames: a first try that exported it from there changed
  those four `inputsHash` values with no pixel changed. The one-time legacy `main.png` clean-up was dropped.

**Acceptance.**

- `npm run atlas -- --force` rewrote all six PNGs and manifests with no diff at all (`git diff --stat
  games/farm/client/public/atlas` empty): `inputsHash` is unchanged too, because the hashed files and their
  order are the same.
- A second `npm run atlas` reports 6 sheets cached; `npm run atlas -- farm` the same.
- [cook.test.ts](../../../tools/atlas-builder/src/cook.test.ts) cooks a fixture game (two recipes, a two-colour
  palette) into a temporary folder, checks the manifest, index and pixels, finds it cached, re-cooks on a
  changed input or URL base, and fails the cook on an off-palette swatch (`recipe "gem/blue": character "b"
  is #010203, not in fixture-2`) and on a character with no swatch. Farm's existing builder tests run against
  its config.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

**For brief 12:** the layering test gives `tools/atlas-builder` Farm's scope, so registering MateQuest's
recipe package there needs that scope widened for the cook alone.

