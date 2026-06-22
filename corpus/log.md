# Corpus Log

Append-only chronological record. Each entry starts with `## [YYYY-MM-DD] <kind> | <title>` so `grep '^## \[' log.md` produces a readable timeline.

**Compaction note (2026-06-13):** entries before 2026-06-13 were collapsed into dated era summaries. Full prose for every trimmed entry is in git history (`git log -p -- corpus/log.md`); each brief's detail lives in [briefs/](briefs/) (done/superseded) and durable synthesis in [wiki/](wiki/). Treat the trimmed git prose as **obsolete** — if an old decision resurfaces and can't be justified from current code + the wiki + the brief, re-derive it rather than trusting the archived narrative.

## [2026-06-21] render | Citadel night light-pool fix — emitters no longer render as orange BOXES

In-game Playwright testing showed the **market** (and other glow emitters: bakery,
chapel) rendering as a hard **orange box** over the building. Root cause (found via
a live `renderer.push` capture hook): the night light-pool glow
([atmosphere.ts](../games/citadel/client/src/render/atmosphere.ts) `lightPoolQuads`
+ `pushLightPool` in [citadel-renderer.ts](../games/citadel/client/src/render/citadel-renderer.ts))
stamped concentric **solid `px` squares** at `LAYER_LIGHT_POOL = 12` (ABOVE
buildings, layer 10), tinted EDG.gold/orange. Stacked at full night they washed a
boxy orange tint over each emitter's sprite — NOT a sprite-art bug (the `bld/market`
recipe + atlas frame were verified correct end-to-end).

Fix (render-only): `pushLightPool` now stamps the soft **`fx/diamond`** frame (a
real iso 2:1 diamond, transparent corners) projected onto the iso ground via
`tileCenterToIso`, instead of `isoProjectTilePxBox` + the solid `px` square; moved
`LAYER_LIGHT_POOL` to **9** (just above the drop-shadow, BELOW buildings) so the
glow pools on the GROUND around each emitter's base like lamplight rather than over
the sprite; and lowered `GLOW_RINGS` alphas (~0.045–0.06, retuned for solid
diamonds vs the old transparent-cornered squares). Verified in-game: market/bakery/
chapel now render their sprites with a subtle ground glow; depth-sort + footprint
alignment confirmed correct across the full tier-1 set. typecheck + 187
@citadel/client tests (incl. 15 atmosphere tests) green. The pre-existing
`transform.ts`/`placement-state.ts` `centerX` console errors are unrelated in-flight
work, untouched.

## [2026-06-21] render | Citadel mill + well rebuilt (were the two weak forms)

User flagged the mill + well as looking bad vs the reference packs. Both were
oddball custom shapes that didn't follow the clean iso-volume language:
- **Mill** was a flat front-facing weatherboard billboard on a thin trestle with a
  tiny clumped sail. Rebuilt `postMill` as a real **tower mill**: a tall tapered
  ROUND stone cylinder (lit-left/shaded-right body shading + stone coursing), a
  domed terracotta cap, small arched door + stacked windows, on a stone plinth.
  New `MILL` palette (warm cream/tan stone + clay cap) replaces WOOD (whose black
  `roofDark` made the heavy black silhouette). `isoWindmillSails` redrawn as a
  bold front-facing X of latticed canvas blades (no iso-squash) — reads as a
  windmill; the 8-frame rotation still animates.
- **Well** was a full STONE building box with a tiny hood. New `wellForm`: a small
  round stone well-head (low cylinder kerb + rim ellipse + dark shaft + blue
  water) with two posts, a pitched clay roof, a windlass crossbar, and a bucket on
  a rope — a small ground object, not a house. `isoWellHood` retired from use.
Verified by raster zoom (mill/well + 4 mill rotation frames) — both now match the
reference look. typecheck + 187 @citadel/client tests + EDG32 guard green.

## [2026-06-21] render | Citadel buildings — reference restyle FINISHED (brief 95 → done)

Completed the remaining brief-95 items at 32-based: fixed the fort **ashlar
coursing** (`drawAshlarCourses` — sparse staggered blocks ≥5px courses/≥8px
bricks, killing the per-pixel checkerboard the 4×→1× revert had exposed); made
**half-timber** legible at 32px (min stud spacing, diagonal braces gated to tall
walls); added **ground-prop plots** (`isoGroundProps` — dirt apron + barrel + sack
via a `ground` FormOpt on house/bakery/healer); simplified `drawWalls` to clean
lit/shaded faces (dropped palette-fragile AO bands). Verified: typecheck + 187
@citadel/client tests + EDG32 guard green; Playwright in-game pass (terracotta
half-timber cottages render correctly at game zoom). Brief 95 moved to
[done](briefs/game/done/95-citadel-building-restyle-reference-look.md). (Pre-
existing `transform.ts`/`placement-state.ts` `centerX` console errors are from
unrelated in-flight work on those files, not this brief.) Files this session:
[iso-draw.ts](../games/citadel/client/src/render/sprites/recipes/iso-draw.ts),
[buildings.ts](../games/citadel/client/src/render/sprites/recipes/buildings.ts).

## [2026-06-21] render | Citadel buildings — reference restyle (terracotta/half-timber) + revert to 32-based

User supplied reference art (Reiner "Isometric Buildings" CC-BY-SA + zatoart/
xilurus itch packs) and asked the generated buildings to evoke that look:
**terracotta tile roofs** (clay/salmon/rust ramp, tile-course banding, ridge cap,
eave-overhang shadow), **half-timber** framing (oak studs + diagonal cross-braces
over cream infill), 3-step wall shading. Implemented in `drawGableRoof` /
`drawTimberFrame` / `drawWalls` ([iso-draw.ts](../games/citadel/client/src/render/sprites/recipes/iso-draw.ts)),
`PLASTER` palette retargeted ([buildings.ts](../games/citadel/client/src/render/sprites/recipes/buildings.ts)).
EDG32-only (inspiration, not imported art). **Also reverted buildings from 4× back
to 32-based** (`ISO_ART_SCALE = 1`, [iso.ts](../games/citadel/client/src/render/iso.ts))
— user judged 32 dense enough in practice; this retires brief 94's "upscale
units/terrain" premise. Verified at 1× (raster): house/storehouse/chapel read with
roofs + framing; typecheck + recipes.test green. **Not finished** — captured as
todo brief [95](briefs/game/todo/95-citadel-building-restyle-reference-look.md):
remaining = stronger visible bracing at 1×, ground-prop bases, cleaner outlines,
full-set consistency + Playwright/in-game verification. Wiki:
[citadel-overview.md](wiki/citadel-overview.md).

## [2026-06-21] render | Citadel buildings — distinct medieval FORMS at 4×, animated mill

Follow-on to the per-type-accent pass below: rebuilt the buildings as **distinct
forms with their own proportions** (not one box + accents), authored at **4×**
(`ISO_ART_SCALE`), with an **animated mill**. Decoupled authoring resolution from
world size in [iso.ts](../games/citadel/client/src/render/iso.ts) (`isoArtDims =
isoSpriteDims × 4`; renderer keeps world-px, GPU samples the high-res texture into
the same quad). New form builders in
[iso-draw.ts](../games/citadel/client/src/render/sprites/recipes/iso-draw.ts):
`cottage` (half-timbered steep-roof house/bakery/smith/woodcutter/sawmill/healer),
`postMill` (tall trestle-mounted body + sails), `openField` (fenced tilled farm),
`marketStalls` (open striped stalls), `church` (nave + bell tower + spire),
`warehouse` (barn + hayloft — storehouse/tradingpost/town-hall), `fort` (ashlar +
crenellated deck + arrow slits — watchpost/tower/garrison/keep), `boxBuilding`
(mine/quarry/well). Mill animation: `bld/mill@0..7` rotated-sail frames +
`millFrameAt(clockMs)` threaded `buildingQuad(b,clockMs)` → `pushScene(...,clockMs)`
→ `main.ts` `performance.now` — **render-only, sim/determinism untouched**.
`BUILDING_SPRITE_TYPES` filters `@` frames; `BUILDING_HEIGHT_TILES.mill`→3.
Verified by rasterizing recipes to PNG, a Playwright gallery on the real runtime
atlas (mill sails confirmed turning across frames), and placing buildings in the
actual game. Green: typecheck, 187 @citadel/client tests (new mill-frame test +
relaxed opaque-fraction floor for the sparse open farm/market/mill), EDG32 palette
test. **Units + terrain stay 1×** — upscaling them to match is brief
[94](briefs/game/todo/94-upscale-units-terrain-to-match-buildings.md). Wiki:
[citadel-overview.md](wiki/citadel-overview.md) "Per-building FORMS + 4× detail".

## [2026-06-21] render | Citadel buildings — per-type silhouettes so they don't all read as a house

Every iso building was the same hipped-roof box differing only in colour/size, so
a mill, market, mine, and house were indistinguishable. Added a feature library to
[iso-draw.ts](../games/citadel/client/src/render/sprites/recipes/iso-draw.ts) and
assigned one iconic feature per type in
[buildings.ts](../games/citadel/client/src/render/sprites/recipes/buildings.ts).
Two silhouette-level breaks via new `makeIsoBuilding` opts: `flatTop` (a flat
**crenellated rooftop** for tower/keep/garrison/watchpost — reads as a castle) and
`noDoor` (mine/quarry get a timbered **shaft mouth + A-frame pithead** in place of
the door). Smaller per-type cues: windmill sails (mill), water wheel (sawmill),
striped awning (market), hayloft dormer (storehouse/tradingpost/farm), brick
chimney+ember (bakery/smith), log pile (woodcutter), grain sacks (farm/mill),
gabled hood+bucket (well), roof cross (chapel white / healer red), banners. `house`
stays the plain reference box. Render-only, EDG32-clean (all colours via `SWATCH`),
sim/determinism untouched. Verified by rasterizing each recipe to a PNG grid and
eyeballing; `npm run typecheck`, 186 @citadel/client tests, the iso-volume
opaque-fraction guard, and the EDG32 palette guard all green. Wiki:
[citadel-overview.md](wiki/citadel-overview.md) "Per-building visual language".

## [2026-06-21] render | Citadel iso sprites — fixed up-left offset (engine anchors sprites by CENTRE) + building float

Two render bugs from the true-iso conversion, both browser-confirmed via Playwright
and fixed:

1. **Up-left offset (ghost sat left of cursor, buildings floated off their footprint).**
   Root cause: the engine sprite-batch anchors every sprite by its **CENTRE** — both
   backends draw `pos ± 0.5·size` ([sprite.wgsl](../engine/core/src/render/webgpu/shaders/sprite.wgsl)
   vs `drawImage(x − w/2, y − h/2, …)` in [canvas2d/draw.ts](../engine/core/src/render/canvas2d/draw.ts);
   `spritesOverlap` agrees). But **every** Citadel iso helper (`isoFootprintBox`,
   `isoFootprintDiamondBox`, `isoPointBox`, `isoProjectTilePxBox`) returns a **top-left**
   rect, passed straight through `quadToSprite`/`isoFlatSprite`. So each sprite drew
   shifted up-left by half its own size; taller buildings shifted more than their
   (flat) shadow diamond → the float/gap. Pick was never wrong (verified: picked-tile
   centres round-trip to the cursor within a few px). Fix = add half-extents at the two
   rect→sprite choke points only (`quadToSprite`, `isoFlatSprite`); the pure iso math
   stays top-left (its tests untouched). Farm already passes centres (`x: tile*TILE + TILE/2`),
   confirming the engine convention — the fix belongs in Citadel's conversion layer, not the engine.
2. **Blank band under buildings.** `isoSpriteDims.height` budgeted a full `diaH` below
   the walls, but `iso-draw.ts` centres the ground diamond on the wall-bottom mid-line
   (`yBotMid`), so only its lower half sits below the walls → a blank `diaH/2` band that
   `isoFootprintBox` pinned to the diamond bottom and floated the art. Fix = `height =
   roofH + wallH + diaH/2`. Both fixes are needed (centring alone still floats via the band).

Also fixed an HTML layout bug: the full-window build menu was clipped because `#canvas`
(`flex:1`) lacked `min-height:0` (its `auto` min-height = intrinsic backing-store height
grew past `100vh` under `overflow:hidden`).

3. **Terrain elevation lift desynced roads/bridges from the grid.** `makeTerrainDecorate`
   baked each diamond at a 0/1-step relief *lift* (`Math.round(elevationField)`), but every
   sprite, the road/bridge network, and the `isoToTile` pick live at elevation 0 — so on
   lifted tiles the ground floated 8px above its own bridge/road and opened dark seams at
   elevation steps (a bridge visibly offset from the water grid). Fix = bake terrain FLAT
   (drop the geometric lift); the elevation field still tints the dither (light highs / dark
   valleys) for a flat-2D sense of relief, just no offset. Citadel tiles are flat
   gameplay-wise and the pick can't cheaply account for per-tile height, so flat-everywhere
   is the consistent choice. Browser-confirmed: seams gone, bridge sits on the water grid.

164 client render tests + typecheck green.

## [2026-06-21] game+render | Citadel bridges — roads over water transform into non-overlapping bridges

A road dragged onto a Water tile now auto-converts to a new `bridge` building
type (sim: `entities/building.ts` def + `isBridge` production flag; `placeOne` in
`sim-bootstrap.ts` does the road→bridge substitution and gates bridges to
unoccupied water → **bridges cannot overlap**). Bridges join `roadGrid` (so
villagers/connectivity cross them) and a new `walkablePred` keeps the decked
water tile walkable in the raider/path grid; demolish clears the road tile before
rebuilding. Render: two textured flat-diamond fx frames `fx/road` (cobblestone)
and `fx/bridge` (railed plank deck) replace the flat navy road lozenge;
`isoNetworkTiles`/`pushNetworks` emit + stamp them (bridges depth-tucked under
roads). Determinism untouched (terrain/placement + render-only art). Tests:
`systems/bridges.test.ts` (4) + an `isoNetworkTiles` bridge-frame case; all
citadel suites green (137 sim-core, 177 client), both workspaces typecheck clean.
Wiki: [wiki/citadel-overview.md](wiki/citadel-overview.md) BRIDGES section.

## [2026-06-21] render | Citadel true-isometric epic — IMPLEMENTED + browser-verified (one open anomaly)

Built the whole iso stack from the brief
([todos/2026-06-21-citadel-true-isometric.md](todos/2026-06-21-citadel-true-isometric.md),
now `mostly-done`). New `render/iso.ts` is the single source of truth: 2:1
dimetric projection (`tileToIso`), the placement-critical inverse (`isoToTile`,
exhaustively round-trip tested for all 9216 tiles), `isoFootprintBox` /
`isoSpriteDims` (shared by renderer + sprite generators so art maps 1:1), and
`isoDepth`. `transform.ts` `screenToTile` now routes through the iso inverse;
the camera frames iso-world space. The renderer CPU-pre-projects every quad and
relies on the engine's existing within-layer `sortY` for painter's order
(buildings/villagers/raiders share one entity layer + iso-depth `sortY`).
Terrain bakes as **diamonds** (`makeTerrainDecorate` rewrite, whole-iso-world
texture; iso windowing for the big MP map deferred). Roads/walls/ghost/shadow/
cluster draw via a new `fx/diamond` atlas frame so they sit flat on the grid
(`isoNetworkTiles`). **Sprites re-authored true-iso** (`sprites/recipes/iso-draw.ts`:
diamond base + two shaded wall faces + hip roof) at 32-based res; units redrawn
32×32. The sim, determinism, and EDG32 guard are untouched.

Browser-verified via Playwright (solo client): diamond terrain, correct
placement/ghost picking on the diamond, depth-correct occlusion, iso roads, and
house/chapel/tower/storehouse rendering as proper iso volumes (screenshots in
repo root: `iso-village.png`, `iso-sprites-fixed.png`). **174 client tests + a
new iso-volume guard + palette guard all green.**

**One open anomaly (documented in the brief, not blocking):** a subset of
building types (market/storehouse/bakery/woodcutter) intermittently render as a
flat 2-tone box on this dev GPU. Proved the sprite DATA is correct end-to-end
(recipe→rasterize→alpha→pack→blit→UV→render-quad all byte-identical to the
working house; the guard test passes for market). Not reproducible from code →
suspected WebGPU driver/texture-sampling artifact on this host; flagged for
repro on another GPU. Pre-existing unrelated `@farm/sim-core` test failures
(bridge-graph, interior-decor, coral-fishing, travel, farmer-frames) were
confirmed independent of this Citadel-only work.

## [2026-06-21] plan | Citadel true-isometric epic — brief filed (render+art, sim untouched)

Decided to convert Citadel from top-down axis-aligned to a **true isometric
(diamond-grid) projection**. Scoped as a staged brief
([todos/2026-06-21-citadel-true-isometric.md](todos/2026-06-21-citadel-true-isometric.md))
*before* any code, per the CLAUDE.md workflow — a partial projection swap breaks
placement (ghost/drag/click) for every player, so it must not land half-done.

Key framing: this is a **render + input + art** epic fully inside `@citadel/client`.
`@citadel/sim-core` is untouched — the world stays an axis-aligned tile grid, iso is a
*display* of it; determinism is unaffected (all downstream of the RenderSnapshot), and
`CHECK_DETERMINISM=1` should stay byte-identical (the proof the sim wasn't touched).
Cost split ≈ **70% art, 30% code**; the two risk centres are the `screenToTile`
*inverse* (powers all placement/selection) and the volume of sprite re-authoring.
Five stages, each independently shippable+tested: (1) iso projection+inverse in
`transform.ts`, (2) renderer CPU pre-projection + painter's-order depth sort, (3) iso
terrain bake + diamond render-window cull, (4) **re-author the sprite library at the
iso angle** (the bulk), (5) autotile/cluster iso geometry. Convention to lock first:
**2:1 dimetric** (integer-friendly, keeps `pixelSnap` crisp) over true 30°. Rejected
"Option C" (3D camera) — this is iso 2.5D, not 3D.

## [2026-06-21] render | Citadel visual polish — terrain relief, building shadows, dusk wash, asset detail

Borrowed specific visual ideas from `tiny-world-builder` (a Three.js voxel toy) into
Citadel's existing 2D WebGPU pipeline — render-only, deterministic, EDG32-clean,
no sim change. Four landed: **(1)** `elevationField` value-noise in
[terrain-dither.ts](../games/citadel/client/src/render/terrain-dither.ts) biases the
sub-tile dither light/dark mix by coarse elevation (sun-lit highs lighter, valleys
darker) — a 2D echo of iso height-strata, baked → zero per-frame cost. **(2)**
`buildingShadowQuad` in [quads.ts](../games/citadel/client/src/render/quads.ts) casts a
soft SE-offset ink shadow (fake NW sun) on a new `LAYER_SHADOW` below buildings; flat
features (road/wall/gate) cast none. **(3)** Deepened night + stronger golden-hour dusk
in [atmosphere.ts](../games/citadel/client/src/render/atmosphere.ts). **(4)** Asset
detail in the shared generators ([sprites/recipes/draw.ts](../games/citadel/client/src/render/sprites/recipes/draw.ts)):
roof shingle striations, wall masonry/timber seams, ground-contact corner shadow,
stone doorstep, fort ashlar courses — flows through all ~20 building recipes at once.
All 160 `@citadel/client` tests + the palette guard green. Not yet eyeballed in
`npm run citadel`. These carry over conceptually into the iso epic above.

## [2026-06-21] fix | Citadel first real-GPU playtest — 3 solo-blocking playability bugs fixed

First time Citadel was driven on a host with a working GPU (prior reviews were
headless — see the verification-debt note in todo 38). Opened the solo client
(`npm run dev -w @citadel/client`, :5174) in Playwright and ran a check→fix→recheck
loop. **WebGPU renders fine** — terrain (river/forest/stone with sub-tile dither),
building + villager sprites, HUD, day/night all look healthy. But three bugs made the
game effectively unplayable for a new player:

1. **Well + Healer were unbuildable.** `main.ts` wires `btn-build-well`/`btn-build-healer`
   but the buttons were **missing from `index.html`** — so the *only* fire and disease
   mitigations couldn't be placed. The wiring silently no-ops on the missing element
   (`if (btn !== null)`). Fix: added both buttons to the toolbar (after Trading Post).
   They are correctly un-tier-locked (available from Hamlet).
2. **Commands were dropped while paused.** The Worker loop did `if (paused) return;`
   *before* `scheduler.tick()`, and commands are only drained **inside** the tick —
   so placement while paused queued forever and never applied. A city-builder must let
   you plan while paused. Fix: added `applyCommands(ctx)` to `CitadelSimResult`
   ([sim-bootstrap.ts](../games/citadel/sim-core/src/sim-bootstrap.ts)) — runs the
   `CommandSystem` + `RoadConnectivitySystem` only (no sim systems, no day clock); the
   worker calls it + re-emits a snapshot when paused. **Purely additive — the normal
   tick path is byte-identical, so determinism is untouched** (all 133 sim-core tests
   still pass; headless runner never calls it).
3. **Speed buttons didn't resume.** `1x/2x/4x` only called `setSpeed`; if you'd paused,
   the sim stayed frozen. Fix: `setSpeedAndResume()` resumes if paused (standard
   city-builder behaviour).

**Bootstrap is founding-window-gated and easy to miss.** The founder villager only
spawns while `daysSinceStart <= daysPerYear/4 + 2`; after that, immigration needs a
food surplus that needs workers that need population — a hard deadlock if you didn't
place a connected economy in time. Combined with the always-running clock (20 ticks/day
≈ 1 s/day at 1×), a new player races the window. Now mitigated by plan-while-paused.
**Fire balance is working-as-designed, not a bug:** ignition needs ≥3 wooden buildings
within Manhattan range 4; the intended layout (cf. the headless `grow` scenario) spaces
buildings ~5–8 tiles apart and connects them with roads (roads = firebreaks). A naive
"place everything touching to share connectivity" layout self-immolates — but a spaced,
road-linked town thrives indefinitely (verified to Day 199: pop stable, bread surplus,
Fire none). New hooks: `import.meta.env.DEV`-guarded `window.__citadel` (send/terrain/
buildings) in `main.ts` for automated harness testing only. Touched: `@citadel/client`
(index.html, main.ts, sim-worker.ts, vite-env.d.ts) + `@citadel/sim-core`
(sim-bootstrap.ts). typecheck + 133 sim-core + 155 client tests green. (Pre-existing,
unrelated: `@tool/world-preview` fails typecheck on clean HEAD — missing `@webgpu/types`.)

## [2026-06-19] audit | Citadel implementation review — problems filed as todo 38

Read-only review of `@citadel/sim-core` + `@citadel/client` + `@citadel/server`
(three subagent passes, load-bearing findings hand-verified; no tests/sims run).
Solo Citadel looks healthy; the problems cluster in the **MP-RTS epic (28–37)**,
which is headless-tested but never run live. Findings → new todo
[2026-06-19-citadel-38-implementation-review-problems.md](todos/2026-06-19-citadel-38-implementation-review-problems.md):
**P0** server-authoritative command handlers trust the sender — `demolish` /
`upgradeBuilding` have no ownership check (raze/drain a rival's city), `setActivePlayer`
is client-sendable, pause/resume/speed are un-gated. **P1** VillagerSystem ignores
`ownerId` (cross-player staffing/hauling in MP); the Citadel-36 social layer
(presence/emote/roster) is dead client-side; one global SimHost with no RunRegistry
(reconnect = frozen sim); the 21/22 windowed-bake `RenderWindowController` is built +
`bakeInitial`-d but `update()` is never ticked in the frame loop (MP map won't repaint
on pan). **P2** wall-spam inflates settlement tier; tier-demotion says "risen"; tower/
garrison safety radii feed nothing; `keepPresent` misses `town-hall`. **P3** siege
forks an unused RNG (load-bearing-for-replay dead fork), no WS error handling, dead
fields. **Corpus corrections:** `bakeStaticLayer(region?)` IS implemented (engine
`static-region.ts`) — the BUILD-ORDER/21/22 "engine integration left open" claim is
**stale**; and the 21/22 cores are consumed (not dead), just not pan-ticked.

## [2026-06-19] feature | Citadel entity sprites — runtime-generated pixel-art atlas

Replaced Citadel's flat EDG-colored boxes (buildings/villagers/raiders sampled a
generated 1×1 white pixel) with real pixel-art sprites. New self-contained module
[games/citadel/client/src/render/sprites/](../../games/citadel/client/src/render/sprites/):
ASCII `PixelRecipe`s (a small procedural generator — `makeBuilding`/`makeFort` + bespoke
farm/mine/quarry/well shapes — keeps the ~20 building sprites correct-by-construction and
visually cohesive: one light direction, dark outline, hue-shifted ramps), an EDG-derived
swatch palette, a pure rasterizer + shelf-packer, and `createCitadelSpriteAtlas` which
bakes them (plus a retained 1×1 `px` frame) into ONE in-process atlas at boot. No
committed PNGs, no new build step — deliberately unlike Farm's committed-PNG
`@farm/atlas-recipes`/`npm run atlas` pipeline (can't import it: games never import each
other), and a better fit for Citadel's in-process-atlas + WebGPU + Worker setup.

`quads.ts` now sets a `frame` per entity (`bld/<type>` white-tinted; `vil/person` /
`raider` grey-ramp tinted by FSM-state / red). The WebGPU `SpriteBatch` already sampled
real frames, so no renderer change was needed. House clustering kept (each house draws as
its own sprite + a unifying neighbourhood border; `clusterQuads`→`clusterBorderQuads`,
union-fill dropped). Determinism untouched (recipes static, rasterize pure, render-only).
Verified: client typecheck + all 155 client tests + engine palette guard green; art
eyeballed via a Node-rendered contact sheet (GPU render not verifiable headless on WSL2).
Synthesis in [wiki/citadel-overview.md](wiki/citadel-overview.md#rendering--assets).
Phase 2 left open: terrain tiles, road/wall autotile sprites, gate sprite, MP owner color.

## [2026-06-19] feature | Citadel 21/22 render-windowed static-layer bake (MP spine K — integration shipped)

Finished the spine-K cores (21 render-window, 22 incremental-build-budget) that
were shipped as pure helpers but left inert (imported only by their own tests).
The missing piece was an engine capability: `bakeStaticLayer` baked the whole
world as one texture with no sub-region parameter.

- **Engine (shared, backward-compatible).** `bakeStaticLayer` gained an optional
  `region?: StaticRegion` ({originX, originY, width, height}) on `RendererLike` +
  both renderers. New pure module `engine/core/src/render/static-region.ts`
  (`resolveStaticRegion` / `staticBlitRect`) drives the Canvas2D blit AND the
  WebGPU `StaticLayerPass` src-UV math in lockstep. Bake sizes the offscreen to
  the region and `translate(-origin)`s so sprites/decorate keep drawing in WORLD
  coords; `draw` clamps the visible rect to the baked region. **Region omitted ⇒
  whole world ⇒ src == dst, translate skipped ⇒ byte-identical** — Farm Valley +
  solo Citadel provably unchanged (asserted directly in `static-region.test.ts`:
  "full-world region is the pre-windowing identity").
- **Citadel wiring.** `render/window-controller.ts` `RenderWindowController` joins
  the two cores: `visibleTileWindow` (21) → `windowRegion` → re-bake gated through
  the `IncrementalQueue` (22) at `REBAKE_BUDGET=1`/frame, coalesced to the latest
  window (clear+enqueue) so a fast pan never triggers a synchronous re-bake.
  `makeTerrainDecorate(grid, window?)` loops only the window's tiles. A texel
  threshold (2048²) keeps small worlds (solo 96²) on the proven whole-world
  bake-once path (`update` is a no-op); only the 256² MP world windows. Wired into
  `createCitadelRenderer` (`bakeInitial`) + the `main.ts` loop (`update` after
  `fitCameraToCanvas`).
- **Verified headless:** engine render 73/73 + new static-region 9/9; new
  window-controller 8/8 (windowed vs whole-world, no-rebake on unchanged window,
  ≤1 bake/frame, fast-pan coalescing); engine + @citadel/sim-core + (my)
  @citadel/client files typecheck clean. **⚠️ Real-GPU acceptance pending** (this
  headless box can't render WebGPU): memory-flat-as-grid-grows + pan smoothness +
  no seam; possible 1-frame trailing black margin if a re-bake lags past
  `WINDOW_PAD=8` tiles on a very fast pan (raise pad/budget if seen). Briefs 21/22
  → [todos/closed/](todos/closed/).
- **Concurrent-session note:** a parallel session was mid-flight on Citadel sprite
  assets in the same tree (`render/sprites/`, `quads.ts`, `citadel-renderer.ts`).
  The harness merged my windowController wiring into their `citadel-renderer.ts`
  edits cleanly. The 5 red `citadel-renderer.test.ts` color tests + the lone
  `sprites/atlas.ts` typecheck error are THEIR in-flight work, not this change
  (my files are isolated; their `quads.ts`/`clustering.ts` are untouched by me).

## [2026-06-19] code | Citadel dev runner (`npm run citadel`) + render polish (slow wash, softer terrain)

Two small post-epic follow-ups (user-driven, not briefs), shipped to main:

- **`npm run citadel` now runs server + client together** (parity with Farm's `npm run dev`). Generalized [scripts/dev.mjs](scripts/dev.mjs) from a single hardcoded pair into a `TARGETS = {farm, citadel}` map keyed by `process.argv[2] ?? "farm"`; the `citadel` target spawns `npm run server:citadel` (`@citadel/server` on :8788) + `npm run dev -w @citadel/client` (vite :5174) with the same prefixed-output + teardown-on-either-exit behavior, and prints a note that solo needs no server (open `?mp` for online MP). Root `package.json`: `"citadel": "node scripts/dev.mjs citadel"` + `"server:citadel": "npm start -w @citadel/server"`. Commit `7da2350`.
- **Render polish — slow the day/night wash + soften terrain** (render-only, zero determinism impact). The wash was strobing (~1 s/cycle) because it tracked the 20-tick *sim* day 1:1; decoupled it onto a slow **visual** cycle — `VISUAL_DAY_TICKS = 1800` in [games/citadel/client/src/main.ts](../../games/citadel/client/src/main.ts) (~90 s dawn→night at 1×), the sim day clock untouched. Terrain read as harsh zoomed-out noise, so [terrain-dither.ts](../../games/citadel/client/src/render/terrain-dither.ts) `ditherClusters` is biased toward **fewer** specks (mostly 1/cell) and **lighter** accents (~75%), and the jarring salmon `wood` "Rough" ground became sandy `EDG.tan` in [quads.ts](../../games/citadel/client/src/render/quads.ts) `TERRAIN_COLORS`. Verified: `@citadel/client` typecheck clean, 132/132 tests, build clean. Commit `2d99e63`. **⚠️ GPU-unverifiable on this headless host — the wash period + dither bias are one-line constants to tune once eyeballed at a GPU (`npm run citadel`).**

## [2026-06-19] code | Citadel 28 PlayerState[] refactor shipped (MP epic spine A) + by-game monorepo reorg

Two things this session:

- **By-game monorepo reorg (merged to main).** Relaid out by the dependency seam: `engine/*` (`@engine/core`, `@engine/wasm-modules`) + `games/farm/*` (`@farm/sim-core`, `@farm/client`, `@farm/server`, `@farm/atlas-recipes`) + `games/citadel/*` (`@citadel/sim-core`, `@citadel/client`) + `tools/*` (all rescoped to `@tool/*`). Updated workspaces glob, all `-w` selectors, tsconfig depths, palette-guard walk roots, every hardcoded runtime path, the wasm/atlas output paths; rewrote root `CLAUDE.md` (server-side Farm sim, 21 farmers, new paths) + `README` + `wiki/architecture.md`; added `wiki/citadel-overview.md`; removed 15 orphan screenshots; split the Farm sprite recipes out of `atlas-builder` into `@farm/atlas-recipes`. Verified: typecheck matrix == baseline, all runtime paths resolve, farm+citadel production builds clean, atlas PNGs byte-identical, palette guard green.
- **Citadel 28 — PlayerState[] refactor (spine A) shipped.** Split all per-player economy/needs/territory/siege/hazard/tier state off the single `SimState` onto a first-class `PlayerState`; `SimState.players` holds one per player (solo = `[player0]`, `localId 0`). `ownerId` on buildings + villagers; all 11 per-player systems loop `state.players` in stable id order, attributing entities by owner; command handlers + snapshot + result getters target the local player. Determinism preserved — one shared per-system RNG fork pulled in player-id order (player-0 pull-order unchanged). Verified: `@citadel/sim-core` typecheck + 120/120 tests, `@citadel/client` clean, and the headless determinism digest BYTE-IDENTICAL before/after across grow/siege/sack/fire/disease (seeds 1,7) at `TICKS_PER_DAY=20`. Closed → [todos/closed/](todos/closed/).
- **Citadel 29 — configurable world + town-hall (spine B) shipped.** `CitadelSimOptions.worldWidth/worldHeight` (default 96×96; MP passes 256×256); bootstrap shadows `WORLD_WIDTH/HEIGHT` so every grid-backed allocation + the pathfinder + snapshot extents track the configured size; `generateTerrain` + river helpers parameterized (default call byte-identical). New non-tier-locked **`town-hall`** anchor (reuses the keep's `keepPosition`/sack-elimination semantics) — placed at match start; un-parks 21/22 (256² is the committed large-map consumer). Verified: 123/123 tests (new `world-config.test` covers 256² allocations + pathfinder + a 3-day tick + anchor placement), client clean, default-96 determinism byte-identical.
- **Citadel 30 — territory + build-gating (spine C) shipped.** `TerritorySystem` derives each `PlayerState.territory` as an influence radius (default 10) around owned buildings, recomputed on building-change (runs before connectivity, which clears the dirty flag). Build-gating is opt-in (`enforceTerritory`, default OFF → solo unchanged): place only within territory ∪ adjacent-unclaimed, never a rival's claim; the anchor goes on any unclaimed tile; overlap → lowest id. Verified: 127/127 tests, default-off determinism byte-identical.
- **Citadel 31 — pathfinder perf (spine D) shipped.** `bfsPath` swapped the per-call `new Uint32Array(width*height)` (~256KB/pathfind at 256²) for a persistent scratch (`prev`+`stamp`) reset in O(1) via a generation counter (realloc only on size change). One authoritative pure-JS pathfinder; BFS algorithm unchanged. Route equivalence proven byte-identical across all 6 scenarios; 127/127 tests.
- **Citadel 32 — PvP armies (spine E) shipped.** `launchAttack` command spends tools to field an army at your town-hall that auto-paths (authoritative pathfinder, around the defender's walls) to a targeted enemy building; ArmySystem resolves it via the shared siege math generalized to PvP — a sacked TOWN-HALL eliminates that player (last standing wins). MP-only (empty army list in solo → no-op). 130/130 tests; solo byte-identical.
- **Citadel 33+34 — per-player PvE RNG independence + gift (spine F,G) shipped.** raid-spawn/fire/disease derive each rival's stream from a separate `createRng` tree (player 0 stays the legacy stream → solo byte-identical, since fork() consumes its parent); a rival joining never perturbs others' schedules. New one-way `gift` command. 133/133 tests; solo byte-identical.
- **Citadel 35 — @citadel/server multi-writer netcode (spine H) shipped.** New `@citadel/server`: `CitadelSimHost` runs one authoritative sim per room; every peer submits commands, each stamped into the one stream + routed to the sender's player via a `setActivePlayer` marker (logged → deterministic replay); per-peer snapshot fan-out; late-join. Client `CitadelServerClient` is a WS drop-in for the Worker client (`?mp` flag; vite proxies /sim → :8788). `BuildingSnapshot` gains ownerId. Host unit test 2/2 (routing + late-join); all citadel packages typecheck clean; client builds; solo byte-identical. Live multi-client play is the remaining (headless-unverifiable) integration.
- **Citadel 36+37 — presence/roster/emotes + seeded lobby bots (spine I,J) shipped.** Ephemeral relay channel (presence/emote/roster) on the worker protocol, RELAYED by the host and kept OFF the command log (proven by a log-purity test). Seeded `CitadelBot`s join as peers via the same command surface as humans (`host.addBot(seed)`); a bot-filled match is reproducible from its seed. @citadel/server 5/5 tests; all citadel packages clean; solo byte-identical. Next: 21/22 (render-windowing — WebGPU client perf).

## [2026-06-19] plan | Citadel multiplayer RTS epic — grilled + decomposed (briefs 28–37; supersedes 26, un-parks 21/22, closes 23)

A grilling pass (the `grill-me` interview, one decision at a time) turned the old narrow **brief 26** (presence/bots/emotes only) into a full **competitive/co-op RTS multiplayer mode** for Citadel, and decomposed it into an ordered, dependency-aware backlog. **No code** — design + briefs only. Locked decisions (encoded verbatim in each brief's `## Decisions (grilled 2026-06-19)`):

- **Netcode:** server-authoritative **single sim per room**; every peer SENDS commands, the server stamps each into the one authoritative **command-log** at the current tick, advances the sim, fans out encoded snapshots (clients = renderers that can submit). Determinism preserved (one sim, one ordered log). Reuse the *pattern* of FV's `@farm/server` `RunRegistry`/`SimHost` but it's FV-coupled + owner-only-writer → build a **new `@citadel/server`** multi-writer variant.
- **State:** full **`PlayerState[]`** refactor — per-player stockpiles/pop/popCap/happiness/tier/territory/decrees/defensiveStrength/fireState; shared terrain/grid/tick; **`ownerId`** on buildings+villagers; single-player = the 1-player case. (Largest item; gates everything.)
- **World:** **256×256** (configurable); new **town-hall** building placed by each player at match start; **influence-radius territory** (grows from owned buildings, recomputed like road-connectivity; build only within own territory ∪ adjacent unclaimed). This **un-parks 21/22** (the committed large-world consumer).
- **Combat:** **launch-an-attack** armies reusing the shipped raider/siege math (auto-path to a targeted enemy building/town-hall; abstract deterministic resolution; NO unit micro). **Town-hall sacked = player eliminated; last standing wins.**
- **Diplomacy:** one-way **gift/transfer** command (no formal alliance state). **PvE stays on** (per-player NPC raiders + fire/disease alongside PvP). **Flavor:** presence cursors + roster + emotes + seeded NPC lobby bots — all included.
- **New requirement surfaced by the design:** a **sim-side pathfinder-perf** brief (31) — at 256² with per-player raiders + armies + haulers, `bfsPath` allocating a `Uint32Array(W*H)` per call churns ~256KB/pathfind ×N players; reuse-buffer / adopt the WASM pathfinder (cite the JS↔WASM-routes-diverge gotcha — pick ONE authoritative pathfinder).

**Spine:** A(28) → B(29) → {C(30), D(31), H(35)} → {E(32), F(33), G(34), I(36), K(21/22)} → J(37). Briefs in [todos/](todos/) (28–37 new; 21/22 un-parked). **Superseded/closed:** 26 → [todos/closed/](todos/closed/) (subsumed by 28–37), 23 → closed/ (WON'T-DO — Canvas2D `globalAlpha` micro-opt, moot under the WebGPU-only renderer). This is a major scope expansion (single-player city-builder → multiplayer RTS) — the briefs are the ready-to-implement backlog; **A(28) is the load-bearing first step.**

## [2026-06-19] build | Citadel depth pass (07–10/14) + WebGPU render wave (11/12/13/15–20/24/25/27) — ALL 17 actionable post-v1 briefs shipped

Shipped to main, per-brief commits (Opus-orchestrated, Opus subagents; user opted to **skip determinism re-proofs** this wave — relied on code review of determinism invariants + targeted vitest). Every sim-touching brief was reviewed for the load-bearing invariants (no `Math.random`/`Date.now`, FIFO ordering, forked/off-sim render RNG). The four parked/cut briefs (21/22 parked on world-size, 23 won't-do, 26 MP-deferred) remain in `todos/`.

**Sim depth pass (renderer-agnostic, sim-touching):**
- **07 tier-lock** — `TIER_LOCK` was dead code (Phase-5 progression was cosmetic). `placeOne` now rejects tier-locked buildings below the required tier + pushes an event; build palette greys/disables locked buttons with a "Requires <Tier>" tooltip; citadel hex literals routed through `EDG.*`. **Also fixed a pre-existing repo-typecheck break:** both citadel packages compile the engine WebGPU source via the `@engine/core` barrel but lacked `@webgpu/types` + the `*.wgsl?raw` ambient decl in their tsconfig (`types:["node"]` excluded them) — added both (prereq for 27). (farm-valley is red on main for the same reason — out of scope, untouched.)
- **08 building upgrades** — `level:1|2|3` on `BuildingRuntimeState`; `upgradeBuilding` command (validates exists/level<max/tier L2=Village,L3=Town/affordable, deducts planks·stone·tools). Effective-stat helpers scale output (×1/1.5/2) + housing (+3/lvl); **defense is additively capped (+2/lvl, never ×)** so siege stays winnable-losable (guard tests). Gives the refining chain a demand sink. Client Upgrade mode.
- **09 interlocking decrees** — the `tithe`/`conscription` stubs were UI lies. Tithe siphons 10%/day of stored goods → a **relief reserve** (cushions starvation before villagers leave; reserve ≥20 sweetens barter +1). Conscription: during an active raid, +floor(pop·0.5) defense but **production pauses**. No coin (APR #28).
- **10 hauler rerouting** — `VillagerSystem.advance()` peeks the next tile; a mid-haul road break (demolish/burn) makes the hauler hold + flags replan instead of walking through air. `drainReplans()` recomputes `bfsPath` **FIFO by ascending villager id** (the determinism rule), capped at 8/tick; no-route → hold (never the old teleport). Healthy networks never trip detection → byte-identical.
- **14 edge-coherent terrain** — `riverColAtRow(seed,ty)` pure functions; the river cosine-eases to a per-seed "mouth" at the top/bottom edges so water reads as continuing off-map. Interior terrain byte-identical to HEAD (only 6-row edge bands change). `edgeWaterColumns(seed)` exported for future spawn geography.

**WebGPU render wave (render-only, zero determinism impact, EDG-safe):**
- **27 (FOUNDATIONAL) WebGPU port** — dropped Citadel's bespoke Canvas2D renderers; the client now renders through the engine `RendererLike` (WebGPU forced at runtime, FV pattern). New `render/citadel-renderer.ts`: terrain baked once via `bakeStaticLayer`+decorate; buildings/villagers/raiders/ghost as tinted **sprite-batch quads off a generated 1×1 white atlas** (placeholder rects → quads, no authored art). Adopted `Camera2D` (pan/zoom + screen→tile re-derived, unit-tested). **Key discovery: the engine WebGPU `endFrame(overlay)` callback is a NO-OP** (only `wash`/`particles`/`weather` composite via their GPU passes) — so the ghost is a translucent quad, not OverlayFn, and HUD strips must stay DOM.
- **11 autotiling** — roads/walls render via a 4-neighbour bitmask → center block + arms toward connected neighbours (straight/L/T/cross/dead-end); walls read continuous through gates.
- **13 sub-tile dither** — deterministic per-(tx,ty,type) coordinate-hash dither baked into the terrain layer (EDG accents, zero per-frame cost, never persisted).
- **15 day/night wash + light pool** — `computeWash(season,dayFraction)` via the **native WebGPU TintPass** (verified it renders); warm light-pool glow quads on bakery/smith/market/chapel at night.
- **16 weather FX** — season→snow/rain via the engine `RainField` through the **native WebGPU WeatherPass**; visual only (APR #25 parks weather gameplay); off-sim RNG, capped pool.
- **18 ambient crowd** — `CitadelAmbientCrowd`: pooled pedestrians (cap 96) on road tiles, density by tier (6→96), hide during siege; NOT ECS entities, render RNG seeded off a constant.
- **17 placement/idle easing** — buildings ease in (scale+fade, appear-diff); villagers bob out of lockstep; chimney smoke via the engine ParticleSystem (native WebGPU particle pass). Tree sway N/A (forests are baked terrain).
- **19 follow-cam** — right-click a villager → `expSmooth` camera glide; DOM `#follow-hud` strip; release on click-empty/Escape/despawn.
- **20 batched sprite rendering** — satisfied by construction: every entity draw already routes through `renderer.push` → engine sprite-batch since 27 (no new code).
- **24 wear/decay overlay** — render-only soot/scorch overlay keyed off the existing `burning`/`onFire` snapshot flags. **DEFERRED (documented):** the full procedural-noise WGSL wear shader + time-based aging need an engine tint-pass/WGSL extension AND a sim `age`/`wear` field — out of render scope.
- **12 BFS clustering** (speculative) — adjacent same-type houses flood-fill into a union-fill composite block; singletons unchanged. Simplified (union fill, not L/T/+ silhouette synthesis) per the brief's low-priority framing.
- **25 settings modal** — accessible tabbed modal (role=tablist/tab/tabpanel, roving tabindex, Arrow/Home/End, keyword search, Escape/backdrop close) toggling the atmosphere features + zoom/speed.

**Verified on main:** `@citadel/sim-core` **120/120**, `citadel` **124/124** (new pure-fn render tests: quad/color mapping, screen↔tile round-trip, autotile masks, dither/wash/crowd/wear/cluster helpers, modal search/tab math), engine palette guard **6/6** (scans `packages/citadel/src`), typecheck clean across sim-core/citadel/engine, **`npm run build -w citadel` succeeds** (emits the WebGPU renderer chunk). **⚠️ Visuals are UNVERIFIED — WebGPU can't render headless on this box; every render brief's own acceptance defers a real-GPU eyeball to the user** (same as FV's pending visual passes). The per-brief "what the USER must eyeball" lists are in each closed brief / the commit messages. Briefs → [todos/closed/](todos/closed/) (`2026-06-19-citadel-{07..20,24,25,27}`).

## [2026-06-19] build | Citadel Phase 5 — settlement tiers + save/load (command-log replay) + polish — CITADEL FEATURE-COMPLETE

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated, two passes). The finishing phase — Citadel is now feature-complete (all of Phases 0–5 done). **Settlement tiers (the progression spine)** — `systems/tiers.ts`: `TierSystem` evaluates each day from population + (non-road) building count + defensive strength, promoting **Hamlet → Village → Town → Citadel → Fortress-City** monotonically with a `pushEvent` on each ("Your settlement has risen from Hamlet to Village!"); `TIER_LOCK` gates wall/tower/keep/garrison/refining buildings behind tier thresholds; `tier` added to `SimState` + `RenderSnapshot` + HUD (color-coded). **Save/load via command-log replay** — the canonical save IS the ordered command log (no separate format): a `logged()` wrapper around `commandSystem.register()` appends `{tick, command}` to `state.commandLog`; `serializeSave(tick)` → `CitadelSave` JSON; `loadFromSave(save)` bootstraps a FRESH sim and replays the log at the correct ticks to reconstruct identical state. Worker gained `request-save`/`load-save` messages; client `requestSave()`/`loadSave()`; browser Save (download JSON) / Load (file-picker → replay) buttons. **Art:** placeholder EDG32 rects retained (authored sprites deferred — per the locked build-with-placeholders-first decision; non-blocking for "is it a game"). **Verified on main:** `@citadel/sim-core` **94/94** (all 68 Phase 1–4.5 + Phase-5: tier promotes strictly at threshold, tier-lock rejects until unlocked, **save→reload→replay deep-equal snapshot** — population/buildings/tier/gameOver/stockpiles/building-positions all match); citadel-owned typecheck clean; **`npm run build -w citadel` succeeds**. **First pass tier bug:** settlement jumped straight to Town at pop 0 day 0 — root cause: `TierSystem` counted ROAD tiles as buildings (~31 road tiles → 44 count → past Town's ≥15 gate before any population). Fixup excluded roads from the count + added a `minPopForBuildings` floor; now the `grow` demo genuinely climbs Hamlet (d1–5) → Village (d6, pop 5). 

**Citadel build complete (Phases 0–5, 2026-06-18 → 2026-06-19).** A deterministic medieval city/fortress builder on `@engine/*` only: terrain + command-queue placement → economy (bread chain, villagers, road hauling, seasons, pull-model immigration) → happiness (services/needs/decrees/barter caravan) → siege (refining chains, walls/keep, seeded raiders, deterministic resolution) → hazards (fire/disease + well/healer mitigation) → tiers + save-via-command-log. 94 tests; command log = save/replay/MP substrate. **Orchestration meta-lessons this build** (folded into memory): worktrees must branch from current `main` not a stale base (Phase 3 was silently rebuilt on Phase 1); and green subagent tests repeatedly hid INERT features (Phase 2 dead economy, Phase 4.5 zero-fire/zero-disease, Phase 5 instant-Town) — always run the integration demo + read the numbers + reject weak (`≥0`/`fewer-or-equal`) assertions. Brief → [todos/closed/2026-06-18-citadel-06-phase5-art-polish.md](todos/closed/2026-06-18-citadel-06-phase5-art-polish.md).

## [2026-06-19] build | Citadel Phase 4.5 — hazards: fire spread + disease, with well/healer/spacing mitigation

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated, two passes). Two SPATIAL threats that reward deliberate layout (spacing/wells/services) — the OPPOSITE of siege wall-packing. **`systems/fire-system.ts`:** wooden buildings (house/farm/mill/bakery/woodcutter/storehouse/chapel/market/watchpost/tradingpost/garrison) can ignite + burn; stone buildings (quarry/sawmill/smith/mine/wall/gate/tower/keep) + roads + gaps are firebreaks. Seeded ignition (`rng.fork("fire")`) scaled by local wooden-neighbor density; seeded spread center-to-center within range, blocked by a firebreak on the line; burning building stops functioning + despawns after a burn timer (occupancy freed). **Well** (new 1×1, radius) cuts ignition + spread. **`systems/disease-system.ts`:** seeded onset (`rng.fork("disease")`) scaled by CROWDING (pop/houseCount) amplified at happiness<40; spread through crowded pop; sick villagers work less + can die (deaths flow through the existing immigration removal path — NOT by zeroing workerCount, which corrupted slots in the first pass). **Healer** (new 2×2, radius, 1 worker) cuts onset/spread/mortality. New systems registered at a `"hazards"` stage after needs-happiness, before population. `BuildingSnapshot` gained `onFire`/`burning`; `RenderSnapshot` gained `sickVillagers`/`outbreakActive`/`activeFires`. Well + Healer added to toolbar + EDG rects + SERVICE_RADII. **Verified on main:** `@citadel/sim-core` **68/68** (all 49 Phase 1–4 still green + Phase-4.5: dense-cluster ignites + spreads, well reduces, firebreak stops spread, crowding+low-happiness triggers outbreak, healer reduces deaths, sick villagers work less, post-hazard determinism). **First pass shipped INERT hazards** — 0 fires / 0 deaths in the demos, tests falsely green because they asserted "fires within 60 days" (demo capped at 40) and "well has fewer OR EQUAL fires" (0==0 passes). Caught by running the demos and reading the comparison summary. **Fixup pass** re-tuned thresholds + made the demo towns genuinely dense/crowded + TIGHTENED tests to strict (`> 0` and strict mitigation reduction). Now `SCENARIO=fire`: unmitigated **15 fire events → pop 0** vs mitigated **6 events → pop 6 survives**; `SCENARIO=disease`: unmitigated **6 deaths** vs healer **0 deaths**. **Lesson: weak test assertions ("≥0", "fewer-or-equal") pass on a dead feature — assert the hazard STRICTLY fires and mitigation STRICTLY reduces; always run the integration demo and read the numbers, green tests alone hid an inert feature twice this project.** Brief → [todos/closed/2026-06-18-citadel-055-phase45-hazards.md](todos/closed/2026-06-18-citadel-055-phase45-hazards.md).

## [2026-06-19] build | Citadel Phase 4 — threat/siege layer: walls/gates/towers/keep, raiders, refining chains, deterministic siege

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated, two passes). The THIRD pressure. **Materials refining chains:** `stone`/`planks`/`tools` GoodTypes; Quarry/Mine (terrain-locked on `TerrainType.Stone`), Sawmill (wood→planks), Smith (stone→tools) added to `PRODUCTION_DEFS` (same converter mechanism as the bread chain). **Defensive structures:** Wall (1×1 IMPASSABLE, drag-painted via a `placeWall` tile-list command, blocks the walkable grid), Gate (1×1, passable — excluded from occupancy so villagers pass, raiders chokepoint), Tower/Garrison/Keep with `defenseStrength`; placing the Keep sets `state.keepPosition` and starts the raid clock; keep sacked → hard game-over. **Three new systems:** `raid-spawn.ts` (seeded escalating raids ~every 8d shrinking toward 3d, `rng.fork("raids")` constructed once; spawn from a random map edge; path via citadel's JS BFS with a wall-aware predicate — gates passable, walls block — NO WASM pathfinder, per the JS↔WASM divergence gotcha), `raider-movement.ts` (1 tile / 3 ticks, recomputes path when exhausted), `siege-resolution.ts` (abstract deterministic calc: defense ≥ 1.5× raid → repelled; ≥ 0.5× → partial damage; else sacked). `RenderSnapshot` extended (raiders[], threat/next-raid, defenseStrength, keepSacked, stone/planks/tools, siege events). Browser UI: Quarry/Sawmill/Smith/Mine/Wall(drag)/Gate/Tower/Garrison/Keep toolbar + threat/defense/keep HUD + raider rects. **Verified on main:** `@citadel/sim-core` **49/49** (all 41 Phase 1–3 still green + 8 Phase-4: wall-blocks-grid/gate-passable, deterministic raid spawn + has-path, defensive-strength calc, strong-defense-repels, **undefended-keep→sacked→gameOver**, refining chains produce, **walls REROUTE raiders** — BFS path through walls strictly longer than open terrain — and full post-siege determinism deep-equal); citadel-owned typecheck clean. **Two headless demo scenarios prove the layer end-to-end** (the first pass's demo starved to pop-0 before the siege was decisive and produced 0 stone/planks/tools — fixup pass added proper scenarios): `SCENARIO=siege` (defended) — economy alive (bread chain flowing, pop 6→7), refining outputs stone=47/planks=134/tools=33, Raid 1 REPELLED, keep survives 40d; `SCENARIO=sack` (under-defended) — economy alive at sack time (bread=59, pop=10), **keep SACKED day 34 → game-over from the sack, not starvation.** The defended-repels / undefended-sacked contrast is the proof. Brief → [todos/closed/2026-06-18-citadel-05-phase4-siege.md](todos/closed/2026-06-18-citadel-05-phase4-siege.md).

## [2026-06-19] build | Citadel Phase 3 — happiness + governance: needs, decrees, barter trader (second pressure layer)

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated). The SECOND pressure layer + the player's between-build steering. **Needs (faith/safety/goods)** met by Manhattan-distance service radius (`SERVICE_RADII` per service type). **3 service buildings:** Chapel (faith), Market (goods — draws the Phase-2 global stockpile), Watch Post (safety placeholder; real garrison is Phase 4). **`systems/needs-happiness.ts`** — `NeedsHappinessSystem`: per-house need coverage → aggregate happiness = base + per-need + food ± decree penalties; registered AFTER connectivity+economy, BEFORE immigration so immigration reads current happiness. **Happiness modulates the EXISTING Phase-2 pull-model** (high → faster immigration; below threshold → villagers leave the existing out-migration path; not a parallel mechanic). **4 decrees** (lightweight modifiers, `setDecree` toggle command): rationing (−bread/head, −happiness), conscription (worker reallocation), tithe (−happiness), workHours (+output, −happiness). **`systems/trader.ts`** — `TraderSystem`: seeded caravan (`rng.fork("trader")`, ~7-day cadence, 3-day stay, fixed barter ratios — no coin); trade commands; event-feed arrival/departure. `RenderSnapshot` extended (happiness + per-need %, active decrees, trader-present + offers). Browser UI: HUD happiness + per-need, decrees panel, trade panel, new toolbar buttons + EDG rects. **Verified on main:** `@citadel/sim-core` **41/41** (6 Phase-1 placement + 9 Phase-2 economy — INCLUDING the load-bearing-hauling + winter-starvation tests, still green — + 16 Phase-3: service radius in/out, happiness rises-with/falls-without services, happiness modulates immigration, decree workHours/rationing measurably shift output/consumption, seeded-caravan-arrives-on-deterministic-tick, full determinism with decree toggle + caravan); citadel-owned typecheck clean. 22-day headless: Phase-2 behavior intact (pop 2→6, bread chain flows, winter plateaus grain) AND `happy` moves (50→35 under food deficit, recovers to 50), caravan arrives day 8 & 21 deterministically. Headless demo doesn't place a Chapel/Watch Post so faith/safety read 0% there — the mechanic is test-covered; only goods coverage (50%) is showcased in the demo run (non-blocking).

**⚠️ Orchestration incident (worktree stale-base — second occurrence of the documented lesson):** the first Phase-3 worktree branched from the PHASE-1 base commit (`e1d6d90`), not the merged Phase-2 (`587083f`/`d2cf333`). The agent silently reimplemented its OWN from-scratch Phase 2 and layered Phase 3 on it — net −559 lines vs main, deleting the real `pathfinder.ts`/`villager.ts`/`economy.test.ts`. Caught at merge-review by diffing the worktree branch against main (all-`+` diff vs base = stale base tell; 21 files / 1248+/1807− vs main = a rewrite, not an addition). **Fix:** created a fresh worktree explicitly from current `main`, saved the good Phase-3 logic (needs-happiness/trader/tests) to scratchpad, and had a fixup agent GRAFT it onto the real Phase 2 (reading the real `SimState`/defs/snapshot first, not copying the reference blindly). **Lesson reinforced: always create orchestration worktrees from current main (`git worktree add -b <b> <path> main`) and verify the base shows the prior phase's commits before launching; at merge time, diff the branch against main — an all-additions diff vs the intended base, or a large deletion count vs main, means the agent built on stale ground.**

## [2026-06-19] build | Citadel Phase 2 — economy MVP: roads, job-driven villagers, bread chain, immigration, seasons (v1 PLAYABLE)

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated, two passes). The MVP bar. **7 placeables:** House (pop slots), Farm (grain, seasonal), Mill (grain→flour), Bakery (flour→bread), Woodcutter (wood, terrain-locked near Forest), Storehouse (global pool target), Road (drag-paint). **New `@citadel/sim-core` systems** (registered in dependency order in `bootstrapSim`): `road-connectivity` (BFS from each storehouse over road+building tiles, dirty-flagged; disconnected buildings flagged + inert), `production` (tick-gated per-cycle; converters draw input from the pool, farms scale by seasonal `grainMultiplier`), `villager-system` (job FSM idle→walkToWork→work→haulToStore→walkHome; auto-assign idle villagers to nearest open reachable slot; tile-by-tile pathing), `immigration` (daily bread consumption = population; surplus + open slot → seeded immigrant; 3 consecutive deficit days → villager leaves; pop-0 → `gameOver`). **`world/pathfinder.ts`** — citadel's OWN pure-JS deterministic BFS (fixed N/E/S/W neighbor order, Uint32 predecessor table); citadel does NOT import farm-valley's JsPathfinder (layering) and uses ONE pathfinder everywhere to avoid the JS↔WASM route-divergence gotcha. **`world/seasons.ts`** — `getSeason(day)` + `grainMultiplier` (spring .5 / summer 1 / autumn 1.2 / winter 0); `DAYS_PER_YEAR=16`. `RenderSnapshot` extended: villagers[], stockpiles, population/popCap, foodSurplus, season, gameOver, per-building `connected`/`outputBuffer`/`workerCount`, recentEvents ring. `placeRoad` command (tile list). Client: full toolbar + road drag-paint + economy HUD + event feed; per-type EDG placeholder rects + villager dots colored by FSM state. **Two-pass orchestration lesson:** first pass passed its own tests but the headless run revealed a DEAD economy (pop stalled at 2/4, flour=0 forever, winter inert, villagers/hauling decorative — production read the global pool directly via a worker-count fallback). Fixup pass made villagers/hauling load-bearing and re-tuned rates. **Verified on main:** `@citadel/sim-core` 25/25 (economy chain, connectivity gating, hauling-is-mechanism, growth-over-N-days, winter-starvation→pop-0, 3-day twice-run determinism deep-equal at ticksPerDay=20); citadel-owned typecheck clean (only pre-existing engine WebGPU errors); 22-day headless shows pop 1→8, flour produced+consumed, winter surplus −3 / bread dip. Known balance tail: mill under-throughput vs farms (grain accumulates) — non-blocking. **For Phase 3:** happiness modulates the Phase-2 pull-model immigration; Market draws the global pool; decrees are modifiers on these systems. Brief → [todos/closed/2026-06-18-citadel-03-phase2-economy-mvp.md](todos/closed/2026-06-18-citadel-03-phase2-economy-mvp.md).

## [2026-06-18] build | Citadel Phase 1 — command queue + footprint placement (first playable interaction)

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated). The first playable interaction. **New generic engine substrate** (promoted to `@engine/core`, no game strings): **`@engine/core/commands`** — `CommandQueue<C>` (FIFO `enqueue`/`drain`/`length`) + `CommandSystem<C>` (drains the queue at a fixed early point each tick, dispatches to handlers registered via `register(type, handler)`); the ordered command log is the canonical save/replay/MP-sync artifact. **`@engine/core/placement`** — `OccupancyGrid(w,h)` (`apply`/`remove`/`isOccupied`), `checkPlacement(footprint, occ, buildablePredicate, adjacency?)` returning `{valid, reason?}` (terrain semantics injected so the engine stays game-agnostic; adjacency hook wired-but-unused, reserved for Phase-2 road-connectivity), `rebuildWalkable(w,h,occ,terrainWalkable)` (1=walkable, 0=blocked; footprints block movement). **Game (`@citadel/sim-core` + `citadel`):** House (2×2) as an ECS `BuildingComponent`/`BuildingEntity` with a `BUILDING_DEFS` registry; concrete `CitadelCommand` union (`placeBuilding`/`demolish`) + handlers that spawn/despawn + update occupancy + rebuild walkable. `bootstrapSim()` return extended with `world: World<BuildingEntity>`, `commands: CommandQueue`, `getBuildings()`, `walkable`. `RenderSnapshot` gained `buildings: BuildingSnapshot[]`; `WorkerInbound` gained a `command` variant. Client: toolbar (House/Demolish), tile-snapped translucent ghost tinted valid/invalid (EDG greens/reds), click → `command` message → worker `commands.enqueue` → applied next tick → next snapshot renders it. **All placement flows through the queue — no main-thread world mutation.** Gate verified on main: `@citadel/sim-core` 16/16 (incl. replay-determinism: same log into a fresh sim → byte-identical walkable + building set; + footprint-blocks-walkable + demolish-restores + invalid/overlap-rejected), `@engine/core` 156/156 incl. palette guard, citadel-source typecheck clean (only pre-existing engine WebGPU errors), vite build OK, headless exits 0. **For Phase 2 (economy):** add Farm/Mill/Bakery/Woodcutter/Storehouse/Road by extending `BUILDING_DEFS` + registering handlers (the placeBuilding handler routes by `buildingType`); `world.query("building")` enumerates workplaces for job-walkers; `rebuildWalkable` already runs on every change so walker pathfinding over `walkable` is ready; pass a `mustTouchRoad` predicate into `checkPlacement`'s adjacency hook for road-connectivity; extend `BuildingSnapshot` colors per-type in `building-renderer.ts`. This worktree merge was **clean** (no out-of-scope/corpus changes — verified the diff before merging). Brief → [todos/closed/2026-06-18-citadel-02-phase1-commands-placement.md](todos/closed/2026-06-18-citadel-02-phase1-commands-placement.md).

## [2026-06-18] build | Citadel Phase 0 — skeleton: packages, seeded terrain, deterministic worker loop

Shipped (commit `5260bc0`; Sonnet-in-worktree, Opus-orchestrated). New game alongside farm-valley. Two packages: **`@citadel/sim-core`** (TerrainType enum Grass/Water/Forest/Stone/Rough, seeded Perlin fBm `generateTerrain(96×96)`, `isWalkable`, `DayClockSystem`, Worker-agnostic `bootstrapSim`, minimal `RenderSnapshot`; 9 tests incl. same-seed-identical / diff-seed-different) and **`citadel`** client (Camera2D pan/zoom, EDG32 placeholder terrain rects via baked OffscreenCanvas layer + overlay pass, pause+speed, `sim-worker`/`sim-client` snapshot+interp wiring). Plus **`tools/citadel-sim`** headless runner (`SEED`/`MAX_DAYS`/`TICKS_PER_DAY`) and root scripts `dev:citadel`/`sim:citadel`. Gate verified on main: palette guard 6/6, sim-core 9/9, headless sim exits 0, citadel-source typecheck clean (only the **pre-existing** engine WebGPU `GPUBufferUsage`/`@webgpu/types` errors remain — identical to farm-valley, not introduced here). **For Phase 1:** `bootstrapSim()` returns `{scheduler, dayClock, terrain}` (designed to extend with `world`/`bus`); `RenderSnapshot` is minimal (add `buildings`/`entities`); terrain is `Uint8Array`+dims; keep the worker/headless split — add systems to `bootstrapSim`, not the worker; `isWalkable` currently treats forest/stone as passable (Phase 1 refines per building/resource rules). **⚠️ Orchestration note:** the build agent's worktree commit also deleted the APR + all 8 phase todos and edited log.md — caught at merge; merged code paths only (path-scoped checkout), corpus left intact on main. Reinforces the forbid-destructive-git + verify-the-diff-yourself lesson. Brief → [todos/closed/2026-06-18-citadel-01-phase0-skeleton.md](todos/closed/2026-06-18-citadel-01-phase0-skeleton.md).

## [2026-06-18] plan | Citadel — feature additions (third grilling): terrain, bread chain, seasons, decrees, trader, fire/disease, tiers

Third grilling pass turned the working-sim plan into a game worth a long sandbox run. Additions (APR #22–29): **varied terrain w/ resource nodes** (Woodcutter near forest, Quarry on stone); **shallow 1–2 step production chains** (grain→flour→bread, wood→planks, ore→tools — Banished-depth not Anno); **full bread chain in the MVP** (Farm→Mill→Bakery — the multi-step puzzle IS the game → Phase-2 set grows 5→7 buildings); **seasons bite** (winter halts farming → autumn-stockpiling rhythm, in the MVP); **fire + disease** hazards (spatial threats rewarding spacing/services — new Phase 4.5); **lightweight decrees** (rationing/conscription/tithe/work-hours — modifiers on existing systems); **no coin economy** — physical goods + a periodic **barter trader/Trading Post**; **settlement tiers** (Hamlet→Village→Town→Citadel→Fortress-City) as the no-win progression spine. Phasing held: v1 MVP = terrain + bread chain + roads + villagers + winter; everything else Phase 3+. APR + all 7 phase todos updated; new Phase 4.5 hazards brief filed. APR: [briefs/citadel-apr.md](briefs/citadel-apr.md); todos: [todos/](todos/) `2026-06-18-citadel-*`.

## [2026-06-18] plan | Citadel APR — new medieval city/fortress builder on the engine, grilled to zero open questions

New game scoped on top of the existing engine: **Citadel**, a medieval player-planner city/fortress builder (medieval Cities:Skylines). Two grilling passes resolved all design + build-time decisions. Player-planner (not observer — inverse of Farm Valley); open-ended real-time sandbox; deterministic command queue into the worker (log = save/replay/MP-sync); 96×96 fixed plot, 16px tiles; multi-tile footprints, roads-required connectivity; job-driven villager walkers (auto-assign), physical haul→storehouse→global-pool; pull-model immigration; four layered pressures (food+materials → happiness → threat/siege), phased; spatial siege with abstract resolution; EDG32 placeholder-rects first, sprites later; new sibling packages (`citadel` + `citadel-sim-core`) on `@engine/*` only; SP v1, MP-ready. Three pieces promote UP into `@engine/*`: command-queue, footprint placement, road-connectivity validation. APR: [briefs/citadel-apr.md](briefs/citadel-apr.md). 6 phase todos + build-order index filed under [todos/](todos/) (`2026-06-18-citadel-*`).

## [2026-06-14] brief | Briefs 92 + 93 done — rect-island world, BSP placement, overlap bridges, runtime-varying seed

Replaced the radial-ring world with a **fully seed-generated archipelago** (closes the Model-B epic). User-directed redesign: islands are **rectangles** (farms = fixed area / varied aspect; others vary), positions generated per seed, ring organization dropped, straight axis-aligned bridges that may form loops, ~60% land. Web-search-researched the algorithm (sources: VAZGRIZ procedural dungeons, RogueBasin/backdrifting BSP, Red Blob jittered-grid/Poisson, Wikipedia Urquhart/Gabriel/Theta-graph, rectangle-visibility-graph papers, Unexplored cyclic generation) → pipeline **BSP placement → side-overlap-filtered complete graph → Kruskal MST + δ extra-edges**, all integer-only.

- **A** (`5d93543`) `world/island-placement.ts`: BSP-split → one leaf/region → size inside (farms fixed-area factoring) → seeded interior placement with ≥2 gap by construction → coverage feedback loop to 55–65%. **B** (`4972db8`) `world/bridge-graph.ts`: overlap-filtered edges → MST (connectivity) → `BRIDGE_LOOP_DELTA`=0.18 loops → drop island/bridge crossings; returns null (seed retry) if unconnectable. Every probed seed connectable — BSP siblings reliably overlap, so no L-bend fallback needed.
- **C** (`9861ae5`+`9bf4153`) wired both into `generateWorld(seed)`, deleted ~780 lines of radial/ring/scatter/ranch-routing. `region-inventory.ts` = canonical region list + authored design-space centers. Light **`carveCorners`** replaces the organic CA mask (rect + notched corners). **Mutable world singleton**: `setActiveWorld(generateWorld(seed))` at bootstrap; `REGIONS`/`ROADS`/anchor-tiles are `let` live bindings; `world-dims.ts` breaks the regions↔placement init cycle; ports/coral derive lazily + rebuild via `onWorldSwap`. **Open-ocean boat grid** — boats pass UNDER bridges so the ocean stays one basin (port-to-port always routes); ports pick the isle's most-open side; pre-carved lanes retired.
- **D** (`4a55db5`+`5f5548d`) rewrote the radial guard tests for the generated model + `generate-world.property.test.ts` (30-seed accept-check). **Biggest gotcha:** `watering/shared.ts` snapshotted anchor tiles into module-load consts, freezing them to the default world → converted to functions (`tavernGatherTile`/`festivalPodiumTile`/`fishingCastTiles`). Also: rigid footprints (a per-tile-ridden footprint ballooned solids across a whole farm, severing it — the old code's own comment predicted this), station snap-to-land, reserved-tile set (plots/stations/docks/bridges) so décor never blocks a functional tile.
- **run-sim** (`20385ab`) honors a `WORLD_SEED` env var (defaults to the fixed map). **Verified** (fast 3-day/ticks=20 JSON export, sanctioned gate): same `WORLD_SEED` → **byte-identical**; different/unset → different world. Full repo green: sim-core 795, farm-valley 186, engine 142, atlas 15. 100-day/1200-tick CHECK_DETERMINISM **not run** (constrained hardware, per standing instruction).
- **Lessons:** (a) module-load `const X = AnchorTile` breaks the live-binding contract under a swappable world — read anchors at call time. (b) Content authored for one island shape (footprints/stations) must ride **rigidly**, not per-tile-snapped, or it scatters. (c) A fully bridge-connected *land* graph can partition the *ocean* into basins — let boats pass under bridges. (d) sim-core's `isolate:false` vitest shares the world singleton across files; pin it in `beforeEach` where geometry is asserted. (e) Balance drift: the spread-out map pushes the deadline-free coral trip later in a run (coral-fishing integration window 15→30 days) — mechanically sound, a distance-balance note.

## [2026-06-14] brief | Brief 91 done — organic island masks (CA + floodfill, pinned seed)

Shipped Model B brief 2 of 3 ([91](briefs/game/done/91-modelb-ca-shapes-and-mask-derived-anchors.md)) as **91a** (`0f6bf26`, pure correctness) + **91b** (`e6bdba9`, the one RNG-stream-sensitive site, isolated). Region masks are now **organic** on the default seed: new `world/organic-mask.ts` runs a per-region two-rule CA (born≥5/survive≥3, P=0.60, 2 passes, snapshot-read/new-buffer per pass) + array-queue floodfill from a pinned core. **Tuning was the crux** — a single threshold≥5 only reached ~50% organic; the two-rule form reaches **100% of regions with area≥36** (~45% avg land, no slivers), **fallbackCount=0**. New `world/region-setup/anchors.ts` (`forcedCoreTiles`) is the single source of truth for must-be-land tiles, pinned by the mask AND consumed by the entity spawner so they can't drift. generateWorld builds masks sequentially (cross-region ≥2-ocean adjacency check) and pins bridge-attachment tiles + an **L-path corridor** from each road entry to the region center to keep every region pass-through (reachability BFS holds — this fix was load-bearing; without it ~45/70 regions were unreachable). Anchors re-derived via `nearestLandTile`/`snapPropToLand`; watering/pen/greenhouse/cliff/bubble/coral/port sites made mask-aware; stations fail loud off-land. Guard tests rewritten over masks + new guards (≥80% organic, bounded fallback, core/tile-consts on land, determinism). The full-suite run (not just targeted files) caught 6 failures the targeted runs missed — pen/greenhouse placement on carved ocean, port/ranch docks, set-pieces snapshot drift — all fixed. Verified: sim-core 784/784, farm-valley 186/186, typecheck clean. 1200-tick headless determinism check **skipped** (user call, constrained hardware). Unblocks [92](briefs/game/todo/92-modelb-runtime-varying-seed.md) (runtime-varying seed + multi-seed property tests).

## [2026-06-14] brief | Brief 90 done — pure generateWorld(seed) + all-land region masks

Shipped Model B brief 1 of 3 ([90](briefs/game/done/90-modelb-generate-world-and-mask-plumbing.md)), two zero-behavior-change pure refactors in [regions.ts](../packages/sim-core/src/world/regions.ts). **Part A:** all eager module-level world gen wrapped in `generateWorld(seed): GeneratedWorld`, default-called once (`DEFAULT_WORLD`) and re-exported so the ~118 callers don't churn; RNG forks off the passed seed via the unchanged `'farm-ring-jitter'` label; `makeRadialFarmRegion`/`placeRanches`/`scaleAroundNearestIsland` param-threaded. **Part B:** `RegionDef.mask?: Uint8Array` (all-1 this brief), `regionMaskAt`/`forEachLandTile`, and a mask-aware `regionAt` — the central lever, so walls/shores/fishing/setup adapt for free. Direct bounds-iterators converted in walkable-grid/resource/carpenter (roads stay rect; `placeFootprint` + bubbles untouched). Masks stay off the per-tick snapshot. Verified by typecheck (zero new errors vs HEAD — remaining errors are pre-existing webgpu/world-preview/node-types) + 45 sim-core unit tests incl. new deep-equal/determinism/mask tests. The multi-seed `EXPORT=json` byte-identity diff was **skipped by user decision** (constrained hardware); unit tests + manual hazard review stood in. Unblocks brief 91 (CA shapes + mask-derived anchors).

## [2026-06-14] chore | Todo reconcile — close out the 2026-06-12 set

Re-verified all 14 `2026-06-12-*` todos against current code (combat/relationship/ring/steal in `packages/sim-core/src/systems/combat/` + `components/trust`, ports/bdi/world/render all present). The four still carrying a stale duplicate `status: open` frontmatter line (combat-subsystem, relationship-axis, ring-box, steal-from-npcs) were already shipped in the 2026-06-13 combat drop — deleted the stale line (kept the later `status: done`). Moved all 14 done todos to [todos/closed/](todos/closed/); only [BUILD-ORDER](todos/2026-06-12-00-BUILD-ORDER.md) (`status: reference`) stays in `todos/`. No code change. NOTE: the only remaining unbuilt work is the **Model B** brief epic ([90](briefs/game/todo/90-modelb-generate-world-and-mask-plumbing.md)/[91](briefs/game/todo/91-modelb-ca-shapes-and-mask-derived-anchors.md)/[92](briefs/game/todo/92-modelb-runtime-varying-seed.md)) — design-only, no code yet.

## [2026-06-13] plan | Model B organic world gen — 3-brief epic filed (90/91/92)

Grill-me design session locked the long-deferred **Model B** (stored organic island shapes, not just rect placement) from [world-generation.md](wiki/world-generation.md). Decisions: **all** regions organic (cluster+farms+landmarks); data model = rect `bounds` + per-region `Uint8Array` mask, generated on a global grid then sliced; shape algo = **CA-fill + center-floodfill** (plain TS, sim-core); constraints constructive (core-pin + bounds-inset) with **rect fallback** on retry-exhaustion (must log/count); **runtime-varying seed** via a pure `generateWorld(seed)` called once at bootstrap; **all** hand-authored anchors (podium/docks/stations/footprints/coral) re-derived from the mask. Sequenced into 3 todo briefs, each independently verifiable: [90](briefs/game/todo/90-modelb-generate-world-and-mask-plumbing.md) (pure `generateWorld(seed)` + mask plumbing, zero behavior change), [91](briefs/game/todo/91-modelb-ca-shapes-and-mask-derived-anchors.md) (CA shapes + mask-derived anchors, pinned seed), [92](briefs/game/todo/92-modelb-runtime-varying-seed.md) (runtime-varying seed + multi-seed property tests). No code yet — design only.

## [2026-06-13] chore | Corpus compaction — log, indexes, done-brief archive

Full compaction pass (user-requested). Corpus **10995 → 7290 lines, 152 → 138 files** (−34%). Everything trimmed is in git history; treat that archived prose as obsolete — re-derive from current code + wiki + the (condensed) brief if an old decision resurfaces.

- **log.md 577 → ~95 lines.** Collapsed the verbose 2026-06-11 and 2026-06-12 entry runs into two dated era summaries + a "Load-bearing facts" block (engine-10 allocator fault, engine-11 WGSL lesson, the WebGPU 5-bug render rules, worktree-swarm lessons, brief-84 SwiftShader lesson). Kept all 2026-06-13 entries verbatim (current context). Merged the 3 same-day ocean-veil entries into one final-state entry; fixed a duplicate animation-Tier-B header.
- **index.md** — dropped the game-brief by-range catalog (duplicated status.md, which owns brief state); now link-only per the page's own convention. Engine `todo/` note corrected.
- **status.md** — "Where things stand" updated: briefs 01–89 all Done/Superseded, both `todo/` dirs empty; briefs 85 + 89 noted closed-superseded; build-order todos complete; 2 calibration todos closed won't-do.
- **Done-brief archive condensed** — the 15 largest game done-briefs (104–229 lines each) cut to ~15–32 line OUTCOME records (title + status + intent + what-shipped/decisions/gotchas), dropping files-in-scope / acceptance / workflow / determinism boilerplate. Removed the 3 `*-plan.md` companions (08/09/10 — a done brief's pre-impl plan is the most obsolete artifact). Trimmed brief 08's leftover workflow scaffolding.
- **superseded/webgpu/** 12 files (~65 KB) → one `TOMBSTONE.md`. The wave-plan's 00-INDEX claimed "WON'T-DO, execution never started" but **WebGPU actually shipped** (game forces `backend: "webgpu"`, full `render/webgpu/` backend live) via a different path — the stale plan contradicted the code, so it's tombstoned with a pointer to reality.
- Broken-link sweep clean (no inbound refs to removed files). Conventions honored: done briefs stay one-concept files; status.md remains the per-brief source of truth.

## [2026-06-13] chore | Corpus compaction part 2 — merge brief clusters + drop irrelevant

Follow-up to the compaction above (user-requested). Grouped tightly-related done briefs (each a single shipped wave/effort fragmented across sequential numbers) into one rollup each, and deleted a one-off doc-bookkeeping brief. Corpus now **~5580 lines, 103 files** (from 10995/152 at session start — **−49% lines, −32% files**). Originals are in git history.

- **7 cluster merges** (N files → 1 rollup, terse outcome record per member):
  - engine 12–16 → [12-16-shader-wave](../briefs/engine/done/12-16-shader-wave.md) (WebGPU shader wave).
  - game 11–20 + 25 → [11-25-spectator-ui](../briefs/game/done/11-25-spectator-ui.md) (observer/spectator/playback UI).
  - game 36–40 → [36-40-spectator-story-layer](../briefs/game/done/36-40-spectator-story-layer.md).
  - game 41–46 → [41-46-gameplay-depth-wave](../briefs/game/done/41-46-gameplay-depth-wave.md).
  - game 50/51/52/54 → [50-54-more-islands](../briefs/game/done/50-54-more-islands.md) (53 stays superseded).
  - game 55–58 → [55-58-client-server-split](../briefs/game/done/55-58-client-server-split.md) (55 was the umbrella; the four still said "todo" — stale, now Done).
  - game 60–65 → [60-65-render-polish-wave](../briefs/game/done/60-65-render-polish-wave.md).
- **Dropped irrelevant:** game brief 31 (corpus-index-sync) — a one-off documentation-bookkeeping task with no game feature and no archival value (its sync actions were long since superseded). No inbound refs.
- **Cross-links repointed** to the rollups: status.md (engine table + the 24–48 game table collapsed 36–40 and 41–46 into single rollup rows; 25 row points at the spectator-UI rollup), index.md (engine done list), world-generation.md (shrine → more-islands), and the "concurrent-work" sibling notes inside surviving briefs 67/68/74. Also fixed two pre-existing stale `todo/` links surfaced by the sweep: open-questions.md AI-fishing item → done/80 (marked resolved), animation.md → superseded/85. Whole-corpus broken-link sweep clean.

## [2026-06-13] chore | Close out remaining backlog (won't-do)

Build-order set (2026-06-12 todos) all complete. User asked to mark the remaining open items done; on review they were **not** implemented, so closed as **won't-do** instead of faking completion (corpus stays honest — code wins). No code changed.

- `todos/closed/` (new) ← `2026-06-13-calibrate-rival-cutoff.md`, `2026-06-13-tune-combat-frequency.md` — `status: wontdo`. Both are unrun calibration tasks gated on multi-seed sim runs (resource limits + always-ask-before-determinism-check).
- `briefs/game/superseded/` ← brief 85 (animation engine) + brief 89 (detailed characters/held tools) — phases shipped, only the optional in-browser feel-check + a 24px action pass were left; closed with a top-of-file note. WebGPU-only render → couldn't feel-check headless anyway.
- `briefs/engine/superseded/webgpu/` ← whole WebGPU migration plan (planning complete, execution never started). 00-INDEX status → CLOSED/WON'T-DO.
- `todos/2026-06-12-00-BUILD-ORDER.md` — added a "Backlog closed" section listing the five. Both `briefs/*/todo/` dirs now empty.

## [2026-06-13] feature | Island ports + boat travel — port-to-port network

Sim+world+render goal [island-ports-boat-travel](todos/2026-06-12-island-ports-boat-travel.md). Generalises the coral dock→reef stubs into a connected port network over open ocean. Decisions (grilled): hub-and-spoke aim, neutral landmark islands, light AI hop. **Geometry forced a reframe** — probing `buildWalkableGrid` showed the grown world's bridge columns (x≈93,116,141) slice every south ocean channel top-to-bottom + a continuous E-W road wall at y=116-117 splits north/south ocean, so a 4-spoke hub is uncarvable without crossing bridges (would reopen [project_pathfinder_js_wasm_diverge]). User chose the honest "2-3 ports in the one open channel" over re-carving geometry.

- **`world/ports.ts` (new)** — `PORTS` (3): `port-fishing-isle` (W edge), `port-fishing-isle-2` (E edge), `port-casino` (N edge). Each dock is a LAND tile on the live island edge (DERIVED from bounds, mirrors coral's `reefOffIsle` → tracks the parametric scale); lanes are narrow fixed ocean corridors to a shared vertical trunk at **x=105** (the verified-clear south-central channel). A **module-load guard** throws if any lane tile isn't ocean (geometry drift). Helpers: `isPortDockTile`, `isPortLaneTile`, `nearestPort`, `portAtDockTile`, `openPortLanes`, `portLaneTiles`.
- **Boat grid union** — `buildBoatGrid` (coral.ts) now opens the coral stubs AND the port docks+lanes, so the one `aboard` boat grid spans both. `board-boat`/`return-to-shore` handlers accept port docks too (was coral-only).
- **AI** — `agents/watering/port.ts` `deliberatePortHop`: light, periodic (every 9d), high AP floor (140), low precedence (6) boat trip to the next port in `PORTS` order and back; beliefs-tracked target so it doesn't flip mid-hop. Wired into **opportunist**. **No new RNG** (deterministic target rule) → no stream perturbation. Phase machine mirrors coral: walk→dock, board, sail→target dock, disembark.
- **Pip** — `player-control/system.ts`: on a dock the action key boards / disembarks (LOWER precedence than a valid held-item action, so the isle-edge tile that's both a port dock AND a fishing-cast tile still casts with the rod); while `aboard`, `canStand` switches to the boat lanes (ocean) + docks so Pip steers across the water manually instead of on land. Port-hop is manual steering (no travel intent).
- **Render** — `PORT_STATICS` (geometry.ts): `tile/dock-floor` on each dock + a moored `structure/boat` on the first lane tile (reused frames, EDG32, no atlas change), baked in the static layer alongside FISHING/CASINO statics. A hull sprite (`structure/boat`, layer 49) rides under any `aboard` farmer, gliding via `renderPos`. Port docks added to the interior-décor forbidden set.
- **Verification:** typecheck clean all workspaces; full suites green — sim-core **773** (+new `ports.test.ts` geometry/connectivity, `port.test.ts` phase machine, Pip board/disembark/aboard-movement, coral boat-grid count updated for the union), engine 142, farm-valley 186. Real-run hop + 3-day/3-seed determinism diff **skipped per user** (constrained hw) — connectivity is proven by the pathfinder test, the mechanic by the driven phase/player tests, and determinism is structural (no new RNG). In-browser feel-check deferred. **Sim-standalone group COMPLETE — all 2026-06-12 build-order todos done.**

## [2026-06-13] feature | Per-agent BDI jitter — same-kind farmers diverge

Sim goal [randomize-agent-bdi](todos/2026-06-12-randomize-agent-bdi.md). Spike + proposal scope: bake a small per-agent jitter on three scalar BDI knobs ONCE at spawn so same-`kind` farmers (the 16 procedural farms shared the kind default; the 5 named shared hand-tuned constants) no longer behave identically. Decisions (grilled): own rng fork per agent (isolation); moderate spread ±15–20%.

- **New `agents/bdi-jitter.ts`** — `bakeBdiJitter(spec, seed)` returns `{minGoldReserve, riskTolerance, beanValueFactor}`. Each agent's rng is `createRng(seed).fork("bdi:"+name)` — derived **solely from `(seed, name)`**, so adding/removing/reordering a farmer never shifts another agent's draws and **no tick-time RNG stream is perturbed** (the fork advances only a throwaway base). Named farmers' values are the CENTRE of their jitter → character preserved.
- **Three SCALAR knobs** (no queue reordering — same decision *structure*, shifted *thresholds*): `minGoldReserve` ±30% around the spec base; `riskTolerance` continuous [0,1] ±0.15 around a per-kind base (conservative 0.0 / hoarder 0.5 / opportunist 0.7 / aggressive 1.0; augments the 3-level `riskProfile`, drives harbor-contract speculation); `beanValueFactor` golden-bean bid scale ±0.1 around a per-kind base (0.45/0.9/0.7/0.95).
- **Seam.** `setupFarmer(world, spec, seed)` now takes the seed and writes all three onto `desires.data` (open `Record<string,unknown>` bag — no component type change). Read-sites prefer the baked value over the kind literal: `bean-valuation.ts deliberateBean` reads `desires.data.beanValueFactor`; each personality's `deliberateHarborContract` call reads `desires.data.riskTolerance`. Conservative keeps its day-10 relaxation as `Math.max(0.5, baked)` (floor over the baked value).
- **Verification:** typecheck clean all workspaces; full sim-core suite green (756, +5 new `bdi-jitter.test.ts`). Real-run divergence + determinism diff **skipped per user** (constrained hardware) — unit tests prove the bake is deterministic + order-independent; per-agent fork guarantees no stream perturbation.

## [2026-06-13] feature | Underwater ecosystem + ocean veil (3-step, final = baked veil)

Render-only additive pass [improve-underwater-ecosystem](todos/2026-06-12-improve-underwater-ecosystem.md) + an ocean-surface look that iterated twice same-day. No sim/economy/determinism coupling. **Final state below is what's in the code** — the two superseded veil approaches (per-tile sprite quad at layer 5; the reverted `tile/ocean-veil` recipe) are git-only.

- **Static seabed life** (`render-systems/seabed-life.ts`, sim-core) — `SEABED_LIFE` seeded scatter (starfish, crab, sand-dollar, anemone) off `WORLD_GEN_SEED` via a **distinct `fork("seabed-life")`** (never shifts the `SET_PIECES` stream); blue-noise (`MIN_SPACING=2`, target 70) over open-water tiles only, forbidden from coral/reef-lanes/docks **and every `SET_PIECES` tile**. Baked at layer 2, `SEABED_LIFE_ALPHA=0.5`.
- **Animated water life** (`farm-valley/render/water-decor.ts`) — positions seed off `WORLD_GEN_SEED`, animation is wall-clock/`Math.random` (render-only): **kelp** (seeded, sin sway), **bubble columns** (seabed vents, upward bursts), **jellyfish** (transient pool ≤4, pulse-bob + fade), **sea-turtles** (lane gliders like whales). Plus a `fish-green` species in the fish-decor shoal list. 12 new EDG32 `decoration/*` frames; props sheet rebuilt.
- **Ocean veil → BAKED** (`render/ocean-veil.ts` `makeOceanVeilDecorator`, final) — runs LAST in the decorate chain (`groundNoise → shoreDescent → waterDepth → oceanVeil`), one `fillRect` per water tile on the world canvas → **no seams** (the earlier per-tile sprite-quad veil banded at fractional zoom). Keys off `regionAt(tx,ty) === null` (ocean **and** bridge spans, not `!isWalkable`) so under-bridge water veils identically. Baking over the static canvas means it now correctly paints over the **baked** seabed life so creatures read as seen THROUGH water. Near-shore speckle (`water-depth.ts`) tightened — nulled d=3/d=4, dropped white, so shallows hug the islands (d=1 dense → d=2 faint → nothing).
- **Verification:** typecheck clean; recipe count settled back to 239 (the color-fill veil needs no atlas frame); tests +`ocean-veil.test.ts`, +`seabed-life.test.ts`, `water-depth.test.ts` updated; full suite green (engine 142, farm-valley 188, atlas 15, sim-core 751, server 21); palette guard clean. In-browser look pending user sign-off.

## [2026-06-13] feature | Escapists block walls + local night lights

Render-only goal [escapists-walls-and-night-lighting](todos/2026-06-12-escapists-walls-and-night-lighting.md). Scope #1 + #3 (#2 global wash already shipped).

- **#1 Escapists block walls** — rewrote the two wall recipes (`tile/wall`, `tile/wall-wood`) as chunky depth blocks: heavy black outer cap, bright TOP FACE, darker SHADED SIDE FACE, block-seams; top half only, lower rows transparent. **Renderer/geometry untouched** — same recipe names + 16px size, so `WALLS` and `computeWalls()` (incl. the bridge-mouth gate) are unchanged. South-facing walls still depth-sort as occluders.
- **#3 Local lights** — new generic `overlay?: OverlayFn` on `RendererLike.endFrame` (engine), drawn LAST in world space after the day/night wash (engine stays game-agnostic; WebGPU backend ignores it). Static `LIGHT_EMITTERS` (`render-systems/lights.ts`, sim-core): forge, campfire, casino neon, ring, one lit window per cottage — positions resolved once from scaled geometry. `render/lights.ts` `makeLightOverlay` draws additive warm radial glows, brightness scaled by `nightnessFor()` (in-game clock, **never wall-clock** → deterministic), dusk-gated + view-culled. EDG32 anchor colors; gradient falloff not per-pixel palette-locked (same rule as the wash).
- **Verification:** typecheck clean; full suite green — engine 142, farm-valley 186 (+4 `lights.test.ts`), atlas 15, sim-core 747, server 21. Render-only; in-browser feel-check pending.

## [2026-06-13] feature | Combat subsystem — HP fights, ring + street (foundation + both fight todos)

Full combat scope landed in one drop: the [combat foundation](todos/2026-06-12-00-foundation-combat-subsystem.md), [ring-box](todos/2026-06-12-ring-box-rivalry-fights.md), and [steal-from-NPCs](todos/2026-06-12-steal-from-npcs-friendship-penalty.md) — the whole sim-fights group.

- **Core** (`systems/combat/`): new `Health` component (HP 40); `FIGHTING` FSM state (Perceive skips fighting farmers; Deliberate/Act gate them out). `CombatSystem` (ACT stage, after ActSystem) owns active bouts: a swing-exchange every `swingIntervalTicks(ticksPerDay)` ticks (≈24 @1200/day, 1 @20/day), seeded damage `rng.fork('fight:'+pairKey+':'+tick)`, swings cost AP (bat > fists, `hasBat` flag), first to 0 HP is KO'd (never killed). Tuning is reasoned guesses (deferred).
- **Ring**: `CHALLENGE/ACCEPT/DECLINE/RESULT` protocol (protocols/combat.ts). New **ring island** (region `ring`, `boxing` theme — ropes/posts/crowd-stand atlas, bridged to village). Ring bout: teleport both to the ring + restore after; ±10g stake (loser→winner); **mutual trust bond** (de-escalation via `applyTrustDelta`); HP reset to full at bout end; AP-out = immediate loss.
- **Street**: in place (no teleport/stake). KO → victor loots ≤3 individual goods units (`combat/loot.ts`; tools + gold never lootable). Per-tick seeded flee chance. **Witness trust**: every same-region farmer (+ the victim) drops trust toward the initiator; crossing below `RIVAL_CUTOFF` labels a one-sided rival → automatic **retaliation** next tick.
- **AI initiation** (`AggressionSystem`, DELIBERATE band): scans co-located farmers, targets the lowest-id rival, governors permitting → sets `farmer.chaseTarget`. RIVALRY-DRIVEN ONLY (no mugging strangers/friends). Pip excluded.
- **Chase + flee** (`ChaseSystem`, MOVE band before TravelSystem): re-points a pursuit travel intent each tick, marks the target `fleeingFrom`, fires CHALLENGE(street) on Chebyshev-reach. Fixed-tick pursuit window (`pursuitWindowTicks`) → give up if it can't close. **Pip** attacks anyone via player-control.
- **Governors**: per-pair 2-day cooldown + per-initiator daily cap (`CombatSystem.canFight`), AP-reserve gate.
- **Render**: `SnapshotSprite.healthFrac` (set only while FIGHTING) → HP bar; `challenge` intention → `indicator/intention-hostile` glyph. New atlas recipes, atlas rebuilt.
- **Deferred**: combat frequency + damage/cooldown tuning against a real run → [tune-combat-frequency](todos/2026-06-13-tune-combat-frequency.md) (intended: RARE DRAMA, not a daily brawl loop).
- **Verification**: typecheck clean; sim-core 747, farm-valley 182, atlas 15, engine 142. scheduler-stages + set-pieces snapshots updated deliberately. No determinism run (constrained hardware).

## [2026-06-13] feature | Unified relationship axis (trust ⊕ rivalry)

Foundation #0 for the fight todos. Collapsed trust + rivalry into one axis — `trust` IS the axis; the monotonic `rivalryScore` accumulator is gone.

- **`RivalrySystem` is now a trust-axis LABELER** (`systems/rivalry/system.ts`), no inbox/CNP snooping. Each tick it derives labels from the directional `trust` map. Dropped the `cnpCoordinators` ctor arg.
- **Rivalry is ONE-SIDED / directional** — `from→to` trust `< RIVAL_CUTOFF=0.25` means *from* treats *to* as a rival (the one-sided grudge steal-retaliation needs). `buildRivalriesData` (panels.ts) collapses to one display line per undirected pair (lower-trust direction).
- **Hysteresis** (`types.ts`): fires once on crossing below 0.25, latches, re-arms only after trust recovers above `RIVAL_REARM=0.40` — kills feed spam. Text "X resents Y" (directional). Alliance detection unchanged (mutual ≥0.8).
- **Friend sell-discount** (`peer-trade-policy.ts`): a SELLER's unit price scales down by initiator→peer trust — `MAX_FRIEND_DISCOUNT=0.10`, baseline 0.5→0×, 1.0→10% off, no surcharge below baseline. Pure read → deterministic.
- **Calibration deferred:** `RIVAL_CUTOFF=0.25` is a guess. Todo [calibrate-rival-cutoff](todos/2026-06-13-calibrate-rival-cutoff.md) (later closed won't-do). No multi-seed run.
- **Verification:** typecheck clean; full sim-core suite 726/726 green. Determinism check skipped (user direction).

## [2026-06-12] era | World-expansion + décor + animation + improvement-backlog wave

Shipped across 2026-06-12; per-brief detail in [briefs/](briefs/) + [wiki/status.md](wiki/status.md). Individual entries trimmed — git holds the prose.

- **Land foundations + consumers (world/render todo group COMPLETE):** grew the world **160→240** (uniform position-only `SCALE=1.5`: island `bounds` via `scaleB` keep size, gaps open ×1.5; on-island content locked to its island via `scaleAroundNearestIsland` so nothing drifts to ocean; coral derives from live isle bounds; one hand-tune: shrine +2x to keep the village↔shrine bridge; `DEFAULT_ZOOM` 2→3). The todo's "only one stray literal" estimate was wrong — the real blast radius was dozens of hardcoded 160-coords. Then: `RegionDef.theme` enum + `interior-decor.ts` `computeInteriorDecor` (per-theme blue-noise scatter inside themed regions, baked layer 2, forbidden-set from world queries dodges functional tiles + bridge mouths, deterministic per `WORLD_GEN_SEED`, **never read by sim**); bigger neutral islands (heritage/mushroom/ice/volcano/casino 8×8→12×12); 21 per-farm `ranch-N` islands hosting relocated livestock pens (tend now gated on being at the ranch → real daily AI traffic); casino open-air (building removed, dressed with 5 new gaming sprites as island-locked baked props) — which surfaced + fixed a grow regression (baked `BIG_STRUCTURES` forge/carpenter/weather/volcano had stale 160-coords baking in ocean post-grow; now island-locked, geometry.test guards it); 4-way `seasonalTreeFrame` (blossom/green/autumn/bare over tree/bush/fruit-tree/big-tree, instant swap) + new `big-tree` landmark island, and a latent fix (mature orchards rendered as saplings — nothing swapped the frame on maturity).
- **Improvement backlog (filed + shipped same day, one worktree branch per brief, Sonnet executors, merged individually, tests green each merge):** engine 10–16 + game 86–88. Detail in [wiki/status.md](wiki/status.md). Load-bearing facts kept below.
- **Animation (briefs 85 + 89, both later closed superseded):** reintroduced `@engine/core/animation` (`AnimationClip`/`Animator`, recovered from the deleted `0919cbc`) **with real consumers** (the ~7 inline wall-clock cyclers + a render-side action swing so working farmers/Pip move) — the brief-04 ghost rotted because nothing consumed it. Tier-A juice (engine easing module, **frame events on `AnimationClip`** — the architectural unlock, footstep dust, asymmetric idle bob, action scale-pop). Tier-B (`enumerateFarmerFrames` existence-guard test closing the silent-missing-frame gap; formalized facing vocabulary; deliberately NOT a stateful transition-FSM — the renderer is stateless per-frame, so a state→clip resolver is the right shape). Brief 89: detailed 24×24 locomotion (pipeline unified through one `generateFarmer()` loop; actions stayed 16px) + a render-side carried-tool overlay (Pip holds the selected hotbar tool, pixel-safe: per-facing sprites + `flipX`, no rotation, hand-anchor translation).

### Load-bearing facts from the 06-12 wave (do not re-derive)

- **Engine 10 — WASM pathfinder allocator fault:** the TS wrapper freed `gridPtr` before `outPtr`, but the AS **stub bump allocator only reclaims the most-recent allocation**, so ~25.6 KB leaked per `findPath` → heap exhausted at ~655 calls → `unreachable`. Fix = two-line free-order swap + an 800-call churn regression test (red pre-fix). The leak never bit short runs (3-day output byte-identical to pre-fix main; **fast diff MATCH ×6**, seeds 0xc0ffee/1/42 × ticks 20/1200, WASM pathfinder).
- **Engine 11 — WGSL validation:** `wgsl_reflect` 1.4.0 parse-validates every `*.wgsl` in tests (throw-fixtures prove it bites); the reserved-keyword regex is **kept** — the parser does NOT catch that class (the original black-screen incident). Quirk: the package `main` is CJS; a vitest `resolve.alias` redirects to its ESM entry. **Lesson: green tsc+vitest does NOT mean a shader compiles** — diagnose render-blackouts via the browser console (`CreateShaderModule` errors).
- **WebGPU 5-bug review (load-bearing render rules):** (1) **one `writeBuffer` per buffer per frame, always before encoding draws that read it** — `SpriteBatch` clobbered a shared GPU buffer per atlas group; the queue-timeline last-write-wins corrupted nearly all dynamic sprites. Fixed with a frame-packing protocol (`begin()→add()×→upload() once→drawRange()` with `firstInstance`). (2) WGSL `struct{vec3,f32}` packs the f32 at byte offset 12 (vec3 tail padding), not 16 → weather read 0 → invisible. (3) Canvas2D `pattern.setTransform(translate(+scroll))` shows texel `p−scroll`; the shader sampled `p+scroll` → water scrolled backwards. (4) shadows drawn on the 2D overlay sit above the GPU canvas → farmers' shadows darkened the farmers; moved to an in-pass instanced SDF ellipse batch (premultiplied source-over of black at alpha a ≡ canvas `multiply`). (5) Canvas2D drops the `tintRgba` alpha byte (`tint >>> 8`); GPU multiplied it in → tints rendered at the wrong alpha; GPU now drops it too.
- **Worktree-swarm lessons:** (a) symlinking the repo `node_modules` into a worktree breaks if the agent runs `npm install` (clobbers the symlink with a real dir); (b) `packages/wasm-modules/dist` is gitignored — symlink/copy it in; (c) in a worktree, farm-valley's `@engine/core` resolves through symlinked node_modules to MAIN's engine source — new cross-package engine APIs need a local structural type-guard; true integration is only proven by the post-merge test run on main; (d) run merges from the main repo cwd, never inside the worktree.
- **Brief 84 — FPS regression was a measurement artifact, NOT the game:** a user real-GPU `?profile` export (ANGLE / AMD Radeon) showed 99 fps / 5 ms JS; the old "15–30 fps" was headless-SwiftShader (CPU raster). **Lesson: never diagnose a raster/GPU regression from a headless SwiftShader profile.** Shipped a `?profile` export button + `window.__exportProfile()` + a WebGL GPU-identity probe (reusable). No GPU-overdraw work needed.

## [2026-06-11] era | Render-polish + pseudo-3D + brief-66→79 wave + wiki audit

Shipped 2026-06-11 (Opus-plan / Sonnet-execute, committed per-brief); per-brief one-liners in [wiki/status.md](wiki/status.md). Individual entries trimmed — git holds the prose. Highlights + durable lessons:

- **Briefs 66–79:** 66 tab-resync, 67 pixel-snap + camera smoothing (`expSmooth`/`pixelSnap`, bake byte-identical), 68 seeded ambient life, 69 named scheduler stages + same-stage bus audit (flattened order byte-identical), 70 startgold +30 (baseline moved), 71 per-asset atlas recipes + hash-cached per-sheet builds, 72 `RunRegistry` shared-run lobby (one `SimHost` per run-key, encode-once fan-out, owner-only control, late-join replay; determinism untouched), 73 travel-reachability guards (root cause: gather tiles pointed at OCEAN in the radial world; baseline moved), 74 weather-station island, 75 principled [economy.md](wiki/economy.md) model (1 AP = one basic-labour action; crop g/AP spread compressed 2.64×→1.59×; baseline moved by design), 76 loading screen, 77 3D buildings + per-farm cottages (premise correction: all 21 farms already had homes; 77 replaced them), 78 Pip-movement **not reproducible** (root cause: duplicate dev processes — a stale second socket attaches as spectator and input is swallowed), 79 click-to-target + action cursor.
- **Pseudo-3D arc (brief 81 + follow-ups):** engine `z` axis (dormant foundation — `screenY = y − z`, y-sort key stays ground `y`, nothing sets z yet); persistent camera-tracked `RainField` (root cause of "rain resets when walking" was a no-persistent-volume bug, not coordinates); rain splashes; x-ray occlusion pass (player-only); buildings moved to layer-50 dynamic occluders; inventory system (E opens, unified item grid, sim-authoritative layout via swap-slots); forageable berry-bushes + tree-chop seed bonus (forked rng, baseline moved).
- **Wiki audit (lint+compress):** fixed world-dimension drift (88×80 → 160×160 everywhere current); found the latent AI-fishing bug (`FISHING_CAST_TILES` pointed off-isle pre-reorg → AI fishing silently dead; fixed in brief 80 by deriving cast tiles from live isle bounds); re-pointed stale `todo/`→`done/` links; compressed open-questions 66→29 lines + rewrote status.md as a current-state snapshot.
- **⚠️ Incident (worktree lesson origin):** a brief-74 subagent ran `git reset --hard`, wiping uncommitted 66/67/68 edits (recovered). Lessons → **forbid destructive git in subagent prompts, commit per-brief, verify exit status directly.**
- **Maintenance:** stripped provenance/changelog/restating comments across ~450 TS files (kept only invariants/ordering/determinism/formula notes); extracted the scheduler-ordering rationale into [wiki/system-ordering.md](wiki/system-ordering.md) (now authoritative). Durable facts surfaced: WasmHeap view-after-grow invalidation; sprite queue trimmed to `queueLen` before sort; bilinear smoothing guard at zoom < 1; `permessage-deflate threshold:1024` ~70–80% wire reduction; pool slots must assign all optional fields on reuse; festival anchors (spring d13/summer d38/autumn d63/winter d88 at SEASON_LENGTH=25).

## Archive — 2026-05-26 → 2026-06-10 (older entries trimmed 2026-06-11)

Trimmed to keep this log minimal. **Full entry text is in git history** (`git log -p -- corpus/log.md`); every brief's detail lives in [briefs/](briefs/) (done/superseded) and durable synthesis in [wiki/](wiki/). Era summary:

- **05-26 → 05-29 — Foundations.** Wiki adoption; engine briefs 02–08 (input, tests, spatial+anim, pathfinder-into-movement, determinism harness, baked tile layer, WASM expansion); game briefs through ~23 (personalities, weather/crops, market/shop/auctions, observer + spectator UI, regions+travel, seasons, mid-game shock).
- **06-03 → 06-04 — Long-day redesign + archipelago birth.** Briefs 24–35: complete auctions, day/night + seasonal grading, long days (ticksPerDay 1200) + AP rework + irrigation, rendering overhaul + world expansion, player activity. World rebuilt as an 88×80 island-per-zone archipelago; EDG32 enforced project-wide; Pip + interaction systems; fishing isles + bubbles.
- **06-05 → 06-06 — Spectator/story + gameplay-depth waves.** Briefs 36–48: end-of-run recap, rivalries/relationship matrix, drama scoring, wealth graph, thought bubbles; crop roster + quality (the spine), livestock + orchards, greenhouse + skills, working NPCs + tavern, festivals, harbor + contracts, atlas split (47), boats + coral fishing (48). Engine brief 09 perf pass; monolith→module-dir refactor; mining `Math.random` determinism fix.
- **06-08 → 06-09 — 21 farmers + organic procgen + more islands + radial reorg.** Service NPCs lightly deliberate; scaled to 21 farmers; brief 49 organic procgen (fBm + domain-warp, clustered features, open-water props; Simplex deferred); briefs 50–54 islands (shrine, heritage, waterfall, camping; 53 superseded); spectator-UX audit P1a–d; **the 160×160 radial map reorg.**
- **06-10 — Client/server split + polish + perf re-measure.** Briefs 55–58 (extract `@farm/sim-core` → Node WS server → renderer-as-WS-client → deploy); brief 59 peer-interaction fix (price-bug + `OFFER_CROP`); briefs 60–65 render-polish wave; brief 70 +30 startgold; brief 71 per-asset atlas recipes + cached builds; edge depth-sorting; perf re-measure; brief 09 closed; the FPS-regression triage that became performance.md Tier 0.
