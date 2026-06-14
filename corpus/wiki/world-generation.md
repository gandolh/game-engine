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

As of **2026-06-09** the layout is **RADIAL** (was an 88×80 core + southern grid
band): a central cluster of services, two concentric farm rings on the rim. The
map was **160×160** then **grown to 240×240 on 2026-06-12** (uniform position-only
scale, SCALE=1.5, center 80→120) to open room for the land-adding todos. Two halves:

- **Central cluster (hand-authored at 160-scale, scaled out):** the `bounds`
  consts are authored against the original 160 layout and run through
  `scaleB({…})` — center moves ×SCALE from the design origin (80,80), island
  **size is preserved** (so inter-island gaps open ×1.5 while islands stay the same
  size). Village hub at **dead-center (now 115–126 × 115–126, center 120,120)**,
  craft islands E/W, resource zones on the diagonals, seasonal zones north, shrine
  + waterfall north-center, fishing isles + harbor + camp south, heritage islets in
  the gaps. One hand-tuned exception: **shrine** authored +2x — position-only
  scaling erased its thin x-overlap with the village and broke the village↔shrine
  bridge.
- **On-island content is island-locked, not map-locked:** because islands keep
  their size, content authored to fill a 160-era island (décor, NPC stations,
  building footprints, dock/delivery tiles) would spread *off* the same-size scaled
  island if scaled about the map origin. `scaleAroundNearestIsland({…})`
  (regions.ts) instead translates each tile by its nearest island's center
  displacement, so it rides with the island. Used by `placeProps`/`placeFootprint`
  (placement.ts), `scaleStations` (setup.ts), tiles.ts anchors, and the
  render-overlay anchor tiles. Coral reefs (coral.ts) derive from live fishing-isle
  bounds; tavern/festival tiles (watering/shared.ts) from the live village center.
- **Radial farm rings:** all 21 farms (5 named + `EXTRA_FARM_COUNT`=16 procedural)
  ring the cluster near the edges. Scales the roster to **21 farmers (20 AI +
  Pip)** with the homesteads-on-the-frontier read.

### Radial rings + spoke bridges (implemented)

In [regions.ts](../../packages/sim-core/src/world/regions.ts):

- `RegionId = FixedRegionId | ExtraFarmRegionId` where `ExtraFarmRegionId =
  \`farm-${number}\`` (`farm-0`..`farm-15`). Named farms (`farm-cora`…) keep their
  ids and ARE the inner ring's even slots.
- `ringSlotBounds(ring, k, size)` places farm k of a ring of n at
  `angle = φ + 2π·k/n`, `center = round(120 + R·{cos,sin}angle)`, then derives the
  `size`-square bounds (12 named / 10 procedural). **Inner ring** n=9, **R=78**,
  φ=−90° (named on even slots, farm-0..3 on odd); **outer ring** n=12, **R=108**,
  φ=−75° (farm-4..15). Radii are the original 52/72 ×SCALE. `makeRadialFarmRegion(i)` does the index→slot mapping, then
  nudges each by a fixed-seed ±1 jitter (fork `farm-ring-jitter` off `WORLD_GEN_SEED`).
- **No-adjacency by construction:** min farm-farm ocean gap **7** (≥2 holds after
  jitter), min cluster-to-farm gap **3**. `WORLD_WIDTH = WORLD_HEIGHT = 160` (plain
  consts now — the old band-height derivation + `EXTRA_FARM_COLS/SIZE/GAP/PITCH` are
  gone).
- **Bridge tree:** `CLUSTER_BRIDGES` (≈20 hand-authored pairs) + `generateFarmSpokes()`
  (one spoke per farm to the nearest island that yields a clean straight bridge —
  inner farms target cluster islands, outer farms target inner-farms∪cluster).
  `straightBridge(a,b)` scans every 2-wide window along the islands' overlap and
  returns the first rect that overlaps no island and edge-touches only its two
  endpoints, so a spoke auto-dodges a third island (e.g. well-north sitting between
  quarry-north and heritage-ruin). 41 bridges, full BFS connectivity from village.
- Farmer→farm assignment is **by `homeRegion` carried on each `FarmerSpec`**
  (set in `makeExtraFarmerSpecs`, [sim-bootstrap.ts](../../packages/sim-core/src/sim-bootstrap.ts)),
  replacing the old `PERSONALITY_TO_REGION` map. Extra farmers cycle the four AI
  archetypes (named `Cora-0`, `Atticus-1`, …).
- Resource-zone routing/ownership uses `nearestResourceZone(farmCenter, kind)`
  (replaces the hardcoded N/S corner pairs in `tile-features.ts` + `gather.ts`),
  so the far-south band correctly routes to the south forest/quarry.

Guard tests: `walkable-grid.test.ts` recomputes the expected walkable count from
`REGIONS + ROADS` (no more magic `2065`) and asserts a **no-adjacency invariant**
over every region pair; `regions.test.ts` asserts the band's count + per-farm
centers + `nearestResourceZone` routing. Determinism: generation is pure (no
RNG); `CHECK_DETERMINISM` MATCH ×21-farmers at both 20 and 1200 ticks/day.

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

> **Status update (2026-06-14):** Phase 0 **shipped** in [brief 90](../briefs/game/done/90-modelb-generate-world-and-mask-plumbing.md) —
> `generateWorld(seed): GeneratedWorld` is now the pure factory (default-called once as `DEFAULT_WORLD`,
> all named exports re-exported, zero caller churn). Brief 90 also added `RegionDef.mask?: Uint8Array`
> (all-1 for now), `regionMaskAt`/`forEachLandTile`, and a mask-aware `regionAt` — the plumbing the
> Model-B *shapes* land on. The seed param is tests-only until brief 92. Next: [brief 91](../briefs/game/todo/91-modelb-ca-shapes-and-mask-derived-anchors.md)
> (CA-fill shapes + mask-derived anchors), then [brief 92](../briefs/game/todo/92-modelb-runtime-varying-seed.md) (runtime-varying seed).

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
