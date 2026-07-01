# Citadel — overview

**Citadel** is the second game in this monorepo, built on the same shared `@engine/core` as Farm Valley. It is a settlement sim: grow a town's economy through settlement *tiers*, keep villagers fed and happy. (It *began* as a settlement/light-RTS with sharp raids/sieges/fire/disease; the **2026-06-28 cozy pivot** — see banner below — reframes those threats as gentle, recoverable texture.) It is younger and more actively-evolving than Farm Valley — treat the briefs/todos below as the live spec and **verify against code** before relying on any detail here.

> **⚠️ DESIGN OF RECORD (2026-06-28): the cozy pivot.** A grilling session resolved
> *what Citadel is for* and reoriented the open work. The design is now:
> **a cozy placement puzzle you read by watching the town live** — arrange a town
> well on terrain (primary heart), watch it breathe (secondary), with **diegetic**
> feedback (mood/smoke/light, not a HUD). The **cozy contract**: *nothing you built
> is taken from you.* Threats don't destroy — they **dent local happiness, which
> taxes productivity to a ~60–70% floor (never zero)**, so recovery is guaranteed
> (no death spiral). The 2026-06-26 sharp-pressure systems (siege morale, interceptors,
> hazard interlocks, fire-as-razing) are **off-spec — frozen, not deleted** (re-wireable
> into a future optional Challenge mode); MP/PvP is a future *mode*, not the core.
> Further locked decisions: **motivation** is emergent player-set goals + diegetic
> recognition, **no score / no quest list** (#7); the player's hand is **placement +
> economic intent**, the town runs all **behavior** autonomously (#8, with a
> *player-operated but staffed* trading post as the clearest example); the **downside
> rule** — every problem is a throttle-to-floor, never a loss (#9); and **terrain is
> the puzzle** — clustered resources + a solvability guarantee (#10).
> Full plan + dependency order:
> [todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md](../todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md).
> **Where this page contradicts the cozy pivot below (esp. the "fire punishes tight
> clusters / spacing-vs-density tension is intentional" note), the pivot wins** —
> that was a pressure-game stance.

## Packages

- [`@citadel/sim-core`](../../games/citadel/sim-core/) — the deterministic Citadel sim (systems, world/terrain, entities, snapshot). Imports `@engine/core`; never imports a renderer or the Farm packages.
- [`@citadel/client`](../../games/citadel/client/) — the browser client (Vite, port 5174). Unlike Farm Valley (which runs its sim server-side), **Citadel runs the sim in an in-browser Web Worker** ([sim-worker.ts](../../games/citadel/client/src/worker/sim-worker.ts)) and posts snapshots to the main thread over `postMessage`.
- [`@tool/citadel-sim`](../../tools/citadel-sim/) — headless Citadel sim runner (`npm run sim:citadel`). Drives `bootstrapSim()` directly (no Worker). Ships several scenarios via the `SCENARIO` env var: `grow` (default), `starve`, `siege`, `sack`, `fire`, `disease`.

## Sim systems

Registered in [sim-bootstrap.ts](../../games/citadel/sim-core/src/sim-bootstrap.ts). The system files live in [systems/](../../games/citadel/sim-core/src/systems/):

- **Economy / population**: `production`, `villager-system`, `immigration`, `needs-happiness`, `trader`, `tiers` (settlement-tier progression with thresholds + locks), `road-connectivity`, `day-clock`.
- **Threats**: `raid-spawn`, `raider-movement`, `siege-resolution`, `fire-system`, `disease-system`. **Cozy-demoted (2026-07-01, Phase D):** under the default `cozyThreats:true` bootstrap option, fire smoulders→extinguishes (never razes), disease slows→recovers (never kills), raids pilfer stockpile goods→leave (never sack/gameOver), and each threat dents *local happiness* (→ the Phase-B productivity floor) instead of destroying. The destructive path is **frozen behind `cozyThreats:false`** (byte-identical) for a future Challenge/MP mode. **Cozy cold-open (2026-07-01, Phase C):** solo also passes `deferThreatsUntilBuildings:6`, so fire ignition / disease onset / raid scheduling are suppressed until the town owns ≥6 non-road buildings (the seed is 5) — the forgiving opening. Default 0 = off (headless/MP/baseline unchanged); the gate short-circuits before any RNG draw.

> **Build cost (2026-06-30, cozy economy).** Placing a building can cost materials —
> `BUILD_COST` per type in [building.ts](../../games/citadel/sim-core/src/entities/building.ts)
> (cold-open buildings cheap + **wood-only**; stone/tools only on late refiners/defence; roads/
> gates/walls/bridges free). `placeOne` checks affordability up front (rejecting `"cost"`) and
> **debits only on success**. **Opt-in** like `enforceTerritory`: `bootstrapSim({ chargeBuildCost,
> startingStock })` — default OFF, so headless/tests/the determinism baseline are unchanged; the
> **solo client** turns it ON (worker bootstrap) with a founding `{ wood: 40 }` grant, and the build
> bar shows the cost on hover + greys unaffordable buttons live (`!useServer` only — MP placement
> stays free). The save persists both options so save→replay stays identical.

Terrain + walkability come from [world/terrain.ts](../../games/citadel/sim-core/src/world/terrain.ts) (`generateTerrain`, `isWalkable`, `TerrainType`); villagers are defined in [entities/villager.ts](../../games/citadel/sim-core/src/entities/villager.ts).

## Shared invariants

Citadel obeys the same engine-level rules as Farm Valley:
- **Determinism** via the seeded [`Rng`](../../engine/core/src/runtime/rng.ts) — no `Math.random`/`Date.now` in sim code; tick output depends only on tick count. `bootstrapSim()` stays transport-agnostic (Worker, headless).
- **EDG32 palette** enforced by the same guard test (it now walks `engine/`, `games/`, `tools/`).

## Status notes (verified 2026-06-21)

First real-GPU solo playtest (prior reviews were headless): **WebGPU renders correctly**
(terrain + sub-tile dither, building/villager sprites, HUD, day/night) and the full v1
loop works — spaced, road-connected economy → founder → bread chain → immigration →
stable growth (verified to Day 199). Three solo-blocking bugs were fixed (see the
2026-06-21 log entry): Well/Healer were missing from the toolbar (the only fire/disease
mitigation, unbuildable); placement commands were dropped while paused; speed buttons
didn't resume. **Plan-while-paused** now works via `CitadelSimResult.applyCommands(ctx)`
(off-tick, determinism-safe). Two gotchas remain for players (not bugs): bootstrap is
**founding-window-gated** (place a connected economy early or deadlock), and **fire
punishes tight clusters** by design — space buildings ~5–8 tiles and connect with roads
(roads are firebreaks). MP-RTS live wiring holes from [todo 38](../todos/2026-06-19-citadel-38-implementation-review-problems.md)
are still open (solo is unaffected).

> **⚠️ The "founding-window-gated cold open" gotcha above is RESOLVED by cozy-pivot Phase C
> (2026-07-01).** Solo now **opts into `seedTown:true`** (a pre-seeded connected alive core placed
> at bootstrap) so the town is alive from tick 0 — the founding deadlock is structurally
> impossible, no early connected-economy race. Solo also passes `deferThreatsUntilBuildings:6`, so
> fire/disease/raids stay off until the town grows past the 5-building seed. Both flags default OFF
> (headless/MP/baseline unchanged). See the Phase C log entry.

## HUD & overlays (2026-06-22)

> **2026-06-30 update:** the **top HUD bar** (settlement readout: tier/day/pop/happiness,
> a **goods strip** with one colour-coded chip per good — grain/flour/bread/wood/planks/
> stone/tools, bread carrying its `(±surplus)` annotation — + speed/pause buttons) now
> renders **in-canvas** via the new `@engine/ui`
> framework ([brief 17](../briefs/engine/done/17-engine-ui-framework.md)), replacing the
> DOM `#hud` readout and `#btn-pause/-1x/-2x/-4x`.
>
> **✅ DOM-overlay removal COMPLETE (2026-06-30) — ALL Citadel GUI now renders in-canvas; no DOM
> UI overlays remain over the world canvas.** Beyond the HUD: **toasts** (top-centre `@engine/ui`
> column, `opacity` fade + `#toast-live` aria-live mirror); the **build bar**
> ([build-bar.ts](../../games/citadel/client/src/ui/build-bar.ts): grouped **text** buttons, own
> dispatcher + a11y mirror, tier-lock/affordability greying + cost hover-info — emoji dropped as the
> font is ASCII-only, restore-icons todo open); **occupancy badges**
> ([occupancy-badges.ts](../../games/citadel/client/src/render/occupancy-badges.ts): world-anchored
> panel+label headcount chips via a canvas-relative `tileToCanvasCss`); the **minimap**
> ([minimap.ts](../../games/citadel/client/src/ui/minimap.ts): **raw `UISurface` quads** — terrain +
> entity specks + camera-viewport rect — drawn directly in the host loop, NOT a widget tree, since
> `renderTree` has no custom-draw hook; `trySeek` for click-to-seek); and the **settings modal**
> ([settings-modal.ts](../../games/citadel/client/src/ui/settings-modal.ts): tabbed Display/Atmosphere/
> Simulation, own dispatcher + `#ui-a11y-settings` mirror, **fully modal** — host swallows all canvas
> input while open; live search dropped, no text-input widget). To support the modal, **`@engine/ui`
> gained `slider` + `checkbox`/`toggle` node kinds** (drag via the dispatcher `onDrag`; a11y
> `<input type=range>`/`<input type=checkbox>`). Verified in real WebGPU (playtest + modal probe).
> Open follow-up: [authored-typography-and-icons](../todos/2026-06-30-engine-ui-authored-typography-and-icons.md).

> **2026-06-30 — town-hall is now a placeable civic building (build bar `Services` group).**
> A `town-hall` toolbar button was added. As a down-payment on cozy-pivot **Phase G**, the
> town-hall's keep/raid anchor was **decoupled**: `actsAsKeepAnchor()` in
> [sim-bootstrap.ts](../../games/citadel/sim-core/src/sim-bootstrap.ts) adopts the anchor
> (sets `keepPosition`, sacking ends the run) only for the **`keep`** building or for a
> town-hall in **multiplayer** (`players.length > 1`). In **solo** the town-hall is
> **civic-only** — placing it does NOT start a siege (raids gate on `keepPosition`). MP is
> unchanged (the town-hall stays each player's match anchor). Determinism untouched (the
> gated branch is unreachable in every existing scenario — no solo town-hall was placeable
> before — and headless runs stay byte-identical). Phase G owns the full civic reframe
> (autonomous rations/work-hours within its radius-10 reach); the sprite is still the shared
> `warehouse` form + banner (bespoke civic-hall art is optional follow-up polish).

> **⚠️ Superseded by the 2026-06-30 DOM-overlay removal (above).** The section below describes the
> *historical* DOM-overlay UI. As of 2026-06-30 the HUD, toasts, build bar, occupancy badges,
> minimap, and settings modal **all render in-canvas via `@engine/ui`** — the `#build-bar`/`#hud`/
> `#minimap`/`#occupancy-badges` DOM + their CSS are gone. Kept here for the 2026-06-22 design
> rationale (HUD-height fights, the minimap iso-projection model) that motivated the move.

The Citadel client UI **was** **DOM overlays over a single WebGPU canvas** (no Canvas2D
for the world). Layout: `<body>` is a flex column — canvas (`flex:1`), then a
`#build-bar` strip, then a `#hud` readout row. Three changes on 2026-06-22 reclaim
laptop vertical space and stop a layout shift:
- **Event toasts** ([ui/toast.ts](../../games/citadel/client/src/ui/toast.ts)) —
  the old inline `#hud-events` span grew the HUD height when text wrapped, shoving
  the canvas up on every event. Events now surface as transient top-center toasts
  in a fixed, pointer-transparent `#toast-container` (out of flow). `newEventsSince()`
  diffs the rolling `recentEvents` window so only freshly-appended events toast;
  aging is on the render clock (`performance.now`), never the sim.
- **Minimap** ([ui/minimap.ts](../../games/citadel/client/src/ui/minimap.ts)) — a
  top-right 2D-canvas overview drawn in **axis-aligned tile space** (not iso).
  Terrain baked once at 1px/tile and scaled; buildings/villagers/raiders stamped
  per frame; the camera viewport is the four screen corners inverted via
  `screenToWorld` + `isoToTileContinuous` (a diamond in tile space). Click recentres
  the camera (`tileToIso` → `camera.setCenter`) and drops any follow-cam lock.
- **Condensed build bar** — groups laid out in a single row with vertical labels;
  buttons are icon-only (`font-size:0` collapses the label, name moved to a `title`
  tooltip set in `main.ts`). The `#hud` row is now `nowrap` + `overflow-x:auto` so it
  keeps a fixed height. The trader panel floats over the canvas instead of living in
  the HUD flex row, so its appearance no longer resizes the bar either.

## Rendering & assets

Citadel is **WebGPU-only** at runtime (no Canvas2D fallback). Terrain is baked into
the static layer (render-windowed on the large MP map — see the 2026-06-19 log entry);
buildings / villagers / raiders are `sprite-batch` quads.

**Sprites (2026-06-19).** Entities are real **pixel-art sprites**, not flat colored
boxes. The art lives as ASCII `PixelRecipe`s under
[client/src/render/sprites/](../../games/citadel/client/src/render/sprites/) and is
rasterized + shelf-packed into **one in-process atlas at client boot**
(`createCitadelSpriteAtlas` in `sprites/atlas.ts`) — no committed PNGs, no `npm run`
build step (unlike Farm Valley's `@farm/atlas-recipes` → `npm run atlas` committed-PNG
pipeline, which Citadel can't import: games never import each other). The atlas keeps a
1×1 white `px` frame that the tinted-box paths still use (ghost, wear, house-cluster
border). The night **light-pool** glow instead stamps the soft `fx/diamond` frame on
a GROUND layer below buildings (so emitters like the market glow on the ground, not
as a hard orange box over the sprite — 2026-06-21 fix). Per-type frame mapping +
tinting live in `quads.ts`:
- **Buildings** sample `bld/<type>` tinted white (recipe colors show); a burning
  building multiplies its tint toward orange. ~20 building types have art; a type without
  a recipe falls back to a tinted box (never requests a missing frame). Road/wall/gate
  keep their pre-existing autotile/inset-box rendering.
- **Villagers / raiders** are grey-ramp silhouettes (`vil/person`, `raider`); the
  per-instance tint (FSM-state color / red) multiplies into a shaded colored figure, so
  state still reads at a glance.

The recipe palette (`sprites/palette.ts`) derives every swatch from an `EDG.*` constant
via `rgbOf`, so it's EDG32-clean by construction (a test re-asserts it). Rasterize +
pack are pure (deterministic, headlessly tested); only the canvas/`createImageBitmap`
step is browser-only. **Phase 2 (not done):** textured terrain tiles, road/wall autotile
sprites, a gate sprite, MP owner-color differentiation.

**Visual polish (2026-06-21).** Render-only ideas borrowed from `tiny-world-builder`:
elevation-biased terrain dither, a directional NW-sun building drop-shadow
(`LAYER_SHADOW`), a deeper-night/stronger-dusk wash, and extra procedural detail in the
sprite generators (roof shingles, wall seams, doorstep, fort ashlar courses). All
render-only, EDG32-clean, sim untouched. See the 2026-06-21 log entry.

**TRUE ISOMETRIC — IMPLEMENTED (2026-06-21).** Citadel now renders **2:1 dimetric
isometric**: diamond terrain, iso projection with a working `screenToTile` inverse
(placement/ghost pick the right diamond), painter's-order depth sort, iso
road/wall diamonds (`fx/diamond` frame), and **true-iso building sprites**
(diamond base + two shaded wall faces + hip roof, `sprites/recipes/iso-draw.ts`)
at 32-based resolution + 32×32 units. The single source of truth is
[render/iso.ts](../../games/citadel/client/src/render/iso.ts) (`tileToIso`,
`isoToTile`, `isoFootprintBox`, `isoSpriteDims`, `isoDepth`). **Sim + determinism
untouched** — iso is a pure render/input/art change; `CHECK_DETERMINISM` stays
byte-identical. Verified in-browser; 174 client tests + iso-volume guard + EDG32
guard green.

**Per-building FORMS + 4× detail + animated mill (2026-06-21).** Buildings were
all the same hipped iso box ("everything looks like a house"). A first pass added
per-type accents; a second pass (this one) rebuilt **distinct medieval forms with
their own proportions**, authored at **4×** resolution, with an **animated mill**.

- **Authoring resolution: 32-based (`ISO_ART_SCALE = 1`).** The renderer sizes a
  building's quad in world-px via `isoSpriteDims` (iso.ts); recipes author at
  `isoArtDims` = `isoSpriteDims × ISO_ART_SCALE`. A pass tried 4×, but the user
  judged 32 dense enough in practice, so buildings stay native res like
  units/terrain. The `ISO_ART_SCALE` knob stays so the authoring math is
  scale-independent. (This retired the "upscale units/terrain to 4×" follow-up,
  brief 94.)
- **Reference restyle (done, brief
  [95](../briefs/game/done/95-citadel-building-restyle-reference-look.md)).** Per
  user reference art (Reiner "Isometric Buildings" + zatoart/xilurus itch packs),
  the forms were restyled toward warm **terracotta tile roofs** (`drawGableRoof`:
  ridge cap + eave-overhang shadow + tile courses), **half-timber** framing
  (`drawTimberFrame`: oak studs + diagonal cross-braces over cream infill),
  **ashlar stone** coursing on forts (`drawAshlarCourses`: staggered blocks, not a
  per-pixel checkerboard), and small **ground-prop plots** (`isoGroundProps`:
  dirt apron + barrel + sack). EDG32-only (clay/rust/salmon, cream/tan,
  bark/woodDark, slate/steel). Verified in-game.
- **Form builders** live in [iso-draw.ts](../../games/citadel/client/src/render/sprites/recipes/iso-draw.ts),
  mapped per type in [buildings.ts](../../games/citadel/client/src/render/sprites/recipes/buildings.ts):
  `cottage` (half-timbered, steep peaked hip roof, studs+window+door — house /
  bakery / woodcutter / sawmill / smith / healer), `postMill` (tall weatherboarded
  body on a trestle + roundhouse base + 4 sails), `openField` (tilled furrows +
  post-and-rail fence + gate + crops + hay bale — farm), `marketStalls`
  (red-striped awnings + tables + goods — market), `church` (nave + bell tower +
  spire + cross — chapel), `warehouse` (barn doors + hayloft dormer — storehouse /
  tradingpost / town-hall), `fort` (ashlar courses + flat crenellated deck + arrow
  slits — watchpost / tower / garrison / keep), `boxBuilding` (mine pithead /
  quarry pit / well).
- **Animated mill (render-only).** Recipes `bld/mill` + `bld/mill@1..7` are the
  post-mill with sails rotated through a 90° sweep (4-fold symmetry).
  `millFrameAt(clockMs)` (index.ts) picks the frame; `buildingQuad(b, clockMs)` →
  `pushScene(..., clockMs)` → `main.ts` passes the existing `performance.now`
  render clock. **No sim/determinism impact** (wall-clock pacing, render-only).
  `BUILDING_SPRITE_TYPES` excludes `@`-suffixed frames so they aren't mistaken for
  building types; `BUILDING_HEIGHT_TILES.mill` raised to 3 to match the form.

All render-only, EDG32-clean (every char via `SWATCH`). Guards green: 187 client
tests (incl. mill-frame test + per-type opaque-fraction floors — open farm/market/
mill get a lower floor since they're intentionally sparse), EDG32 palette test,
typecheck. Verified in-browser (gallery harness + the actual game): forms render
distinctly through the real atlas pipeline and the mill's sails turn.

> ⚠️ **Sprite anchor convention (load-bearing).** The engine sprite-batch anchors
> every sprite by its **CENTRE** (both backends draw `pos ± 0.5·size`). The iso
> helpers in `iso.ts` return **top-left** rects, so the conversion to a sprite must
> add half-extents — this happens in exactly two choke points, `quadToSprite` and
> `isoFlatSprite`. Skipping it shifts every iso sprite up-left by half its size
> (ghost lands left of the cursor, buildings float off their footprint). Relatedly
> `isoSpriteDims.height` is `roofH + wallH + diaH/2` (not full `diaH`) because
> `iso-draw.ts` centres the ground diamond on the wall-bottom mid-line. (Both fixed
> 2026-06-21; see log.) **Terrain is baked FLAT** (elevation 0) — a former 0/1-step
> relief lift in `makeTerrainDecorate` desynced the ground from the (flat) sprites,
> roads/bridges, and `isoToTile` pick, floating bridges off the water grid and
> opening dark seams; the elevation field now only tints the dither, never offsets
> geometry. Keep terrain, sprites, network tiles, and the pick all at elevation 0.

Brief:
[../todos/2026-06-21-citadel-true-isometric.md](../todos/2026-06-21-citadel-true-isometric.md)
(`mostly-done`). **Open anomaly:** a subset of building types
(market/storehouse/bakery/woodcutter) intermittently render as a flat box on the
dev GPU despite byte-correct sprite data — suspected WebGPU driver artifact, see
the brief's OUTCOME note. Iso windowing for the large MP map is still deferred.

**BRIDGES — roads over water (2026-06-21).** A road dragged onto a **Water** tile
auto-converts to a `bridge` (new building type + production def `isBridge`, both 1×1)
in [`placeOne`](../../games/citadel/sim-core/src/sim-bootstrap.ts): roads on land stay
roads, the water tiles of the same drag become bridges. A bridge is the **only** way
to place anything on water — it bypasses the `buildable` (terrain-walkable) check but
requires the tile to BE water and **unoccupied**, so **bridges cannot overlap** (nor
sit on a building/road). It joins `roadGrid` (so `villagerWalkable` + road-connectivity
treat it as a road) and a new `walkablePred` (terrain-buildable **OR** road tile) keeps
the decked water tile walkable in the rebuilt raider/path grid. Demolish clears
`roadGrid` *before* rebuilding so a removed bridge stops reading walkable. **Render:**
two new textured flat-diamond fx frames — `fx/road` (cobblestone) and `fx/bridge`
(railed wooden plank deck) in [sprites/recipes/fx.ts](../../games/citadel/client/src/render/sprites/recipes/fx.ts);
`isoNetworkTiles` now emits `bridge` tiles (and carries each tile's `type` + optional
`frame`), and `pushNetworks` stamps the textured frame white-tinted (walls keep the
solid tinted diamond), with bridges depth-sorted just under roads so a bridge mouth
tucks beneath the road it meets. Determinism untouched (terrain/placement only; the
art is render-only). Guarded by `systems/bridges.test.ts` (road→bridge on water, road
stays road on land, bridge walkable, no-overlap) + an `isoNetworkTiles` bridge-frame case.

## Briefs & todos

There is no Farm-Valley-style "done brief" archive for Citadel yet; work is tracked as todos. See [briefs/citadel-apr.md](../briefs/citadel-apr.md) and the `corpus/todos/*citadel-*` files (e.g. the `citadel-00-BUILD-ORDER` epic and the 21–33 series: windowed-grid render, incremental build queue, PlayerState refactor, territory/influence, PvP armies, per-player PvE). Fold durable Citadel findings into this page as the design settles.

> **⛔ SUPERSEDED by the 2026-06-28 cozy pivot.** The two notes below describe the
> **pressure-game** design and its tuning. The pivot reframes both — kept here for
> history, but **do not treat them as current intent.** Current design of record:
> [todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md](../todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md).

**~~Design — spacing-vs-density tension is intentional (2026-06-22).~~** *(SUPERSEDED —
**shipped 2026-07-01, Phase D:** fire is now gentle texture — a building smoulders and dents
nearby-house mood, then **extinguishes; it never razes** (gated by `cozyThreats:true`,
default). Density is no longer punished; the placement puzzle's tension now rests on
**terrain** (decision #10, Phase I — not yet built), not on fire. See the Phase D log entry +
decision #5.)* Fire
"punishes tight clusters" (space wooden buildings ≥5 tiles, connect with roads as
firebreaks), while happiness service-radius (8) and road-connectivity reward
keeping buildings *close*. These pressures pull against each other **by design** —
managing that tradeoff (spread for fire-safety, but not so far that coverage/
connectivity break, and use wells) is core to the game, not a bug to tune away.
The `playtest-citadel` skill's default build plan is laid out with this in mind
(≥6-tile grid + wells). Legibility of *where* coverage fails is still a fair
ask (see the playtest-findings P2 todo).

**~~Economy — load-bearing facts (verified 2026-06-22).~~** *(SUPERSEDED by pivot Phase
H: buildings go **single-slot** (no wasted-mouth trap), winter grain is floored ~×0.5
(**never 0**), and unhappiness throttles output to a ~60–70% floor (**never 0**) — the
old "death-spiral" framings below no longer apply. The per-building / one-bakery-caps-food
facts are still accurate to the **current** code until Phase H ships.)* Production output is
**per-building, gated only on `workerCount > 0`** — a building's *second* worker
slot adds a population mouth with **zero extra output**, so growth tracks the
number of *staffed buildings*, not filled slots. One bakery caps the food supply
at **6 bread/day** (feeds ~6); to grow past that, build *more bakeries* (the mill
already out-produces one bakery). Worker assignment (`villager-system.ts`) staffs
**goods-producing buildings before pure services** (chapel/market/watchpost have a
worker slot but no `inputGood`/`outputGood`) — otherwise services starve the bread
chain of labour and the town death-spirals. Founding spawns one worker **per
unstaffed connected building**; the per-founder `+5` bread ration is load-bearing
for bootstrap (the 3-building bread chain produces nothing until all three are
staffed). See the 2026-06-22 fix log entry.

**Playtest/UX todos (2026-06-22):**
- [playtest-findings](../todos/2026-06-22-citadel-playtest-findings.md) **(partial)**
  — growth death-spiral, silent placement rejects, and tier-lock cold-open spam are
  **fixed**; `grow` now holds pop 10–11/12 through a full year. Root cause was
  goods-vs-service worker priority (above), *not* the service-range hypothesis.
  Still open: zero-coverage service feedback (P2) and disease counterplay (P3).
- [road-routing-around-buildings](../todos/2026-06-22-citadel-road-routing-around-buildings.md)
  **(done)** — road drag now detours around footprints via a bounded A*
  (`routeRoadPath`), treats water as bridge-passable, falls back to L + toast.
- [minimap-rotate-viewport-rectangle](../todos/2026-06-22-citadel-minimap-rotate-viewport-rectangle.md)
  **(done)** — minimap redrawn in iso world-px; the camera viewport is now an
  upright rectangle.
