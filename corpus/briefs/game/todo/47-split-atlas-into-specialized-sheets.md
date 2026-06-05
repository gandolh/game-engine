# Game Task 47 — Split the Atlas into Specialized Sheets

## Context

All sprites currently come from a **single** texture atlas. The [atlas-builder](../../../../tools/atlas-builder/) packs every recipe in [recipes.ts](../../../../tools/atlas-builder/src/recipes.ts) (110 recipes / ~157 frames as of 2026-06-04) into one `main.png` + `main.json` via `packShelf(RECIPES)`, written to [packages/farm-valley/public/atlas/](../../../../packages/farm-valley/public/atlas/). The renderer holds exactly one atlas: [`Canvas2dRenderer.setAtlas`](../../../../packages/engine/src/render/canvas2d.ts) stores a single `LoadedAtlasImage`, and `drawSprite` resolves `atlas.frameRect(s.frame)` against it. Every game sprite already carries `atlasId: "main"` (in [components.ts](../../../../packages/farm-valley/src/components.ts) sprite + the `SnapshotSprite`/`Canvas2dSprite` path) — **but the renderer ignores `atlasId` entirely**, since there is only one atlas.

The frame names are already namespaced by category prefix, so the natural seams are visible:

| Prefix | Count | Belongs in sheet |
|---|---|---|
| `structure/*` | ~39 | **buildings** (market, shop, mill, well, fountain, podium, fences, fishing-spot, home, bridge…) |
| `tile/*` | ~25 | **terrain** (grass/dirt/path/sand/water/carpentry-floor…) — baked into the static layer + water pattern |
| `farmer/*` | ~12 | **characters** (per-personality walk/work/idle + Pip) |
| `npc/*` | ~6 | **characters** (blacksmith/carpenter poses, idle) |
| `crop/*` | ~9 | **crops** (radish/wheat/pumpkin × seed/growing/mature) |
| `decoration/*` | ~12 | **props** (barrel/crate/lamp-post/signpost/hay-bale/bush/log-stack…) |
| `fish/*` | ~3 | **items** (minnow/bass/salmon) |
| `tool/*`, `indicator/*`, `debug/*` | ~4 | **ui/misc** (meet bubble, tool icon, debug marker) |

This is a tooling + renderer refactor, **not a gameplay change**. The motivation: smaller, purpose-grouped sheets are easier to author/iterate (regenerate just `characters` when a walk frame changes), make the atlas diffs in git readable, and set up future per-category texture work (e.g. seasonal terrain variants in brief 45 could swap just the `terrain` sheet).

## Goal

Emit **multiple specialized atlas sheets** instead of one `main.png`, and teach the renderer to resolve a sprite's frame against the correct sheet via its already-present `atlasId`.

Proposed sheets (final grouping is the executor's call — confirm against the table above; keep it to ~5–7 sheets, don't over-split):

- `characters` — `farmer/*` + `npc/*`
- `buildings` — `structure/*`
- `terrain` — `tile/*`
- `crops` — `crop/*`
- `props` — `decoration/*`
- `items-ui` — `fish/*` + `tool/*` + `indicator/*` + `debug/*`

Each sheet → its own `<name>.png` + `<name>.json` (manifest `id: "<name>"`, `imageUrl: "/atlas/<name>.png"`).

## Design decisions to make (state your choices at the top of the changed files)

1. **Grouping source of truth.** Either tag each `PixelRecipe` with a `sheet` field, or derive the sheet from the frame-name prefix in the builder. Prefer an explicit mapping (prefix → sheet) in the builder so a new prefix fails loudly rather than silently landing in a default sheet.
2. **`atlasId` becomes load-bearing.** Today every sprite hardcodes `atlasId: "main"`. Each sprite must now carry the sheet id that owns its frame. Centralize this: a single `frameToAtlasId(frame)` (or a per-recipe sheet tag surfaced into a `frame → sheetId` lookup shipped in a manifest) so the worker's `snapshot-builder.ts` / `render-systems.ts` set the right `atlasId` from the frame name — **do not** hand-edit every `world.spawn({ sprite })` call site. The static-layer bake + water pattern (`bakeStaticLayer`, `bakeWaterPattern`) pull from `terrain`/`buildings` — make sure those resolve too.
3. **Renderer holds a map of atlases.** Replace the single `this.atlas` with `Map<string, LoadedAtlasImage>` keyed by manifest id; `setAtlas` becomes `addAtlas(atlas)` (or accepts many). `drawSprite` looks up `atlases.get(s.atlasId)` then `.frameRect(s.frame)`. Keep a clear error if a sprite references an unknown atlasId or a frame missing from its sheet. (Decide whether to keep a back-compat single-`setAtlas` path for the engine's other consumers/tests, or migrate them.)
4. **Loading.** `main.ts` `fetchAtlasManifest()` fetches one hardcoded `/atlas/main.json` today. Change to load all sheet manifests (a small index, or a known list emitted by the builder — e.g. an `atlas/index.json` listing the sheet ids) and `addAtlas` each. Prefer the builder emitting an index so adding a sheet needs no main.ts edit.
5. **Keep determinism / palette guarantees.** No sim or determinism impact (this is render/tooling only — the `CHECK_DETERMINISM` run must still MATCH because nothing in the tick path changes). The EDG32 palette guard still applies to recipe swatches.

## Files in scope

- `tools/atlas-builder/src/recipes.ts` — add the sheet grouping (recipe `sheet` tag or an exported prefix→sheet map).
- `tools/atlas-builder/src/index.ts` — pack + rasterize + write **one PNG+JSON per sheet**; emit an `atlas/index.json` listing sheet ids (+ imageUrl) for the loader. Update the console summary (frames per sheet).
- `packages/engine/src/render/canvas2d.ts` — atlas **map**; `addAtlas`; `drawSprite` resolves by `atlasId`; `bakeStaticLayer` / `bakeWaterPattern` resolve their sheet. Clear errors on missing atlas/frame.
- `packages/engine/src/assets/loader.ts` / `atlas-format.ts` — unchanged shape per-sheet; optionally a tiny helper to load the index + all sheets.
- `packages/farm-valley/src/main.ts` — `fetchAtlasManifest` → load the index + every sheet manifest; `addAtlas` each before bake.
- `packages/farm-valley/src/render-systems.ts` + `worker/snapshot-builder.ts` — set each sprite's `atlasId` from its frame (single `frameToAtlasId` helper); the farmer/NPC frame pickers already produce `farmer/*`/`npc/*` names, so route those to `characters`.
- Re-run the builder and **commit the regenerated sheets** under `public/atlas/` (replacing `main.png`/`main.json`); delete the old `main.*` if fully superseded. (Note: atlas artifacts are committed — see CLAUDE.md.)
- Tests: a builder test (every recipe lands in exactly one sheet; no orphan prefix); a renderer test (a sprite with atlasId X resolves against sheet X; unknown atlasId/frame throws); update any existing render/atlas tests that assumed a single atlas.

## Files you must NOT touch

- `agents/**`, sim systems, the tick path — this is render + asset tooling only.
- The EDG32 palette / swatch definitions (beyond moving recipes between groupings).

## Determinism guarantee

Nothing in the sim/tick path changes. After wiring, `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` must still MATCH (it should be trivially unaffected — verify anyway).

## Acceptance

- `npm run build-wasm` not required; `npm run typecheck` + `npm run test` green.
- The builder writes ≥5 sheets + an index; every frame is reachable; no frame is duplicated across sheets.
- `npm run dev`: the world renders identically to before (same sprites, same positions) — this is a no-visual-change refactor. Verify in the browser (Playwright/manual): farmers, buildings, crops, terrain, decorations, fish/tooltips all still draw.
- Determinism MATCHes across the three seeds.

## Open question for the author

Is the goal purely **authoring/iteration ergonomics** (then per-sheet PNGs + the renderer map is the whole job), or is a **future runtime benefit** intended (lazy-load a sheet, hot-swap seasonal terrain)? If the latter, design `addAtlas` so a sheet can be added/replaced after first render (brief 45's seasonal terrain would consume this). Decide and note it; don't build the lazy/hot-swap path unless it's cheap to leave the seam open.

## Workflow

Sonnet executor. Read [tools/atlas-builder/src/index.ts](../../../../tools/atlas-builder/src/index.ts) + [recipes.ts](../../../../tools/atlas-builder/src/recipes.ts) (packing + output), [packages/engine/src/render/canvas2d.ts](../../../../packages/engine/src/render/canvas2d.ts) (`setAtlas`/`drawSprite`/`bakeStaticLayer`/`bakeWaterPattern`), [packages/engine/src/assets/loader.ts](../../../../packages/engine/src/assets/loader.ts), and the atlas-load block + `frameToAtlasId` candidate sites in [main.ts](../../../../packages/farm-valley/src/main.ts) / [worker/snapshot-builder.ts](../../../../packages/farm-valley/src/worker/snapshot-builder.ts). Decide the grouping + index format, implement, regenerate sheets, typecheck, test, verify no-visual-change in the browser, run determinism. Report files changed + sheet/frame counts + test counts. Do not commit.
