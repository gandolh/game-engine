# Game Task 71 — Per-Asset Recipe Files + Cached Per-Sheet Atlas Builds

## Context

The bake principle stands: sprites are code-defined `PixelRecipe`s (ASCII grid + EDG32 palette chars), rasterized and packed at build time by [tools/atlas-builder](../../../../tools/atlas-builder/) into 6 committed sheets (`characters`, `buildings`, `terrain`, `crops`, `props`, `items-ui`) + `index.json` under [packages/farm-valley/public/atlas/](../../../../packages/farm-valley/public/atlas/) (brief 47). Two problems have grown with the asset count (~110 recipes / ~170 frames):

1. **[base-recipes.ts](../../../../tools/atlas-builder/src/recipes/base-recipes.ts) is a ~4,300-line monolith.** Authoring or reviewing one asset means navigating one giant literal; diffs are noisy; agents editing two assets in parallel collide on one file.
2. **The builder is all-or-nothing.** [src/index.ts](../../../../tools/atlas-builder/src/index.ts) re-rasterizes and re-encodes all 6 sheets on every run, even when nothing in a sheet changed — and because `pngjs` encoder options are unpinned defaults (`filterType: -1` auto), committed PNG bytes aren't a pure function of pixel content.

Design research backing every choice below: [wiki/asset-pipeline.md](../../../wiki/asset-pipeline.md) (industry cooking pattern, cache-key composition, packing-algorithm survey, padding/bleeding, Canvas2D-specific atlas tradeoffs — with sources).

This is **asset tooling only**. Runtime sheets, `atlasId` routing, the renderer, and the sim are untouched in behavior; the committed PNGs/JSONs are regenerated once.

## Goal

1. **One file per asset.** Split `base-recipes.ts` into `tools/atlas-builder/src/recipes/assets/<prefix>/<name>.ts`, the path mirroring the frame name (`assets/tile/shore.ts` exports the recipe named `tile/shore`; nested names like `farmer/conservative/walk-a` → `assets/farmer/conservative/walk-a.ts` — hand-authored ones only; generated frames stay generated). Each file default-exports (or named-exports) a single `PixelRecipe`. Keep per-asset comments (they're the asset documentation) — more detail per asset is welcome now that each lives alone.
2. **Build per group, skip unchanged groups.** Fingerprint each sheet's inputs; if the fingerprint matches the `inputsHash` stamped in the committed `<sheet>.json`, skip rasterize+encode+write for that sheet entirely. Changed sheets rebuild and re-stamp.
3. **Deterministic PNG bytes.** Pin the encoder: `filterType: 0`, `deflateLevel: 9`, `deflateStrategy: 3`. Identical pixels → identical bytes, so git diffs are honest and the hash skip is sound.

## Design decisions (made — don't relitigate; state deviations at the top of changed files)

1. **Aggregation is an explicit barrel, not fs-globbing.** `recipes/assets/index.ts` imports every asset file and exports `BASE_RECIPES` **in the exact current order** (packing is order-sensitive; preserving order keeps the one-time artifact diff reviewable). A generated barrel is acceptable if hand-maintaining ~110 imports proves error-prone, but it must be checked in and typecheck-visible. A test asserts every asset file's path matches its recipe `name` (so files can't drift) and that no two recipes collide.
2. **Cache key per sheet** = SHA-256 over, in a fixed documented order: content of every asset file mapping to that sheet (via `frameToSheetId`), `palette.ts`, `sheet-map.ts`, `types.ts`, the packing constants (PADDING, pow2 policy), the pinned PNG options, and a `BUILDER_VERSION` integer bumped whenever builder logic changes output. Sheets containing **generated** frames (`characters` via `templates.ts` + the composition logic in `recipes/index.ts`) additionally hash those generator sources. Hash file *content*, never mtimes. When in doubt whether an input affects a sheet, include it — a spurious rebuild is cheap; a stale committed sheet is not.
3. **The cache store is the committed manifest itself.** Add `inputsHash: string` to each `<sheet>.json`. No separate cache file, works across clones/worktrees, and `git status` shows exactly which sheets a change touched. The runtime loader/`atlas-format` must tolerate (ignore or type) the new field.
4. **`--force` flag** (or `FORCE=1`) bypasses all skips. `index.json` is rewritten only when its content would change.
5. **Packing stays as-is**: shelf, 1px padding, pow2 — near-optimal for our uniform 16px frames per the research (MaxRects' 95–98% occupancy advantage only materializes with mixed sizes; maxrects-packer is the documented upgrade path, not this brief). No rotation, no trimming, no extrusion (nearest-neighbor rendering; 1px transparent gutter suffices).
6. **Expect a one-time whole-atlas binary diff** when the pinned encoder options land (bytes change, pixels don't). Commit message must call this out. After that, only genuinely-edited sheets should ever diff — that's the acceptance signal for the cache.

## Files in scope

- `tools/atlas-builder/src/recipes/base-recipes.ts` → deleted, replaced by `recipes/assets/<prefix>/<name>.ts` (~110 files) + `recipes/assets/index.ts` barrel.
- `tools/atlas-builder/src/index.ts` — per-sheet fingerprint → skip/build decision; pinned PNG options; `--force`; per-sheet console summary gains `built|cached`.
- `tools/atlas-builder/src/recipes/index.ts` — import the barrel; unchanged composition order.
- A small `tools/atlas-builder/src/fingerprint.ts` (hashing helpers; `node:crypto`).
- `packages/engine/src/assets/atlas-format.ts` (+ loader if it validates shape) — accept the optional `inputsHash`.
- Regenerated `packages/farm-valley/public/atlas/*` committed once.
- Tests (vitest, atlas-builder workspace): path↔name agreement; no duplicate frame names; deterministic bytes (encode same recipe set twice → identical Buffer); cache behavior (unchanged inputs → skip, touched asset file → only its sheet rebuilds); existing `personality-hats.test.ts` and the palette guard stay green. Note the palette guard scans the source tree — ~110 new files full of palette chars must not trip it (chars are swatch keys, not color literals — verify).

## Files you must NOT touch

- Renderer (`canvas2d/`), sim systems, agents, snapshot/protocol — nothing at runtime changes behavior.
- `palette.ts` swatches / EDG32 values.
- Recipe pixel content — this is a pure reorganization; any pixel change is a different brief.

## Determinism guarantee

No sim-path change whatsoever; the sim never reads atlas files. `npm run typecheck` + `npm run test` green is the gate. (No determinism run needed — but if run, it trivially MATCHes.)

## Acceptance

- `npm run atlas` twice in a row: second run reports all 6 sheets `cached`, writes nothing, exits fast.
- Touch one crop asset file → only `crops.png`/`crops.json` rebuild and diff.
- `--force` rebuilds all sheets; output is byte-identical to the cached artifacts (proves determinism).
- Frame names, counts, and rects in the regenerated manifests are identical to before the split (pixel-identical PNGs aside from the one-time encoder repin) — the game renders identically in `npm run dev`.
- `npm run typecheck` + `npm run test` green across workspaces.

## Open question for the author

Should hand-authored farmer idle/walk frames (currently in the monolith, hat-stamped at compose time) migrate under `assets/farmer/...`, or move toward the template generator entirely? Default: migrate as-is (pure reorganization); flag in the report if the generator route would delete significant duplication.

## Workflow

Sonnet executor. Read [src/index.ts](../../../../tools/atlas-builder/src/index.ts), [recipes/index.ts](../../../../tools/atlas-builder/src/recipes/index.ts), [recipes/sheet-map.ts](../../../../tools/atlas-builder/src/recipes/sheet-map.ts), and skim the monolith's structure before splitting (script the split — don't hand-copy 4,300 lines). Then: split → barrel → fingerprint/skip → pin PNG options → regenerate → tests. Report file count, per-sheet built/cached output of a no-op second run, and test counts. Do not commit.
