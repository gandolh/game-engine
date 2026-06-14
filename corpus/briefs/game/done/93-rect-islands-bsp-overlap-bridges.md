# Game Task 93 — Rectangular islands, BSP placement, overlap-bridge graph + runtime seed

**Status:** ✅ Done 2026-06-14 (commits 5d93543 A · 4972db8 B · 9861ae5+9bf4153 C · 4a55db5+5f5548d D · 20385ab run-sim). Folds in brief 92 (runtime-varying seed). Full repo green (sim-core 795, farm-valley 186, engine 142). Implementation notes in [world-generation.md](../../../wiki/world-generation.md) + log.md.
**Supersedes:** the just-committed ring/scatter arc (commits 7099a40, 327bb25, 5444deb) and folds in/closes **brief 92** (runtime-varying seed). Replaces the radial ring model in [world-generation.md](../../../wiki/world-generation.md).
**Research:** web-search agent, 2026-06-14 (sources in the wiki update on completion). Recommended pipeline: **BSP placement + side-overlap-filtered complete graph + MST + δ extra-edges**, all integer-only.

## Locked design decisions (from user, 2026-06-14)

1. **Islands roughly rectangular, lightly carved** — rect silhouette with a little edge noise (rounded/notched corners), NOT organic CA blobs. Drops the heavy CA mask; keeps a light carve step.
2. **Farms = same area, varied W/H aspect.** Other islands may vary in area.
3. **Drop the ring organization.** All island positions generated at game start (per seed).
4. **All special regions become generated islands** — village, blacksmith, shrine, fishing isles, harbor, heritage, volcano, casino, etc. each keep their id/theme/anchored content, but their POSITION is placed by the generator. Content rides with its island.
5. **Bridges straight, axis-aligned, midpoint-to-midpoint** — connect two islands only when their facing sides share an orthogonal overlap (vertical bridge ⇒ X-overlap; horizontal ⇒ Y-overlap), at the overlap midpoint. May increase bridge count.
6. **~60% land coverage, soft target** (accept band ~55–65%).
7. **Bridge graph may have loops** (controllable loop density δ).
8. **Full brief 92 in one push** — thread runtime-varying seed end-to-end + multi-seed property tests.
9. **Stash/revert** the current uncommitted WIP (old-model tuning) before starting.

## The algorithm (deterministic, integer-only)

### Phase A — placement (`world/island-placement.ts`, new)
- **BSP-split** the 240×240 map into N leaf cells (N ≈ region count). Seeded splits: choose long axis, split position in [1/3, 2/3]. Recurse until a cell is smaller than `maxIslandFootprint + 2·gap`.
- **Assign each region to a leaf** (fixed-area "farm" regions and special regions each need a footprint that fits; assignment order is deterministic, id-sorted).
- **Size each island inside its leaf:** farms pick an integer (w,h) factoring of their fixed area with a seed-chosen aspect (reject non-integer/won't-fit); others sample (w,h) toward a target area. Coverage knob = per-island target areas + N.
- **Place inside the leaf** at a seeded interior position ≥ `gap` from each leaf wall → guarantees the ≥2-tile inter-island ocean gap by construction (sibling leaves are gap-separated). O(n²) post-check nudges any stragglers.
- **Coverage feedback loop:** measure total land, if outside [55%,65%] adjust N / target areas and regenerate (bounded retries, same seed → deterministic).
- **Light edge carve:** notch/round a few corner tiles per island via a cheap seeded rule (NOT the CA pipeline). Keeps the rect silhouette but breaks the perfect square. Carve must never touch a forced-core tile or a bridge-attach tile.

### Phase B — bridge graph (`world/bridge-graph.ts`, new)
- Build the **side-overlap-filtered complete graph** over n≤~50 islands (brute O(n²)): for each ordered pair, the 4 cardinal checks; edge exists iff facing sides clear + orthogonal interval overlap; store (a,b,dir,gap,midpoint).
- **MST (Kruskal, union-find)** over those edges, weight = integer gap → guaranteed connectivity skeleton.
- **Connectivity guard:** if the filtered graph is disconnected (rare; bounded by min-island-width during placement), reject placement and retry the whole seed (bounded-retry, like the existing salt loop). Per decision 5 we do NOT fall back to L-bends.
- **δ extra-edges for loops:** iterate non-MST valid edges in ascending-gap order, add each if seeded draw < δ. δ is a world-gen param.
- **Bridge crossing/over-island check:** drop any extra edge whose straight path crosses an island or another bridge (never drop MST edges; if an MST edge crosses, retry seed).
- Emit each edge as a straight 2-wide `RoadDef` (matches current bridge width) at the side midpoint.

### Phase C — thread the seed end-to-end (closes brief 92)
**Threading style (decided): mutable module singleton.** `bootstrapSim(opts)` calls `setActiveWorld(generateWorld(opts.seed))` once at startup; `REGIONS`/`ROADS`/`regionAt`/`isWalkable`/anchor-tiles become getters that read the active world. Most of the ~54 call sites keep importing the same names unchanged → smallest diff. Acceptable because sim-core runs one world per process (server hosts one `SimHost` per run-key). `DEFAULT_WORLD` stays as the lazily-initialized active default for tests/tools that never call `setActiveWorld`.

The seam already exists: everything funnels through `generateWorld(seed)` → active world → module consts. The work is removing the *import-time* derivations so positions can vary per run:
- **`generateWorld(seed)` becomes the single source** of regions/roads/anchor-tiles/**ports**/**coral**. Today ports.ts + coral.ts derive from `getRegion()` (default REGIONS) AND throw at module-load. Move their derivation into `generateWorld` (compute PORTS/CORAL_REEFS from the freshly generated fishing-isle/casino bounds) and return them on `GeneratedWorld`. Drop the module-load throw-asserts (re-express as a generation-time guard).
- **Thread `GeneratedWorld` from bootstrap.** `bootstrapSim(opts)` already has `opts.seed` (regions.ts:171 reads it for the agent rng but NOT for the world). Generate the world from `opts.seed`, hang it on sim state, and pass it to `buildWalkableGrid`, `buildBoatGrid`, `setupWorldRegions`, render init.
- **Audit the ~54 consumer files** (Explore inventory):
  - `.find(r=>r.id===…)` runtime lookups (≈15 files) + `regionAt`/`isWalkable` (≈15) → accept the threaded world (or a `WorldQuery` object) instead of the module const.
  - The 6 anchor-tile consumers + `buildWalkableGrid`/geometry that read at bootstrap → take the threaded world.
- **Keep `DEFAULT_WORLD`/`REGIONS` as a default-seed convenience** for tests/tools that don't thread a world, so the blast radius stays bounded. Runtime-varying seed is opt-in via bootstrap; default seed stays reproducible.
- **Persist the chosen seed** alongside run results (brief 92 risk: replay must regen the same map).

### Phase D — tests + verification
- **Multi-seed property tests** (`world/island-placement.test.ts`, `bridge-graph.test.ts`): over ~50 seeds assert — no region pair < 2-tile gap; full BFS connectivity from village; every forced core on land; every station/footprint placed; coverage ∈ [55%,65%]; bridges straight + non-crossing.
- **Update existing guards:** `walkable-grid.test.ts`, `regions.test.ts` (drop ring/center asserts), `connectivity.test.ts`, `solid-connectivity.test.ts`, `ports.test.ts`, `coral.test.ts`, `ranch-islands.test.ts`.
- **Determinism:** same seed → byte-identical at ticks/day 20 (per memory: verify at 20, not just 1200). Fast 3-day/3-seed diff per the split-gate convention. **Only run CHECK_DETERMINISM if you ask** (resource-limited hardware).
- `npm run typecheck` + scoped vitest (sim-core world) green before any milestone commit.

## Risks / open issues
- **Balance drift** — different map shifts AP-to-resource distances; note in [economy.md](../../../wiki/economy.md) if property tests show large variance. May clamp seed acceptance to a layout-metric band.
- **Special-region adjacency semantics** — coral reefs/ports need their isle on a map EDGE-ish open-water side; BSP leaf placement must allow a seaward face. May need a placement constraint ("fishing/harbor/casino islands prefer a leaf touching open water").
- **South-channel keepout** is currently a hardcoded rect; with generated ports it becomes derived from the generated port lanes.
- **Big single change.** Suggest committing per-phase (A, B, C, D) on a branch, typecheck+scoped-tests between, never reorder scheduler/bus.

## On completion
Move 92 + this brief to `done/`, append `log.md`, rewrite [world-generation.md](../../../wiki/world-generation.md) (radial → BSP-rect model; Model B "implemented"), update [status.md](../../../wiki/status.md) and [decisions.md](../../../wiki/decisions.md) (ring model retired).
