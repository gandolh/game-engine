# Brief 65 — Topography variety: make some islands read as taller (fake-height cliffs)

**Status:** done (merged 2026-06-10) · **Area:** atlas recipes + `packages/sim-core` (render geometry/static layer) · **Drafted:** 2026-06-10

All islands sit at the same visual height, so the archipelago reads flat. Give selected islands **vertical presence** with cliff-face tiles — the same trick the waterfall island (brief 52) and the 48px-tall workshop buildings already use: pure sprite layering, **no true elevation system**. Render-only; pathfinding, collision, and determinism untouched.

**Explicit scope decision:** true z-levels were assessed and rejected for now — they would require rewriting **both** pathfinder kernels (WASM + JS, which already aren't route-equivalent), 3D walkability grids, snapshot schema changes, and a determinism re-baseline (est. 40-60h). Fake-height is ~a day and reversible. If a future feature needs real elevation, that's a new brief.

## Read first

- [briefs/game/done/52-waterfall-island.md](../done/52-waterfall-island.md) — the existing fake-height precedent (static cliff sprite + overlay).
- [corpus/wiki/player-and-interaction.md](../../../wiki/player-and-interaction.md) — bridges/walls rendering context.
- Root [CLAUDE.md](../../../../CLAUDE.md) — EDG32 palette; atlas artifacts are committed.

## How height is faked today (verified against code 2026-06-10)

- **Y-sort:** draw order is `(layer, y)` ([draw.ts](../../../../packages/engine/src/render/canvas2d/draw.ts) ~4-8). Static layer bakes: tiles L0, shore foam L1, coral L2, bridges L3, island walls L4, big buildings L5.
- **Tall structures:** `BIG_STRUCTURES` ([render-systems/geometry.ts](../../../../packages/sim-core/src/render-systems/geometry.ts) ~8-28) are 32×48 sprites **bottom-anchored** to a base tile row ([static-layer.ts](../../../../packages/sim-core/src/render-systems/static-layer.ts) ~245-260) so they rise into the rows above; movement blocking comes from invisible `solid` footprint entities (`placeFootprint`, [region-setup/placement.ts](../../../../packages/sim-core/src/world/region-setup/placement.ts) ~39-49).
- **Island edges:** `computeWalls()` already draws a perimeter band (L4) on land facing ocean; `computeShores()` draws foam (L1) — both in geometry.ts, computed deterministically at module load from `REGIONS`.

## Design

A "tall island" gets a **cliff skirt**: 1-2 rows of cliff-face tiles drawn on the **ocean tiles south of its southern coast** (and optionally 1 row on east/west edges with corner pieces), at a layer above shore foam and below bridges (L2, sharing with coral, or a dedicated L2.5 — pick whichever doesn't fight existing coral placement). The island surface itself doesn't move; the cliff face below its south edge makes the eye read the surface as elevated. Northern edges need nothing (the wall band already covers them).

- **Which islands:** pick 3-5 for variety, not all — suggestion: `heritage-ruin` (pairs with brief 62's ruin theme), the waterfall island (height explains the cascade — consider a 2-row/taller skirt here), the shrine, and one quarry. Define as data: `TALL_ISLANDS: ReadonlyArray<{region: RegionId; rows: 1|2}>` in geometry.ts.
- **Art:** new atlas frames `tile/cliff-face` (+ `-left`/`-right` corners, and ideally an `-a/-b` variant pair to break repetition), authored in [base-recipes.ts](../../../../tools/atlas-builder/src/recipes/base-recipes.ts). EDG stone family (`slate`/`navy`/`bark`), with a waterline darkening at the bottom edge so it meets the water plausibly.
- **Computation:** a `computeCliffs()` sibling of `computeShores()` in geometry.ts — for each tall island, walk its southern coastline tiles (land with ocean directly south), emit cliff sprites on the ocean tile(s) below. Deterministic, derived purely from `REGIONS` — no RNG needed (or `WORLD_GEN_SEED`-forked if variants are randomized).
- **Interactions to respect:** skip cliff emission on tiles occupied by **bridge approaches** (bridges at L3 must still visually land on the water/deck, check `CLUSTER_BRIDGES` spans) and on **boat/dock tiles** (L6 boats, harbor). Foam bubbles (`COASTLINE_BUBBLE_TILES`) on cliff tiles should be suppressed or they'll float mid-cliff — filter them against the cliff set in the render loop or geometry.

## Tasks

- [ ] **1.** Author cliff frames in atlas recipes + rebuild/commit atlas artifacts (mirror brief 47/51 procedure).
- [ ] **2.** Add `TALL_ISLANDS` + `computeCliffs()` to [geometry.ts](../../../../packages/sim-core/src/render-systems/geometry.ts); emit in `iterStaticSprites` ([static-layer.ts](../../../../packages/sim-core/src/render-systems/static-layer.ts)).
- [ ] **3.** Filter foam bubbles off cliff tiles; verify bridge approaches and boats unaffected.
- [ ] **4.** Walkability proof: assert the walkable grid is **byte-identical** before/after (cliffs live on non-walkable ocean) — extend [walkable-grid.test.ts](../../../../packages/sim-core/src/world/walkable-grid.test.ts) or add a snapshot-count assertion; this is the brief's no-sim-impact guarantee.
- [ ] **5.** Add a geometry unit test: `computeCliffs()` emits only onto ocean tiles, never overlaps a bridge span, deterministic across two calls.
- [ ] **6.** Manual pass in `npm run dev` at several zooms/seasons: tall islands read as elevated; no seams between wall band (L4) and cliff skirt; day/night wash looks right on cliff faces.
- [ ] **7.** `npm run typecheck` + `npm run test`; palette guard green.

## Acceptance

- 3-5 islands visibly taller than their neighbors; the rest unchanged — the archipelago has depth variety.
- Walkable grid byte-identical (task 4 test); zero sim-core behavioural diff.
- Bridges, boats, foam, and shore bands all still render correctly around tall islands.

## Risks / notes

- Pure-art risk: the cliff face must convincingly meet both the island wall band above and the animated water below — iterate on the recipe before wiring everything.
- If brief 64 (waves) has landed, check the swell overlay doesn't wash over cliff bases oddly (cliffs are static-layer, drawn above the water fill — should be fine, verify).
- Keep `TALL_ISLANDS` small and data-driven so later briefs can promote/demote islands freely.
