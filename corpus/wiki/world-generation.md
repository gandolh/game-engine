# World generation

How the archipelago is laid out, and the menu of techniques for making it more
organic. Source of truth is [regions.ts](../../packages/farm-valley/src/world/regions.ts);
verify any constant here against it before acting.

## Current model — rectangles, partly generated

Every region is an **axis-aligned `bounds` rect**; `ROADS` (bridges) are rects
too. `regionAt`, `isWalkable`, and `buildWalkableGrid` all test point-in-rect —
there is **no stored terrain map**; walkability is computed analytically. The
renderer is fully derived from this: `computeShores` foams any walkable tile
bordering ocean, `computeBridges` decks road-only tiles touching ocean,
`computeIslandEdges` themes margins. **So any walkable shape automatically gets
foam + shore + bridge decking for free.**

Two layout halves:

- **Fixed core (hand-authored, `y ≤ 79`):** village hub (center), the five named
  farms (Pip top-center, Cora/Atticus/Otto/Hannah in the four corners), craft
  islands, resource zones, mill, wells, seasonal zones, two fishing isles, harbor.
  Coordinates are literal consts; unchanged.
- **Procedural farm band (`y ≥ 84`):** `EXTRA_FARM_COUNT` (=16) extra farms on a
  **seed-jittered grid** (brief 49 track 4 — ±1-tile X/Y wobble off a regular grid,
  from a fixed `WORLD_GEN_SEED`; was a pure grid before) — see below. Added to scale
  the roster from 5 to **21 farmers (20 AI + Pip)** without hand-authoring 16 islands.

### Procedural farm band (implemented)

In [regions.ts](../../packages/farm-valley/src/world/regions.ts):

- `RegionId = FixedRegionId | ExtraFarmRegionId` where `ExtraFarmRegionId =
  \`farm-${number}\`` (`farm-0`..`farm-15`). Named fixed farms (`farm-cora`…) keep
  their ids, so all fixed-island tests/consumers are untouched.
- Grid: `EXTRA_FARM_COLS=6`, `EXTRA_FARM_SIZE=10`, `EXTRA_FARM_GAP=4` →
  `EXTRA_FARM_PITCH=14` (gap widened from 2 in brief 49 track 4 to make room for
  jitter). Each farm is then jittered ±1 tile per axis; pitch − size − 2·jitter =
  **≥2-tile ocean gap worst-case → no farm body is ever adjacent to another**
  (constructive, can't violate). `WORLD_HEIGHT` is derived from the row count
  (88×80 → **88×128** at 16 jittered farms).
- Bridges (`generateFarmBand`): a vertical **trunk** taps the mill's south edge
  (x48–49) and runs down through open ocean; one horizontal **collector** per row
  sits in the gutter above its farms, pinned to the un-jittered grid line and
  X-spanning all jittered farms in the row; each farm hangs off its collector by
  its own short 2-wide vertical **stub** (added in track 4 to absorb the Y-jitter —
  previously farms were adjacent to the collector with no stub); short vertical
  **links** join the collectors down the trunk column. Result is a connected tree
  rooted at the village; bridges span only water.
- Farmer→farm assignment is **by `homeRegion` carried on each `FarmerSpec`**
  (set in `makeExtraFarmerSpecs`, [sim-bootstrap.ts](../../packages/farm-valley/src/sim-bootstrap.ts)),
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

The actionable cut of this menu is filed as
[brief 49 — organic procgen](../briefs/game/todo/49-organic-procgen-noise-and-authored-detail.md):
it adds the coherent-noise upgrade this menu's Model-B shapes were blocked on
(**fBm + Inigo Quilez domain warping** — _both shipped, tracks 1–2 (render-only)_ — replacing the blocky hash kernel),
**Simplex/octave-rotation** — _track 3 evaluated and **deferred** as a low-value
nicety: fBm+warp already removed the grid-axis artifacts it targeted; revisit only
if Model-B shapes need a coherent basis (see [log.md](../log.md) 2026-06-09)_ — plus
**L-system vegetation scatter** — _track 5 **shipped** as seeded cluster-growth
(copses/outcrops) in [tile-features.ts](../../packages/farm-valley/src/systems/tile-features.ts):
gameplay-neutral (same rates/caps/ownership, only placement clusters), drawn from
an isolated `rng.fork('tile-cluster')` so the main run-rng stream is unshifted_ —
and **authored set-pieces** — _track 6
**partially shipped**: decorative open-water props
([render-systems/set-pieces.ts](../../packages/farm-valley/src/render-systems/set-pieces.ts),
blue-noise seabed accents, render-only) are done; the **interactive shrine
landmark** half was split into [brief 50](../briefs/game/todo/50-interactive-shrine-landmark.md)
as a gameplay feature_ — (the handmade-procedural hybrid). Backed by an adversarially-verified research pass
(PCG book / Red Blob Games / Quilez / GDC) — see [log.md](../log.md) 2026-06-08.

See [architecture.md](architecture.md), [player-and-interaction.md](player-and-interaction.md)
(archipelago layout), and the determinism rules in [decisions.md](decisions.md).
