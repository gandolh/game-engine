---
title: "Citadel — true isometric projection (render + art epic)"
created: 2026-06-21
status: mostly-done
tags: [citadel, render, art, projection, epic]
---

# Citadel — true isometric projection

> **OUTCOME (2026-06-21).** Implemented and browser-verified. Citadel now renders
> true isometric (2:1 dimetric): diamond terrain, iso projection + working
> `screenToTile` inverse (placement/ghost land on the right diamond), painter's
> depth sort, iso road/wall diamonds, and **true-iso building sprites** (diamond
> base + two shaded wall faces + hip roof) at 32-based resolution + 32×32 units.
> All 174 `@citadel/client` tests + a new iso-volume guard test + the EDG32
> palette guard are green; the sim was untouched (determinism intact).
>
> **OPEN ANOMALY (not yet root-caused).** On the dev test machine, a *subset* of
> building types (market, storehouse, bakery, woodcutter) intermittently render
> as a **flat 2-tone box** instead of their iso volume, while house/chapel/tower
> all render correctly. Exhaustively verified that the **sprite data is correct**:
> recipe ascii, rasterized RGBA + alpha, shelf-pack rects (no overlap), atlas
> blit, UV, and the final render quad are all byte-identical between a working
> (house) and a broken (market) sprite — and the new
> `recipes.test.ts` guard asserts every building sprite is a non-degenerate
> diamond-cornered volume (passes for market). The on-screen difference is
> therefore **not reproducible from the code** and is suspected to be a
> WebGPU texture-sampling / driver artifact on this host (first-real-GPU
> territory — see the 2026-06-21 playtest log). **Follow-up:** reproduce on
> another GPU; if real, instrument `copyExternalImageToTexture` / try per-frame
> sub-textures or a padded atlas. Tracked here, not blocking the iso landing.
>
> **UPDATE (2026-06-22) — DOES NOT REPRODUCE on a real GPU.** Drove Citadel live
> via Playwright + **system Chrome** (`--enable-unsafe-webgpu`; the Playwright-
> bundled Chromium can't create a device here — `dxil.dll` Win error 87, no DXC
> libs — but installed Chrome/Edge do). Placed house/chapel/storehouse/bakery/
> woodcutter + market and zoomed in: **all five render as correct iso volumes**;
> only `market` is flat — and that is **by design** (`market → marketStalls(...)`
> in [buildings.ts](../../games/citadel/client/src/render/sprites/recipes/buildings.ts),
> open stalls with no height arg, unlike `cottage`/`warehouse`). So the earlier
> flat-box report was a host-specific WebGPU artifact, as suspected — not a code
> bug. If it resurfaces on another GPU, the `copyExternalImageToTexture` /
> padded-atlas follow-up above still applies.

# Citadel — true isometric projection

Convert Citadel from its current **top-down axis-aligned** presentation to a **true
isometric (diamond-grid) projection** — the classic settlement-builder look
(SimCity 2000 / Age of Empires / Factorio family).

## The load-bearing fact: the SIM DOES NOT CHANGE

This is a **render + input + art** epic, fully contained to `@citadel/client`.
`@citadel/sim-core` is untouched:

- The world stays a `WORLD_WIDTH × WORLD_HEIGHT` **axis-aligned tile grid**
  ([world/terrain.ts](../../games/citadel/sim-core/src/world/terrain.ts)). Iso is a
  *display* of that grid, not a different grid.
- **Determinism is unaffected** — everything here is downstream of the
  `RenderSnapshot` the worker posts; no sim RNG, no tick-output change. The
  determinism check stays byte-identical.
- `bootstrapSim()` stays transport-agnostic; the headless runner + tests are
  unaffected (they never render).
- The **EDG32 palette guard** still applies to every new sprite color (route through
  `sprites/palette.ts` `SWATCH`, as today).

So the risk is **not** correctness-of-sim; it is (a) the `screenToTile` *inverse*
that powers all placement/selection, and (b) the volume of **sprite re-authoring**.
Cost split is roughly **~70% art, ~30% code.** Do NOT land this half-done: a partial
projection swap breaks placement (ghost/drag/click) for every player.

## Convention to pick first (blocks Stage 1)

Decide and record the tile aspect before any math:
- **2:1 dimetric** (`TILE_W = 2 · TILE_H`, the "pixel-art isometric" standard) —
  recommended; integer-friendly, classic look.
- vs true 30° isometric (`TILE_H = TILE_W · tan30`) — non-integer, harder to keep
  crisp at the pixel-snap the renderer uses (`renderer.pixelSnap = true`).

Pick **2:1 dimetric** unless there's a reason not to. Define `ISO_TILE_W` /
`ISO_TILE_H` (and the per-level `ISO_HEIGHT_STEP` for tile/building elevation) as the
single source of truth, consumed by both projection and inverse.

---

## Stages (each independently shippable + tested)

### Stage 1 — Projection + inverse in transform.ts  *(code, small, linchpin)*
[transform.ts](../../games/citadel/client/src/render/transform.ts) today is a trivial
linear map (`worldX = tileX · TILE_SIZE`) with a one-`floor` `screenToTile`. Replace
with the iso pair:

```
// forward (tile → screen-world)
sx = (tileX - tileY) * (ISO_TILE_W / 2)
sy = (tileX + tileY) * (ISO_TILE_H / 2) - elevation * ISO_HEIGHT_STEP

// inverse (screen-world → tile) — the hard half
a = sx / (ISO_TILE_W / 2)
b = sy / (ISO_TILE_H / 2)
tileX = (a + b) / 2 ;  tileY = (b - a) / 2   // then floor, with elevation correction
```

- Keep `screenToWorld` (camera/dpr) as-is; iso slots in *between* world-px and tile.
- `screenToTile` is consumed by **placement-state, ghost preview, drag-paint, and
  click-to-select** — every misclick bug lives here. Heavy unit tests: round-trip
  `tile → screen → tile` for a grid sweep; boundary cases on diamond edges.
- **Acceptance:** transform tests green; round-trip identity holds; no renderer wiring
  yet (pure math + tests only).

### Stage 2 — Renderer pre-projection + depth sort  *(code, medium)*
[citadel-renderer.ts](../../games/citadel/client/src/render/citadel-renderer.ts).
The WebGPU backend currently does an axis-aligned ortho blit. Lowest-risk path:
**CPU pre-project quad positions** in the push helpers (compute each quad's iso
screen-world position) so `@engine/core`'s shared WebGPU passes stay untouched. (A
projection matrix in the shader is cleaner but touches shared engine code — defer.)

- Add **painter's-order depth sort**: draw back-to-front by `(tileX + tileY)` then
  elevation, so southern/front objects occlude northern/back. Today everything is on
  flat numeric layers (`LAYER_BUILDING=10` …); replace the per-entity push order with
  an iso-depth sort *within* the entity pass. Multi-tile footprints sort by their
  front-most tile.
- The directional shadow + relief detail (added 2026-06-21, see log) re-angles for iso
  but the concept carries.
- **Acceptance:** buildings/villagers/raiders render on the diamond with correct
  occlusion; ghost preview lands on the hovered diamond tile.

### Stage 3 — Iso terrain bake  *(code, medium)*
[terrain-dither.ts](../../games/citadel/client/src/render/terrain-dither.ts) +
[window-controller.ts](../../games/citadel/client/src/render/window-controller.ts) +
[render-window.ts](../../games/citadel/client/src/render/render-window.ts).
Terrain cells become **diamond tiles**, not axis-aligned rects. The static-layer bake
fills diamonds; the elevation field (just added) can now drive real per-tile *height*
offset, not just a light/dark dither bias.
- The render window's screen-rect → tile-range cull becomes a **diamond** region;
  widen the culled tile range conservatively (bounding box of the visible diamond).
- **Acceptance:** terrain reads as an iso plane; windowed re-bake on pan still correct;
  determinism of the bake (pure) preserved.

### Stage 4 — Re-author the sprite library at the iso angle  *(ART — the bulk)*
[sprites/recipes/](../../games/citadel/client/src/render/sprites/) — `draw.ts`
(`makeBuilding` / `makeFort` generators + accent primitives), `buildings.ts`,
`units.ts`. Today every `PixelRecipe` is a **flat top-down** silhouette with a fixed
top-left light. True iso means re-drawing each to show **two faces + roof on the
diamond**, with a committed iso light direction. This dominates the timeline (weeks,
not an afternoon).
- Add iso variants of the generators (`makeBuildingIso` / `makeFortIso`) so the ~20
  building types + bespoke shapes (farm/mine/quarry/well) + villager/raider regenerate
  consistently. Keep everything routing through `SWATCH` (palette guard).
- Footprint→frame scaling in `quads.ts` must map a `w×h` tile footprint to the right
  diamond pixel size.
- **Acceptance:** every building/unit has an iso sprite; type stays legible at default
  zoom; palette guard green. *(This stage can sub-divide per building category.)*

### Stage 5 — Autotile + cluster iso geometry  *(code, medium)*
[autotile.ts](../../games/citadel/client/src/render/autotile.ts) (road/wall networks)
and [clustering.ts](../../games/citadel/client/src/render/clustering.ts) (house
neighbourhood borders) both emit axis-aligned shapes. Rework to iso-aware geometry
(diamond road segments, iso cluster outlines).
- **Acceptance:** roads/walls connect visually on the diamond grid; house clusters
  read as one block; gate keeps its distinct draw.

---

## Out of scope / explicitly deferred
- Shader-side projection matrix in `@engine/core` (Stage 2 uses CPU pre-projection).
- True per-tile terrain *meshes* / 3D camera — this is iso 2.5D, not 3D (that was the
  rejected "Option C"; see the 2026-06-21 visual-direction discussion in log.md).
- MP owner-color differentiation, multi-height cliffs (can layer on after Stage 3's
  elevation hook lands).

## Risks / watch-items
- **`screenToTile` inverse with elevation** is the top bug source — get Stage 1's
  tests exhaustive before wiring anything.
- **Pixel crispness**: the renderer uses `pixelSnap = true`; 2:1 dimetric keeps tile
  math integer. Avoid non-integer iso angles.
- **Render-window culling** must over-include on the diamond or tiles pop at screen
  edges on pan.
- **Don't ship Stages 1–2 without the others wired**: a projected world with
  axis-aligned sprites/terrain looks broken. Stage behind a flag or land the visual
  stages together.

## Acceptance (epic)
`npm run citadel` shows a coherent isometric settlement — diamond terrain, iso
buildings/units with correct occlusion, working placement/selection on the diamond
grid, roads/walls/clusters connected. `npm run typecheck`, `npm run test`, and the
EDG32 palette guard all green. `CHECK_DETERMINISM=1` still byte-identical (proves the
sim was untouched).
