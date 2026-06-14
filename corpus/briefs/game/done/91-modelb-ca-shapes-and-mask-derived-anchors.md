# Game Task 91 — Model B: CA organic shapes + mask-derived anchors

> **✅ DONE 2026-06-14** (shipped as 91a `0f6bf26` + 91b `e6bdba9`, pinned default seed).
> **CA primitive** `world/organic-mask.ts`: per-region two-rule CA (born≥5 / survive≥3,
> P=0.60, 2 passes, snapshot-read/new-buffer per pass) + array-queue floodfill from a
> pinned core. Tuned empirically — a single threshold≥5 only got ~50% organic; the two-rule
> form gets **100% of regions with area≥36 organic** (~45% avg land, no slivers),
> **fallbackCount=0** on the default seed. **Shared core** `world/region-setup/anchors.ts`
> `forcedCoreTiles` is the single source of truth for must-be-land tiles (plot grid, fountain,
> home, cottage base, port/coral dock anchors), pinned by the mask AND used by the spawner so
> they can't diverge. generateWorld builds masks sequentially with a cross-region ≥2-ocean
> adjacency check and pins bridge-attachment tiles + an **L-path corridor** from each road
> entry to the region center (keeps every region pass-through; reachability BFS holds).
> **Anchors** derived via `nearestLandTile`/`snapPropToLand` (9 tile consts + baked
> BIG_STRUCTURES); watering till/orchard, pen/greenhouse placement, cliffs, and the bubble
> ring made mask-aware; stations fail loud off-land. Guard tests rewritten over masks
> (walkable count, ≥2-ocean gaps, corner→center+core) + new guards (≥80% organic, bounded
> fallback, core+tile-consts on land, determinism). **91b** isolated the one RNG-stream-
> sensitive site (`tile-features.ts` candidate count → `cluster.nextFloat()` draws). Full
> suite green: sim-core 784/784, farm-valley 186/186, typecheck clean. The 1200-tick headless
> determinism check was **skipped** (user call, constrained hardware) — unit suite +
> deterministic-mask derivation stood in. → unblocks [92](92-modelb-runtime-varying-seed.md).

**Status:** Done
**Epic:** Organic world gen (Model B). Brief 2 of 3. **Depends on [90](90-modelb-generate-world-and-mask-plumbing.md)** (pure `generateWorld(seed)` + mask plumbing must land first).
**Design:** grill-me 2026-06-13 (decision table in [90](90-modelb-generate-world-and-mask-plumbing.md)).

## Goal

Replace all-land masks with **organic island outlines** via CA-fill + floodfill, and **re-derive every hand-authored fixed tile** from the generated mask so authored content (podium, docks, stations, footprints, coral) lands on real land. Shapes and anchors must land **together** — organic shapes without anchor derivation = stations on ocean. Develop under a **pinned seed** (varying seed is [92](92-modelb-runtime-varying-seed.md)).

## Part 1 — CA-fill + floodfill generator

New plain-TS primitive in `sim-core` (no noise dep; `floodfill.wasm` stays unwired — plain BFS is simpler at this grid size, per [world-generation.md](../../../wiki/world-generation.md)). Per region, inside `generateWorld(seed)`:

1. **Random-seed** each tile of an **inset** bounds (inset = margin so a blob bulge can't cross the no-adjacency gap) land/ocean at ~45% land, drawing from `rng.fork('region:' + id)`.
2. **CA smooth** N passes: land if ≥5 land neighbors. **Read a snapshot of the grid, write a new buffer** each pass — never mutate in place mid-pass (correctness + determinism: in-place is iteration-order-dependent).
3. **Pin the forced core** (plot grid for farms, hand-content anchor tiles for cluster/landmarks) as land **before** smoothing, and protect pinned tiles from being cleared.
4. **Center-floodfill** (deterministic BFS, array queue — never Set iteration order) from the forced core; keep only the connected component, discard detached blobs.
5. **Slice** the surviving component into the region's `bounds` + `mask`.

### Constraints + fallback

- **Constructive:** core-pin (reachability), bounds-inset (no-adjacency margin), floodfill (blob connectivity).
- **Rejection residue:** after a region's mask is built, validate invariants — no-adjacency ≥2 ocean tiles vs already-placed regions, forced core survived, min land-tile count. On fail, retry with `rng.fork('region:' + id + ':attempt-' + n)`, bounded (~20).
- **On max-retry exhaustion → rect fallback:** that region reverts to an all-land rect mask. Map always generates; hard regions stay blocky.
- **Must `log()` + count fallbacks.** Silent all-rect degradation must not be mistaken for "organic shipped." Guard test asserts **most regions went organic** on the default seed (e.g. ≥80%).

## Part 2 — Mask-derived anchors

Every fixed tile/placement currently authored at exact coordinates ([regions.ts](../../../../packages/sim-core/src/world/regions.ts) + placement code) becomes a **mask-aware placement fn**:

- `TOWN_SQUARE`, `AUCTION_PODIUM_TILE`, `NOTICE_BOARD_TILE` → derive from village mask (e.g. centroid-most land tile).
- `HARBOR_DOCK_TILE`, `HARBOR_BOARD_TILE` → village/harbor mask tile nearest ocean on the dock side.
- `CAMPFIRE_TILE`, `WATERFALL_TILE`, `VOLCANO_CRATER_TILE`, `CASINO_NEON_TILE`, `WEATHER_STATION_TILE` → nearest-land-to-authored-spot within the owning region's mask.
- `scaleStations` (setup.ts), `placeProps`/`placeFootprint` (placement.ts): footprint must **fit inside the mask**; if it can't, relocate within mask or shrink. A station that can't place = broken farmer behavior — fail loud here, not silent.
- `coral.ts` reefs derive from live fishing-isle bounds → derive from fishing-isle mask edge.
- `tiles.ts` anchors + render-overlay anchor tiles + `interior-decor.ts` forbidden-set → mask-aware.

## Key invariants

- All randomness `rng.fork(label)` (stable labels) off the passed seed; never `Math.random`/`Date.now`.
- BFS connectivity from village over land+bridges still holds (bridge generation already rejects third-island overlap; re-verify against masks).
- Plot core / stations / docks / delivery tiles always on walkable mask tiles.
- Masks stay out of `RenderSnapshot` (init-only) — re-verify after shape gen since masks now vary.
- Guard tests updated: `walkable-grid.test.ts` recomputes expected walkable count from masks (not rects); add the "≥X% organic" and "no region pair < 2 ocean gap" assertions over masks.
- Determinism (only if asked) at ticks/day **20 and 1200**, ×21 farmers, pinned seed.

## Out of scope (→ 92)

Flipping seed to runtime-varying; multi-seed property tests; gameplay-ripple audit. This brief runs on a pinned dev seed only.
