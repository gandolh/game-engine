# Game Task 90 — Model B prep: pure `generateWorld(seed)` + per-region mask plumbing

> **✅ DONE 2026-06-14.** Both pure refactors shipped, zero behavior change.
> Part A: `generateWorld(seed): GeneratedWorld` wraps all eager gen in `world/regions.ts`;
> `DEFAULT_WORLD = generateWorld(WORLD_GEN_SEED)` called once at module scope, re-exports every
> prior named symbol (`REGIONS`/`ROADS`/9 tiles/`TOWN_SQUARE`/`ranchForFarm`) so ~118 callers
> didn't churn. `makeRadialFarmRegion`/`placeRanches`/`scaleAroundNearestIsland` param-threaded off
> the passed seed (stable `'farm-ring-jitter'` fork label preserved). Part B: `RegionDef.mask?:
> Uint8Array` (all-1 this brief) + `regionMaskAt`/`forEachLandTile`; `regionAt` now mask-aware (the
> central lever — sites routed through it auto-adapt). Direct bounds-iterators converted in
> `walkable-grid.ts`/`resource.ts`/`carpenter.ts` (roads loop stays rect; `placeFootprint` + bubbles
> margin-ring left as-is). Masks never enter the snapshot. **Verification:** typecheck adds zero new
> errors; 45 sim-core unit tests green incl. new `generateWorld` deep-equal + determinism + all-1-mask
> tests. The multi-seed `EXPORT=json` byte-identity diff was **skipped** (user call, constrained
> hardware) — unit tests + review stood in. → unblocks [91](91-modelb-ca-shapes-and-mask-derived-anchors.md).

**Status:** Done
**Epic:** Organic world gen (Model B). Brief 1 of 3 → [91](91-modelb-ca-shapes-and-mask-derived-anchors.md), [92](92-modelb-runtime-varying-seed.md).
**Design:** locked in a grill-me session 2026-06-13; see decision table at bottom.

## Goal

Two pure refactors that **change no observed behavior**, verifiable by a determinism diff (same map, byte-identical sim). They unblock the organic-shape work in [91](91-modelb-ca-shapes-and-mask-derived-anchors.md).

1. **Extract pure `generateWorld(seed) → { regions, roads }`** — ships the long-blocked "Phase 0" from [world-generation.md](../../../wiki/world-generation.md). Today every region/road table is a **module-level const** computed once at import off the fixed `WORLD_GEN_SEED` ([regions.ts](../../../../packages/sim-core/src/world/regions.ts)). Wrap that logic in a pure function taking `seed`, default it to the current `WORLD_GEN_SEED`, call it **once** at bootstrap and cache. Must stay **Worker-agnostic** (headless run-sim + tests call it directly — see [architecture.md](../../../wiki/architecture.md)).
2. **Add `mask` to `RegionDef`** — `mask?: Uint8Array` sized `(maxX-minX+1)×(maxY-minY+1)`, row-major, 1 = land. In this brief **all masks are all-land** (rect == mask), so the map is identical to today. Make every site that iterates `region.bounds` assuming "every in-bounds tile is land" check the mask bit instead.

## Why this shape (decisions carried in)

- **Data model = rect `bounds` + per-region `Uint8Array` mask**, masks generated on a global grid then sliced (brief 91). Runtime keeps the cheap per-region rect model so the ~118 `regionAt`/`isWalkable`/`.bounds` callers adapt with one extra mask check, not a rewrite.
- `regionAt(x,y)` becomes: in-bounds **and** mask bit set (all-land mask ⇒ unchanged result this brief).

## Work

- **`generateWorld(seed)`** in [regions.ts](../../../../packages/sim-core/src/world/regions.ts) (or a new `world/generate.ts` it re-exports from): moves `BASE_REGIONS`, `EXTRA_FARM_REGIONS`, `RANCH_PLACEMENT`, `BASE_ROADS`, `ROADS`, `REGIONS` construction inside. All RNG (`farmJitterRng`, ranch search) forks off the **passed** seed via `rng.fork(label)` — stable string labels, never array-index drift.
- Keep the exported `REGIONS`/`ROADS` API stable for now (default-seed result) so the 118 callers don't churn in this brief — the seed param is exercised by tests only until [92](92-modelb-runtime-varying-seed.md).
- **`mask` helpers:** `regionMaskAt(region, x, y)`, `forEachLandTile(region, fn)`. Add `mask` to `RegionDef`; populate every region with an all-1 mask.
- **Mask-aware the ~25 `.bounds` iterators** (audit list — confirm each at impl time):
  `world/region-setup/setup.ts`, `world/ports.ts`, `world/coral.ts`, `world/walkable-grid.ts`,
  `render-systems/{geometry,lights,interior-decor}.ts`, `systems/tile-features.ts`,
  `systems/act/handlers/{build,resource}.ts`, `systems/carpenter.ts`, `systems/bubbles.ts`,
  `agents/watering/{tools,plant}.ts`. Each: replace "for tile in bounds" with "for land tile in bounds" via `forEachLandTile`/mask check.

## Key invariants

- **Zero behavior change.** Verify with multi-seed `EXPORT=json` diff (NOT just CHECK_DETERMINISM, which only proves reproducibility — see [decisions.md](../../../wiki/decisions.md)). Diff must be empty vs pre-refactor at the default seed.
- All randomness through `rng.fork(label)` off the passed seed; never `Math.random`/`Date.now`.
- Masks are **static world geometry** — sent into the worker **once at init**, like the walkable grid. They must **never** enter the per-tick `RenderSnapshot`. Verify the snapshot path.
- Guard tests (`walkable-grid.test.ts`, `regions.test.ts`) still pass unchanged.
- Determinism check (only if asked) at ticks/day **20 and 1200**, ×21 farmers.

## Out of scope (→ 91)

CA generation, organic masks, anchor derivation. This brief leaves all masks all-land.

## Decision table (grill-me 2026-06-13)

| # | Decision |
|---|----------|
| Goal | Model B — stored organic shapes |
| Regions | **All** regions organic (cluster + farms + landmarks) |
| Data model | rect bounds + per-region `Uint8Array` mask, gen on global grid then sliced |
| Shape algo | CA-fill + center-floodfill (plain TS, sim-core) |
| Constraints | constructive core-pin + bounds-inset; **rect fallback** on fail (log/count fallbacks) |
| Seed | runtime-varying via pure `generateWorld(seed)`, called once at bootstrap |
| Anchors | derive ALL fixed tiles/stations/footprints/coral from the mask |
| Sequencing | 3 briefs: **90** (this) · 91 (shapes+anchors) · 92 (varying seed) |
