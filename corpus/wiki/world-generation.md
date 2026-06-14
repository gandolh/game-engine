# World generation

How the archipelago is laid out, and the menu of techniques for making it more
organic. Source of truth is [regions.ts](../../packages/sim-core/src/world/regions.ts);
verify any constant here against it before acting.

## Current model — rectangles, partly generated

Every region is an **axis-aligned `bounds` rect**; `ROADS` (bridges) are rects
too. `regionAt`, `isWalkable`, and `buildWalkableGrid` all test point-in-rect —
there is **no stored terrain map**; walkability is computed analytically. The
renderer is fully derived from this: `computeShores` foams any walkable tile
bordering ocean, `computeBridges` decks road-only tiles touching ocean,
`computeIslandEdges` themes margins. **So any walkable shape automatically gets
foam + shore + bridge decking for free.**

As of **2026-06-14 (briefs 92 + 93)** the layout is **FULLY GENERATED PER SEED**:
every island is a rectangle the generator places on a 240×240 map, connected by a
straight-bridge graph. The radial-ring model (2026-06-09) and the hand-authored
`scaleB`/ring-slot machinery are **retired**. `generateWorld(seed)` is the single
funnel; bootstrap installs the result via `setActiveWorld`.

### The generation pipeline (deterministic, integer-only)

Web-search-researched (2026-06-14); recommended pipeline **BSP placement →
side-overlap-filtered graph → MST + δ-loops**. Sources in log.md.

- **Placement — [island-placement.ts](../../packages/sim-core/src/world/island-placement.ts).**
  BSP-split the map into one leaf cell per region (largest leaf split on its long
  axis at a seeded central-third cut), assign largest footprints to largest leaves,
  size each island inside its leaf, and place it at a seeded interior offset ≥`GAP`
  (=2) from each leaf wall — so the ≥2-tile inter-island ocean gap holds **by
  construction**. **Farms keep a FIXED area with a seed-chosen aspect** (varied
  W/H, same area); other regions take a target area the coverage loop scales to
  hit the **~60% land band** (`COVERAGE_MIN/MAX` 0.55–0.65). `generateWorld`
  rejects a <50% placement so its salt loop retries a different partition.
- **Region inventory — [region-inventory.ts](../../packages/sim-core/src/world/region-inventory.ts).**
  The canonical list of all ~73 regions (village + ~25 fixed services/landmarks +
  21 farms + 21 ranches), each with a sizing `RegionSpec` and an **authored
  design-space center** (the old 160-era frame). The authored center → generated
  center displacement is how on-island content rides with its island (below).
- **Bridge graph — [bridge-graph.ts](../../packages/sim-core/src/world/bridge-graph.ts).**
  Straight, axis-aligned **2-wide** bridges connect two islands ONLY where their
  facing sides share an orthogonal overlap, at the overlap midpoint. Build the
  side-overlap-filtered complete graph (O(n²)), take a Kruskal **MST** (weight =
  ocean gap) for guaranteed connectivity, then add non-tree edges with seeded
  probability **`BRIDGE_LOOP_DELTA`=0.18** to create **loops**. Drops any bridge
  that crosses a third island or another bridge. If the layout can't connect with
  straight bridges, `buildBridgeGraph` returns null and the seed-salt loop retries
  (no L-bend fallback — BSP siblings reliably overlap, so this is rare).
- **Light edge-carve (regions.ts `carveCorners`).** Islands are **rects with a few
  notched corners** (seeded depth ≤3 wedges) so they don't read as perfect squares
  — NOT organic CA blobs (the brief-91 organic mask is retired). Carve never
  removes a forced-core or bridge-attach tile.
- **Content riders.** On-island content (décor, NPC stations, footprints, dock
  tiles) is authored in design space and translated to the generated position by
  its owning island's displacement: `scaleAroundNearestIsland` (regions.ts) now
  reads the per-world `displacement` map. Fixes applied for generated geometry:
  **stations snap into their region's land** (`scaleStations`), **footprints
  translate rigidly** (one displacement, no per-tile ballooning), and a
  **reserved-tile set** (`forcedCoreTiles` ∪ bridge halo, in setup.ts) keeps props
  from dropping a solid on a plot/station/dock/bridge tile.

### Runtime-varying seed (brief 92) + the active-world singleton

- `generateWorld(seed)` is pure. **`setActiveWorld(world)`** installs it for the
  process (sim-core runs one world per process); `REGIONS`/`ROADS`/anchor-tile
  exports are **`let` live bindings** refreshed on swap, and `onWorldSwap`
  listeners rebuild downstream caches. `bootstrapSim({worldSeed})` threads the
  seed (defaults to fixed `WORLD_GEN_SEED` → stable default map); run-sim honors a
  **`WORLD_SEED`** env var. `world-dims.ts` holds `WORLD_WIDTH/HEIGHT` so
  placement/bridge modules don't import regions.ts (breaks the init cycle).
- **Live-binding hazard (fixed):** any consumer that snapshotted an anchor-tile
  const into its own module-load `const` froze it to the default world. Found +
  fixed in `watering/shared.ts` (now `tavernGatherTile()`/`festivalPodiumTile()`/
  `fishingCastTiles()` functions). When adding code that reads an anchor tile,
  read it at call time, never capture at import.

### Boat / port network (open-ocean, brief 93)

Boats navigate **all open water and pass UNDER bridges** (a bridge is an elevated
deck) — only island land blocks them (`buildBoatGrid` in coral.ts). This keeps
the ocean one connected basin so port-to-port + dock→reef trips always route,
regardless of how bridges partition the *land* graph. Ports
([ports.ts](../../packages/sim-core/src/world/ports.ts)) and coral reefs
([coral.ts](../../packages/sim-core/src/world/coral.ts)) derive **lazily** from
the generated isle positions (rebuilt on world swap): a port's dock scans the
island's most-open-ocean side for a land tile whose seaward neighbour is open
ocean. The pre-carved shipping-lane network is retired (lanes are a short seaward
render/steer stub only).

### Guard + property tests

`island-placement.test.ts` + `bridge-graph.test.ts` (Phase A/B properties);
`generate-world.property.test.ts` is the **multi-seed accept-check** (30 seeds:
never throws, ≥2 gap, BFS-connected from village, forced cores on land, in-bounds,
full roster, coverage band); `regions.test.ts`/`walkable-grid`/`connectivity`/
`solid-connectivity`/`ranch-islands`/`ports`/`coral` rewritten for the generated
model. Determinism verified by fast 3-day/ticks=20 JSON export diff: **same
`WORLD_SEED` → byte-identical; different/unset → different world**.

> **Note (sim-core vitest `isolate:false`):** the world singleton is shared
> across test files in a worker. Files asserting default-world geometry pin it in
> `beforeEach` (e.g. ports.test). Watch for cross-file world-state leaks.

### Themed interior décor (render-only, 2026-06-12)

`RegionDef.theme` is a typed enum (`RegionTheme`) assigned per region (forest /
quarry / shrine / heritage / casino; farms default `'ring'`; `ranch` / `big-tree`
reserved for later todos). **Render-only — sim code must never read `theme`;
interactive features key off region id.** [interior-decor.ts](../../packages/sim-core/src/render-systems/interior-decor.ts)
holds a per-theme `THEME_TABLE` (frames + density-per-100-walkable-tiles) and
`computeInteriorDecor(world)`, which mirrors the open-water set-pieces idiom
(blue-noise rejection, Chebyshev `MIN_SPACING`, `fork('decor:'+id)`,
draw-all-rng-fields-every-iter) but **inverts eligibility**: props land on walkable
region-interior tiles. The forbidden-set is assembled from world queries
(plots/solids/stations/home/fountain/dock/board/coral docks + existing
decoration/structure sprites) and rejects tiles within Chebyshev 1 of a bridge
(mouths); accepted tiles feed back in so regions never overlap. Baked into the
static layer (layer 2, opaque) — never an ECS entity, so it never enters the sim
snapshot. This is the shared substrate the décor todos build on.

## Improving it further (research menu)

The central decision: **decouple "island shape/placement" from "how the layout is
authored."** Two models:

- **Model A — keep rects, generate the rect table** (what the farm band does).
  Cheap, low risk; `regionAt`/plots/renderer untouched.
- **Model B — store a generated walkability grid.** `buildWalkableGrid` bakes a
  `Uint8Array`; `regionAt` becomes a generated map + per-island mask; islands can
  be any organic shape. Big rewrite — needed for organic *shapes*, not for *more
  farms*.

Ranked techniques (all must thread `rng.fork(label)` — never `Math.random`):

1. **Placement (Model A):** *jittered grid* — **implemented (brief 49 track 4)**:
   the farm band now applies seeded ±1-tile X/Y jitter (fixed `WORLD_GEN_SEED`,
   `fork('farm-band-jitter')`) within a widened gap budget (`EXTRA_FARM_GAP` 2→4),
   with per-farm vertical stub bridges so connectivity holds by construction.
   Constructive spacing means no-adjacency can't be violated (≥2 ocean tiles
   between bodies, worst-case). MST bridges were scoped out as overkill at this
   tree topology. *Poisson-disk (Bridson)* /
   *Mitchell best-candidate* give nicer blue-noise scatter once islands have radii
   (Model B); pop the active list by `rng.int`, not array order, to stay
   deterministic.
2. **Shapes (Model B):** *CA-fill + center-floodfill* (plain TS) is the
   lowest-risk organic outline; *noise-threshold* needs coherent fBm — now
   **implemented in JS** (brief 49 track 1: `fbm` + `valueNoise2d` in
   [ground-noise.ts](../../packages/farm-valley/src/render/ground-noise.ts), 4
   octaves over smoothstep value noise). It currently drives the **render-only
   ground texture** (the committed `noise.wasm` is still hash noise and is bypassed
   for that pass); reuse the same JS fBm as the noise-threshold source if Model B
   shapes are pursued. Always keep
   a bounding rect (for `regionAt` fast-reject + tilling) plus a mask, and force the
   central ~7×7 plot core to land. `floodfill.wasm` exists but is unwired (no host
   loader) — plain-TS BFS is simpler at this grid size.
3. **Bridges:** *MST (Prim/Kruskal) over island centers + straight 2-wide
   corridors with third-island rejection* — matches today's village-rooted tree,
   generates cleanly, fully deterministic. Gabriel/Delaunay add natural loops but
   are overkill at N≈20.
4. **Validation:** prefer **constructive** (jittered grid → spacing, MST →
   connectivity, forced plot core → reachability) so almost nothing needs
   rejection; for the residue use **seeded bounded-retry** with a fresh
   `rng.fork("attempt-"+n)` per attempt and the guard-test invariants as the
   accept check. Factor world-gen as a pure `generateWorld(seed) → {regions,roads}`
   so the guard tests become multi-seed property tests.
5. **Variety:** add a `biome`/`theme` field to `RegionDef`; scatter décor via
   blue-noise (reuse the `coral.ts` deterministic open-water décor pattern). Highest
   visual-payoff-per-risk item.

**Phasing:** Phase 0 — extract pure `generateWorld(seed)`. Phase 1 (this change +
next) — jittered placement, MST bridges, multi-seed property tests, biome/décor.
Phase 2 (future) — Model B organic shapes via CA + center-floodfill.

> **Status update (2026-06-14) — the research menu below is HISTORICAL.** The
> "Model A vs B / organic-shape" framing was **superseded** by the brief-92/93
> decision to make islands **rectangles (lightly carved)** placed by BSP per seed
> (see the pipeline section at the top — that is now authoritative). The
> brief-90/91 plumbing was reused; the brief-91 **organic CA mask was retired**.
> - [brief 90](../briefs/game/done/90-modelb-generate-world-and-mask-plumbing.md): `generateWorld(seed): GeneratedWorld` pure factory + `RegionDef.mask` plumbing (`regionMaskAt`/`forEachLandTile`/mask-aware `regionAt`). **Kept** (the mask now carries the light corner-carve).
> - [brief 91](../briefs/game/done/91-modelb-ca-shapes-and-mask-derived-anchors.md): organic CA masks. **Retired by brief 93** — `organic-mask.ts` no longer feeds generation (rect + `carveCorners` instead). `forcedCoreTiles` (anchors.ts) survives as the shared must-be-land set.
> - [brief 92](../briefs/game/done/92-modelb-runtime-varying-seed.md) + [brief 93](../briefs/game/done/93-rect-islands-bsp-overlap-bridges.md): **DONE** — BSP rect placement, overlap bridge graph with loops, runtime-varying `WORLD_SEED`, open-ocean boats, multi-seed property tests. Model B is **implemented**.

The actionable cut of this menu is filed as
[brief 49 — organic procgen](../briefs/game/done/49-organic-procgen-noise-and-authored-detail.md):
it adds the coherent-noise upgrade this menu's Model-B shapes were blocked on
(**fBm + Inigo Quilez domain warping** — _both shipped, tracks 1–2 (render-only)_ — replacing the blocky hash kernel),
**Simplex/octave-rotation** — _track 3 evaluated and **deferred** as a low-value
nicety: fBm+warp already removed the grid-axis artifacts it targeted; revisit only
if Model-B shapes need a coherent basis (see [log.md](../log.md) 2026-06-09)_ — plus
**L-system vegetation scatter** — _track 5 **shipped** as seeded cluster-growth
(copses/outcrops) in [tile-features.ts](../../packages/sim-core/src/systems/tile-features.ts):
gameplay-neutral (same rates/caps/ownership, only placement clusters), drawn from
an isolated `rng.fork('tile-cluster')` so the main run-rng stream is unshifted_ —
and **authored set-pieces** — _track 6
**partially shipped**: decorative open-water props
([render-systems/set-pieces.ts](../../packages/sim-core/src/render-systems/set-pieces.ts),
blue-noise seabed accents, render-only) are done; the **interactive shrine
landmark** half was split into [brief 50](../briefs/game/done/50-54-more-islands.md)
as a gameplay feature_ — (the handmade-procedural hybrid). Backed by an adversarially-verified research pass
(PCG book / Red Blob Games / Quilez / GDC) — see [log.md](../log.md) 2026-06-08.

See [architecture.md](architecture.md), [player-and-interaction.md](player-and-interaction.md)
(archipelago layout), and the determinism rules in [decisions.md](decisions.md).
