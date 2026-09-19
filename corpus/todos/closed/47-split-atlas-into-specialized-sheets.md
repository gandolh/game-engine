# Game Task 47 — Split the Atlas into Specialized Sheets

**Status:** Done
> Condensed 2026-06-13 — original spec in git history.

Refactor the single `main.png` atlas into multiple specialized sheets so sheets can be regenerated independently and future seasonal swaps (brief 45) can replace just one sheet.

## What shipped

- `tools/atlas-builder/src/recipes.ts` — each `PixelRecipe` tagged with a `sheet` field; an explicit prefix→sheet map ensures unknown prefixes fail loudly.
- `tools/atlas-builder/src/index.ts` — emits one PNG+JSON per sheet plus an `atlas/index.json` listing all sheet ids; console summary shows frames per sheet.
- Six sheets: `characters` (`farmer/*` + `npc/*`), `buildings` (`structure/*`), `terrain` (`tile/*`), `crops` (`crop/*`), `props` (`decoration/*`), `items-ui` (`fish/*` + `tool/*` + `indicator/*` + `debug/*`).
- `packages/engine/src/render/canvas2d.ts` — `setAtlas` replaced by `addAtlas(atlas)`; renderer holds `Map<string, LoadedAtlasImage>`; `drawSprite` resolves by `s.atlasId`; `bakeStaticLayer` / `bakeWaterPattern` resolve their sheet; clear errors on unknown atlasId or missing frame.
- `packages/farm-valley/src/main.ts` — loads `atlas/index.json` then fetches + `addAtlas`s each sheet before bake.
- `packages/farm-valley/src/render-systems.ts` + `worker/snapshot-builder.ts` — centralized `frameToAtlasId(frame)` helper sets `atlasId` from frame name; no hand-editing of call sites.
- Regenerated sheet artifacts committed to `packages/farm-valley/public/atlas/`; old `main.*` removed.
- Tests: every recipe lands in exactly one sheet; renderer resolves by atlasId; unknown atlasId/frame throws.
- `addAtlas` designed so a sheet can be added/replaced after first render (seam left open for brief 45 seasonal terrain).
- Pure render/tooling change — no sim/determinism impact.
