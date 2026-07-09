---
summary: Citadel's HUD, overlays, and diegetic feedback surfaces — top bar, goods strip, build bar, inspect panel, minimap, notifications, and the DOM-to-canvas migration state.
updated: 2026-07-02
---

# Citadel — HUD & overlays

Split out of [citadel-overview.md](citadel-overview.md) on 2026-07-09 (the page had grown to 463 lines).
Design intent for the diegetic-feedback direction lives in the **cozy pivot** banner on that page.

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
> before — and headless runs stay byte-identical). The full civic reframe shipped in Phase G
> (below); the town-hall sprite is still the shared `warehouse` form + banner (bespoke
> civic-hall art is optional follow-up polish).

> **2026-07-01 — cozy-pivot Phase G shipped: the autonomy pass (decision #8).** The player
> now sets **placement + economic intent**; the town **autonomously** handles all behavior.
> - **Trading post is the sole economic-intent lever, player-driven.** `TraderSystem`
>   ([systems/trader.ts](../../games/citadel/sim-core/src/systems/trader.ts)) stopped being
>   an autonomous seeded caravan (removed `rng.fork("trader")` / `TRADER_INTERVAL_DAYS` /
>   auto-barter). Now: `traderPresent` = "owns a **staffed + connected** tradingpost";
>   `traderOffers` is a deterministic ≤3-offer menu (rank by stock, plentiful→scarce, fixed
>   5-for-3, no RNG). Command `barter` → **`trade`** (`{offerIndex}`); tithe
>   `RELIEF_BARTER_THRESHOLD` sweetener retired. Client trade UI is an in-canvas
>   **InspectPanel** "Trade:" box (shown only when `traderPresent`), replacing the old DOM
>   trader panel. Constraint is **no NPC *autonomy*** (no auto-trade), not "no villager works
>   the desk" — the staffed trader still executes the exchange.
> - **`public-square` — net-new civic building** (2×2, `SERVICE_RADII` **8**,
>   `workerSlots:0`, `BUILD_COST wood:8`): `plaza()` iso sprite, untiered `Square` build-bar
>   button, `festival`→`EDG.green` coverage ring. Autonomously lifts festival happiness
>   (+15, spatial) for homes in reach — replaces the old `festival` **decree**.
> - **Rations/work-hours autonomous via town-hall.** The old `workHours` +30% decree is
>   re-homed as an **automatic ×1.2 output lift** for producers within a town-hall's reach
>   (radius 10), in [production.ts](../../games/citadel/sim-core/src/systems/production.ts).
> - **Decree/policy lever fully purged** from the cozy sim core (`setDecree` handler +
>   festival/conscription constants + `_maintainDecrees` + decree-penalty block +
>   `festivalDaysLeft` all deleted; conscription production-halt gone; client decree UI
>   removed). ⚠️ **`activeDecrees` is KEPT but always-empty** — two out-of-scope systems still
>   read it (`immigration` tithe/rationing, `siege-resolution` conscription); they are dead-
>   in-practice branches to be purged when those systems get their cozy pass. The `setDecree`
>   command type survives in the union with no handler (silently dropped) — a deliberate
>   back-compat vestige, commented as such.
> - **Territory + army frozen from the cozy/solo path** (byte-identical, MP preserved):
>   `TerritorySystem` registration gated on the existing `enforceTerritory` (solo=false →
>   drops a dead pass); new **`enableArmy?`** bootstrap option (default true, round-trips
>   save/load like `cozyThreats`) gates `ArmySystem`, and the **solo worker passes
>   `enableArmy:false`**. `army.test.ts` stays green unmodified (defaults true).
>
> Gates: sim-core **211/211**, client **387/387**, typecheck-clean, **determinism MATCH ×3**
> (baseline moved by design). Full detail + controller adjudications in [log.md](../log.md).

> **2026-07-01 — cozy-pivot Phase H shipped: economy under the downside rule (decision #9).**
> *Nothing ever fully stops; every problem is a throttle toward a ~60–70% floor.* Two changes
> (the winter grain floor + the decree purge had already landed in Phases B/G):
> - **Throttle-not-halt** ([production.ts](../../games/citadel/sim-core/src/systems/production.ts)):
>   the stockpile-pressure hard `continue` (a full-buffer building went *dark*) is now a
>   `bufferThrottleFactor(buffer,cap)` ramp — full rate below a 60% fill knee, then linear
>   down to the 0.6 productivity floor as the buffer fills, **never 0**. A chronically
>   unserved building *trickles at the floor* (goods backing up) instead of shutting down.
>   Safety rails: a genuinely-full buffer still hard-skips *before* the input draw (no wasted
>   input), and a `Math.min(amount, cap-buffer)` clamp keeps the buffer ≤ cap.
> - **Single-slot producers**: `farm/woodcutter/quarry/mine` → `workerSlots 2→1` (converters
>   were already 1). Growth is spatial (more buildings), no dead 2nd mouth. **Farm output
>   stays 3/cycle** — production never scaled with worker *count* (a per-building emit gated
>   on `workerCount>0`), so dropping the dead slot leaves daily throughput unchanged (the
>   brief's "3→6 compensation" was cut as premise-wrong).
>
> Gates: sim-core **212/212**, typecheck-clean, **determinism MATCH ×3** (baseline moved by
> design → town now survives winter + self-recovers from starvation dips; `gameOver=false`).
> Full detail in [log.md](../log.md).

> **2026-07-01 — cozy-pivot Phase I shipped: terrain clustering + solvability guarantee (decision #10).**
> *Terrain IS the puzzle: a guaranteed-solvable floor with rich texture above it.* **The last
> structural pivot pass — A, B, C, D, G, H, I are all done.**
> - **Clustering** ([terrain.ts](../../games/citadel/sim-core/src/world/terrain.ts)): the per-tile
>   forest/stone fbm *sprinkle* → seeded **blob-centered patches** (groves + ore-veins) via a
>   SEPARATE `createRng(seed).fork("resource-clusters")` (river/lake stream byte-identical; the
>   unused `baseNoise` layer removed cleanly). ~0 singletons → woodcutter/quarry/mine placement is
>   a real "build toward the resource" decision, and resource-poor maps now genuinely occur (giving
>   the Phase-G trading post a job).
> - **Solvability guarantee**: a new pure `repairSolvability(cells,w,h)` at the end of
>   `generateTerrain` guarantees a 12×6 all-buildable core box near center (carves one if none
>   exists) + ≥1 reachable Forest + ≥1 reachable Stone (4-connected flood-fill from the core; paints
>   a small blob if missing/stranded). No RNG — pure fn of the grid. 100 seeds → 100/100 solvable +
>   byte-identical (0 core-carve / 3 forest / 10 stone repair).
> - **Shared `findCoreBox` (review fix)**: the guarantee and the Phase-C cold open (`seedFoundingTown`)
>   now call ONE exported `findCoreBox`+`CORE_BOX_W/H` (full-grid ring scan), so they can never anchor
>   different core boxes — **provably lockstep by construction**. (Two finders caught the prior
>   `/4`-vs-`max(W,H)` radius mismatch; the carve targets the center box, which `findCoreBox` returns
>   identically.) `seedFoundingTown`'s inline box scan was removed in favour of the shared helper.
>
> Gates: sim-core **220/220** (terrain.test.ts 10→19: clustering >90%-connected, solvability across
> 50 seeds, repair determinism across 100), typecheck-clean, **determinism MATCH ×3**. Full detail +
> controller adjudications in [log.md](../log.md).
> **Open in the pivot:** only the optional/later phases — F (motivation: emergent goals + diegetic
> recognition, no score/quests) / E (villager mood polish). The whole structural pivot has shipped.
> Not yet eyeballed in-browser (WebGPU headless).

> **2026-07-01 — cozy-pivot Phases E + F shipped: the diegetic-signal + motivation finish. ALL
> PHASES A–I NOW DONE.** Both are render-layer passes reading the keystone (A) snapshot — no new
> sim mechanics, digest byte-identical.
> - **E (per-villager mood):** `VillagerSnapshot.mood` (read-only, sourced from the villager's HOME
>   house's per-house mood; default 40). Renderer layers a SUBTLE cue on top of the job tint (job stays
>   the primary read): `villagerAlphaForMood` dims a glum villager (`VILLAGER_MOOD_DIM_MAX=0.25`,
>   gentler than the house dim) + `villagerSlumpOffset` (`VILLAGER_SLUMP_PX=1.5`) — both on the house
>   mood curve's breakpoints. See [citadel-fx.ts](../../games/citadel/client/src/render/citadel-fx.ts) /
>   [citadel-renderer.ts](../../games/citadel/client/src/render/citadel-renderer.ts).
> - **F (motivation, decision #7 — no score/quests/HUD):** `RenderSnapshot.allHomesCovered` (pure read
>   over per-house `lacks*`) edge-triggers ONE gentle "Every home is prospering." toast on the false→true
>   rising edge (latched, seeded-silent on first snapshot). The coverage overlay's gaps now soft-pulse as
>   an invitation (`uncoveredHouseTiles` → main.ts, only while the overlay is up). **Review adjudication:**
>   `uncoveredHouseTiles` reads the sim's authoritative per-house `lacks*` (NOT recomputed market
>   geometry) so the pulse can't disagree with the stockpile-gated `lacksGoods` — pulse + banner stay in
>   lockstep (also killed a double `coverageByNeed`/frame). See [coverage.ts](../../games/citadel/client/src/render/coverage.ts).
>
> Gates: sim-core **224/224**, client **397/397**, typecheck-clean, determinism MATCH ×3, digest
> unmoved. **Playtested in a real WebGPU browser** ([phaseEF-playtest](../todos/closed/2026-07-01-citadel-phaseEF-playtest.md)):
> per-villager mood tracks home-house mood tick-for-tick; a town stays alive/fed/fire-recoverable 200+
> days. Two non-blocking follow-ups: **P1** cozy-path threat toast COPY still reads pressure-game
> ("caught fire!"/"starved") though the MECHANICS are cozy-correct (`cozyThreats:true` wired); **P2** the
> playtest driver can't read the in-canvas HUD or drive road-connected services, so F's banner-edge is
> verified-by-mechanism, not yet scripted-live (user accepted that bar).
>
> **2026-07-01 (follow-up) — P1 shipped, P2 split.** **P1 done:** cozy-path threat toast COPY now
> branches on the `cozy` flag — fire reads "a hearth is smouldering — a well nearby would settle it"
> (not "caught fire!"), disease "under the weather"/"back on its feet", a hungry departure "left to
> find food — the larder is bare" (not "starved (pop 0)"); `ImmigrationSystem` gained a `cozy` opt like
> Fire/Disease. The **sharp** wording is kept verbatim under `cozyThreats:false` (Challenge-mode guards
> still match); `cozy-threats.test.ts` pins the fire split both ways. Determinism: reproducible + **no
> numeric drift** vs baseline (only event copy differs). **P2 instrumentation done:**
> `window.__citadel.snapshot()` exposes the live snapshot and `play.mjs` reads game state from it +
> tracks the `allHomesCovered` edge — the banner is now assertable, not inferred. **P2 placement now
> DONE:** the plan is seed-aware — it reserves the seeded road spine (planning onto it severed the
> core's connectivity and starved the town to pop 0) and places chapel/market/watchpost via a
> coverage-aware ring placer that guarantees each lands within `SERVICE_RADII`=8 of the seeded house.
> A live run holds `allHomesCovered:true` for all 49/49 ticks with happy 91–99 (vs `covered:false` /
> happy ~35 before). Phase F is placement-verified live; only the sub-second `false→true` banner edge
> isn't harness-observable (coverage is reached during boot — a sampling race, not a defect; the edge
> is unit-tested in main.ts). The E/F playtest todo is now **done**. See
> [phaseEF-playtest todo](../todos/closed/2026-07-01-citadel-phaseEF-playtest.md).

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

