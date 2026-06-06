# Corpus Log

Append-only chronological record. Each entry starts with `## [YYYY-MM-DD] <kind> | <title>` so `grep '^## \[' log.md` produces a readable timeline.

## [2026-06-05] impl | Brief 44 — Living World: Working NPCs + Tavern (A+B + cheap C)

**Carpenter, blacksmith, tavern — the world now does something.**

- **Part A — carpenter commissions.** NEW `systems/carpenter.ts` + `protocols/commission.ts`. A `commission-build` ACT emits `ONT_COMMISSION.BUILD` to the carpenter NPC; the CarpenterSystem (order→fulfill twin of `ShopkeeperSystem.handleSell`) validates, escrows the wood up-front, builds over a 30-tick build-time, then DELIVERS the decoration on the farmer's farm + replies `COMMISSION_DONE`. Aggressive wired to commission (replaces its old instant `craft-decoration`).
- **Part A — blacksmith validates.** `act.ts handleUpgradeTool` now consumes ORE (wooden→stone = 2 stone; stone→iron = 2 iron ore) **plus** gold, enforces tier order, and rejects with NO mutation when materials are missing (was assume-success).
- **Part B — tavern.** NEW `systems/tavern.ts` + `structure/tavern` + `npc/barkeep` WorkNpc in the village hub (45,34–35). Gossip = a daily rumor line drawn deterministically from the event feed (highest drama, tie-break newest→key). Hiring = `hire-help` ACT (25g, village-gated, once/day) → +40 AP next morning (`Farmer.helperHiredDay`, applied in `perceive.ts`). Gathering = `deliberateTavernGather` (periodic every-12-day, AP-gated ≥40, staggered by id).
- **Part C (cheap).** Notice board already posts a daily demand line (the brief-20/bounty system) — verified + added `notice-board.test.ts`. Second-mill/well purpose left out of scope per the brief.
- **Tests:** +15 (carpenter, tavern/pickGossip, blacksmith-validate + hire in act.test, notice-board). 607 FV + 60 engine = 667. Typecheck clean; palette + atlas guards pass; atlas rebaked (+4 frames: barkeep idle/pour-a/pour-b, tavern).
- **Determinism re-baselined by design — MATCH ×3 (0xc0ffee/1/42).** Live (0xc0ffee, ticksPerDay 20, JsPathfinder): ≥1 real carpenter commission (Atticus), blacksmith upgrades consume materials (seed-dependent; unit-tested), 4 hires (Atticus), 8 tavern visits, 4 gossip lines.
- **Balance:** the leader-runaway PERSISTS (Atticus wins, Cora ~5694 #2). Hiring + tavern are AP/gold-gated luxuries that fire when a farmer is already flush, so they do NOT help trailing farmers catch up — flavor/sinks for the leader, not a balance lever. The populated-hub visual is carried by the barkeep WorkNpc; AI gathering is rare-by-design (the agent loop never leaves a farmer idle in the village).
- **Worktree gotcha (documented in probe-44.ts):** in a git worktree, the bare `farm-valley/*` import specifier resolves to the PARENT checkout's source (shared node_modules), so `npm run sim` + tsx probes run the WRONG code. The probe pins to the worktree via RELATIVE imports (`../../../packages/farm-valley/src/...`). `npm run test`/`typecheck` are fine (workspace `-w` reads local files).

## [2026-06-05] impl | Brief 42 — Livestock Pens + Orchards (Parts A+B)

**Parts A+B shipped; Part C (processing/maker chain) explicitly skipped.**

- **`Pen` + `OrchardTree` components** added to `GameEntity` in [components.ts](../packages/farm-valley/src/components.ts). `Inventory` extended with `products?` and `fruit?` optional maps using `CropQualityCounts`.
- **[`LivestockSystem`](../packages/farm-valley/src/systems/livestock.ts)**: DAY_START-gated (weather-station inbox snoop). Fed pens yield `count × baseYield` at seeded-RNG quality from care scalar (gold ≥0.82, silver ≥0.55). Unfed: no yield, faster decay (0.12 vs 0.05/day). Resets `fedToday` daily.
- **[`OrchardSystem`](../packages/farm-valley/src/systems/orchard.ts)**: DAY_START-gated. Immature trees accrue `daysGrown` (mature at 20). Mature trees drop `FRUIT_YIELD_PER_HARVEST=4` into `fruitReady` once per 25-day season block — perennial (block-index gate prevents same-season re-drop but allows the same-named season in year 2+).
- **Economy constants** ([economy.ts](../packages/farm-valley/src/economy.ts)): `PEN_BUILD_COST`, `ANIMAL_BUY_COST`, `PRODUCT_YIELD_PER_ANIMAL`, `PRODUCT_SELL_PRICE`, `CARE_DECAY_*`, `TREE_PLANT_COST`, `ORCHARD_MATURATION_DAYS=20`, `FRUIT_SEASON`, `FRUIT_SELL_PRICE`. Helper fns `bankProduct`/`bankFruit`/`totalProductCount`/`totalFruitCount`/`productInventoryValue`/`fruitInventoryValue`.
- **`ActSystem`** ([systems/act.ts](../packages/farm-valley/src/systems/act.ts)): 7 new handlers (`build-pen`, `buy-animal`, `tend`, `plant-tree`, `harvest-fruit`, `sell-product`, `sell-fruit`).
- **`PlotSenseSystem`** ([systems/plot-sense.ts](../packages/farm-valley/src/systems/plot-sense.ts)): surfaces pen/orchard beliefs per farmer (hasPen_coop/barn, coopFedToday/barnFedToday, penCount_*, orchardCount, orchardFruitReady).
- **Agent wiring** ([agents/watering.ts](../packages/farm-valley/src/agents/watering.ts)): 7 new `deliberate*` helpers. conservative = day10+ coop+chicken, day15+ apple orchard; hoarder = day8+ both pen types + day12+ both orchard kinds; aggressive = passive-only (tend/sell/harvest if already owns); opportunist = day12+ coop+cherry.
- **Leaderboard** (`leaderboard()` in [sim-bootstrap.ts](../packages/farm-valley/src/sim-bootstrap.ts)): `livestockValue` (products+fruit at sell price) + `assetValue` (pens by animal count × buy cost + mature orchards × expected fruit value) added to `totalValue`.
- **Atlas** ([tools/atlas-builder/src/recipes.ts](../tools/atlas-builder/src/recipes.ts)): 13 new pixel-art recipes across `characters` (`animal/chicken/cow/sheep`), `buildings` (`structure/coop`, `barn`, `fruit-tree-sapling/growing/mature`), `items-ui` (`product/egg/milk/wool`, `fruit/apple/cherry`). Atlas now **220 frames** across 6 sheets. Fixed cherry row-17→16 pixel error during bake.
- **Tests**: 10 new tests (livestock ×5, orchard ×5) in [systems/livestock.test.ts](../packages/farm-valley/src/systems/livestock.test.ts) and [systems/orchard.test.ts](../packages/farm-valley/src/systems/orchard.test.ts). **575 tests pass** (56 files). Typecheck clean. Determinism MATCH ×3 (seeds 0xc0ffee, 1, 42).
- **Season-block perennial fix**: `seasonForDay` uses 1-based days (d = day − 1); OrchardSystem gates on `Math.floor(max(0, day−1)/25)` block index instead of season name — prevents same-block re-drop while enabling each-cycle fruiting.

**ADDENDUM (post-merge correction).** The above describes the FIRST pass, which was correct + tested but **DORMANT live** — an instrumented run showed ZERO pens/orchards ever built (the build/invest intentions were wired only in a helper that never won against survival farming, and pens were gated on wood the AI never gathers). Per user direction ("send it back to wire agents"), a second pass made it **fire live**:
  - **Cost model:** pens are now **gold-funded with wood as an optional discount** (coop 45g, or 30g+8 wood; barn 75g, or 50g+12 wood); animals also buyable at the carpenter — so a coop + first birds happen in one trip and the AI can actually afford it (carpenter stays relevant).
  - **Committed-excursion deliberation** (conservative/hoarder/opportunist): on a quiet invest day (gold ≥ reserve+50, no plot about to wilt, AP ≥ 20) the patient farmer commits ONE excursion at a time with a *winning* travel priority (−2); travel helpers upgrade a shadowing travel instead of being deduped out. Pen placed on interior tiles (never trapping the farmer); orchard planted on the nearest free farm tile so it lands same-day. Aggressive still skips.
  - **Final counts: 577 tests** (not 575; +2 conservative deliberation tests). **Determinism MATCH ×3.**
  - **Live (seed 0xc0ffee, pathfinder on):** Cora builds a coop d31 → 3 chickens → 201 eggs; 2 orchards matured + fruited (apple d51). **Cora (conservative) OVERTAKES Atticus (aggressive) at d36 and wins 5883 vs 3105** — the project's first real lead crossing (2 leader-changes over the run: Hannah→Atticus d24→Cora d36). This **activates the previously-dormant spectator layer** (38 rank-flips, 39 crossing markers, 40 race-on, recap headline) and meaningfully dents the leader-runaway gap. ⚠️ The dormancy was only caught by instrumenting a run with `pathfinder: new JsPathfinder()` — WITHOUT a pathfinder, `bootstrapSim` omits TravelSystem and no travel-gated action ever fires (a probe pitfall: always pass the pathfinder when checking travel-dependent behavior). Related: [[project-leader-runaway]], [[project-peer-interaction-inert]].

## [2026-06-05] briefs | Gameplay / content / world-depth — 6 briefs queued (41–46)

Second design pass (after the 36–40 spectator/story layer): the user asked what would improve the *game itself* — gameplay, content, art/world, playstyles — and chose **bold scope** ("reshape the sim", accept a shifted determinism baseline) focused on **deeper content + progression** and **art style / world design / new areas & playstyles**.

A code-grounded read (two Explore passes over `systems/`, `agents/`, `economy.ts`, `world/`, `tools/atlas-builder/`) found the real weaknesses: the farming loop is thin (**3 crops**, no quality dimension); the *shop* pays a **fixed price** regardless of glut (no scarcity, farmers barely affect each other); progression is **uni-axial** (tools/decorations/plots/AP — all "more of the same"); the **18-zone world only uses ~6** (carpenter NPC is cosmetic, AI never crafts decorations, seasonal grove/ice-pond dead 75% of the run, wells/notice-board inert, the **four seasons never change the tiles**); and **everyone wins the same way** (highest `totalValue` scalar). The recipe atlas makes content cheap (+1 crop ≈ 3 sprites + 4 constants), so the leverage is in *systems + world life*, not pixels.

Queued in [briefs/game/todo/](briefs/game/todo/):
- **[41-crop-roster-and-quality-tiers](briefs/game/todo/41-crop-roster-and-quality-tiers.md)** — 4–6 season-locked crops + Normal/Silver/Gold quality earned from husbandry; quality-weighted sell price + net worth. **The spine; do first.**
- **[42-livestock-and-orchards](briefs/game/todo/42-livestock-and-orchards.md)** — counter-based coops/barns (daily products, care→quality) + perennial fruit orchards; a slow-burn parallel playstyle that differentiates personalities.
- **[43-greenhouse-and-farm-skill-progression](briefs/game/todo/43-greenhouse-and-farm-skill-progression.md)** — year-round greenhouse (off-season money sink) + per-farm skills that compound; surfaced in the observer + recap.
- **[44-living-world-working-npcs-and-tavern](briefs/game/todo/44-living-world-working-npcs-and-tavern.md)** — carpenter/blacksmith fulfill real orders; a tavern social hub (gossip/hiring/evening gathering); repurpose the dead notice board.
- **[45-seasonal-visual-identity-and-festivals](briefs/game/todo/45-seasonal-visual-identity-and-festivals.md)** — the art ask: season-variant ground tiles + rain/snow particle overlays (render-only) + scheduled festival days with harvest contests / special markets (sim, drama-scored).
- **[46-harbor-shipping-and-contracts](briefs/game/todo/46-harbor-shipping-and-contracts.md)** — a harbor + time-boxed contracts + reputation: a demand-driven new way to win, and a soft fix for the fixed-price-shop flatness without rewriting the shop.

Suggested order **41 → 42 → 43 → 44 → 45 → 46** (41's crops/quality feed 42/43/45/46; 44's NPC-fulfillment/notice-board feeds 46). **Unlike 36–40, these change agent deliberation + the economy** — every brief carries a `CHECK_DETERMINISM=1` + multi-seed `EXPORT=json` re-verify and a [status.md](wiki/status.md) baseline-update step (verify replay-MATCH, not equality to the old numbers). Deliberately *deferred* (user picked content over the head-on economy rework): supply-driven shop pricing + fully asymmetric per-personality win conditions — noted in [open-questions.md](wiki/open-questions.md). No wiki/status edits yet (work not done); open-questions updated with these code gaps.

## [2026-06-05] render | Coral autotiled into unified zones + fishing spot = 3 rising bubbles

Follow-up to the coral + fishing-spot work, per user feedback: (1) make coral read as **one bigger texture** per zone rather than independent per-tile stamps, and (2) make the fishing spot **3 bubbles that rise in a 3-frame animation**.

- **Coral is now an autotile set.** Replaced the three standalone `tile/coral-a/b/c` stamps with `tile/coral-fill` (full-bleed interior — solid muted-blue edges so neighbours seam together), `tile/coral-edge` (fades to water along the top edge), `tile/coral-corner` (fades a corner quadrant) in [recipes.ts](../tools/atlas-builder/src/recipes.ts). `computeCoral` ([render-systems.ts](../packages/farm-valley/src/render-systems.ts)) picks frame + rotation per cell from its 4 coral-neighbours (4→fill, one open side→edge, two adjacent open→corner), same rotation convention as `computeWalls`. It now grows **8 compact near-circular blobs** (10–17 tiles, nearest-to-seed frontier so they fill round with real interiors) instead of 14 stringy 3–5-tile clusters → ~100 tiles, ~⅓ solid fill, so each zone looks like a single reef. Still open-water-only, semi-transparent (`CORAL_ALPHA` ≈ 0.4), layer 2, render-only.
- **Fishing spot = 3 rising bubbles, 3-frame loop.** Replaced the static ring + separate `fishing-sparkle` overlay with a 3-frame cycle `structure/fishing-spot` (A) → `-b` → `-c`: three bubbles (pale `q`/`e`/`w` foam-white) climb to the surface and pop into foam crests, then restart from the seabed. Animated **in `resolveFrameAndBob`** by swapping the single layer-4 snapshot sprite's frame (~1.2 s A→B→C, per-tile phase) — no overlay/double-draw. `FISHING_SPOT_FRAMES` exported from [render-systems.ts](../packages/farm-valley/src/render-systems.ts); the old `FISHING_SPARKLE_FRAMES` export + the main.ts overlay block are gone. Wall-clock driven → no determinism impact (spot tiles still come from the seeded `BubbleSystem`).
- **Verify:** atlas bakes **178 frames** (`npm run atlas`); typecheck clean; palette guard passes; render-systems test updated (asserts `tile/coral-fill` + `tile/coral-edge` baked) — **433** farm-valley tests pass. Wiki: [player-and-interaction.md](wiki/player-and-interaction.md) → *Coral zones* + *Fishing*.

## [2026-06-05] render | Fishing spots — animated "sparkling water" sparkle overlay

Fishing spots (the drifting bubble entities from `BubbleSystem`) now visibly bubble/sparkle. Added three sparse rising-bubble overlay frames `structure/fishing-sparkle-a/b/c` to [recipes.ts](../../tools/atlas-builder/src/recipes.ts) (transparent base + `w`/`e` crests, EDG-palette swatches, rebuilt the atlas). The main-thread render loop in [main.ts](../../packages/farm-valley/src/main.ts) overlays one cycling frame (layer 5, ~1.5 s A→B→C, per-tile phase offset, 0.85 alpha) on every `structure/fishing-spot` snapshot sprite — same wall-clock (`nowMs`) pattern as the existing foam/forge animations, so it's purely cosmetic with no determinism impact. `FISHING_SPARKLE_FRAMES` exported from [render-systems.ts](../../packages/farm-valley/src/render-systems.ts). Verified in-browser (paused frames diff → animation runs); typecheck + render/palette tests green. Wiki: [player-and-interaction.md](wiki/player-and-interaction.md) bubble-spots bullet.

## [2026-06-05] briefs | Spectator/story layer — 5 briefs queued (36–40)

Researched what games like Farm Valley typically offer — two passes: the **farming-sim genre** (Stardew, Story of Seasons, Coral Island, My Time at Portia, Sun Haven) and, more relevantly, **spectator / story-generator sims** (RimWorld, Dwarf Fortress *Legends mode*, CK2/CK3 observer mode, Football Manager, Civ4 AI Survivor, autobattlers). Conclusion: Farm Valley is a *watched* sim, so the genre-content catalog (combat/marriage/hand-watering) mostly doesn't apply; the spectator-sim literature does. The through-line — **apophenia + legibility + stakes + pacing control** — maps onto five gaps relative to what's already built (named personalities, decision-trace, event feed, leaderboard, focus camera, speed/pause, seasons, mid-game shock, shareable seed). Direction chosen by user: **spectator/story layer**, output as **corpus briefs**.

Queued in [briefs/game/todo/](briefs/game/todo/):
- **[36-end-of-run-recap](briefs/game/todo/36-end-of-run-recap.md)** — Day-100 "Legends"-style wrap-up: standings + auto-generated per-farmer season arc + run headline + (with 37) rivalry outcomes. Adds a passive per-day `RunHistorySystem` rank/gold series; recap is pure synthesis over data we already capture. **Highest payoff; do first.**
- **[37-rivalries-and-relationship-legibility](briefs/game/todo/37-rivalries-and-relationship-legibility.md)** — surface the invisible `TrustSystem` matrix as a 4×4 opinion grid; accumulate adverse pairwise history into *named rivalries* (and alliances) that hit the feed + recap.
- **[38-drama-scoring-and-narrative-escalation](briefs/game/todo/38-drama-scoring-and-narrative-escalation.md)** — a pure `dramaScore(event, ctx)` (act-band/day-weighted), top-rank-change events, visual emphasis in the feed, a "the race is on" late-game line. Density tracks stakes, not wall-clock (FM26 dynamic-highlights lesson).
- **[39-wealth-over-time-graph](briefs/game/todo/39-wealth-over-time-graph.md)** — multi-line wealth-over-100-days chart (one line/farmer, crossings marked). Best sequenced after 36 (consumes its history series).
- **[40-thought-bubbles-and-highlight-skip](briefs/game/todo/40-thought-bubbles-and-highlight-skip.md)** — ambient current-intention bubbles over AI farmers (reuse the meet-indicator path) + a "skip to next highlight" worker control + click-feed-to-zoom. After 38 (uses drama scores).

Suggested order: **36 → 37 → 38 → 39 → 40** (39/40 consume 36/38). All are read-only/render-side or additive observation — none change agent deliberation or the determinism-load-bearing tick body. No wiki page edits yet (work not done); [open-questions.md](wiki/open-questions.md) updated with the new code gaps.

## [2026-06-05] impl | Coral zones in the open ocean (semi-transparent, deep-water)

Scattered decorative **coral zones** across the open-water ocean tiles so the sea between islands reads as a living seabed where fish shelter. Per follow-up feedback they were re-styled to look **deep underwater** — muted/low-detail and **semi-transparent**, not bright surface reefs. Purely visual — coral sits on non-walkable tiles and never affects movement (same posture as the bubble fishing-spots).

- **"Submerged" look = muted blue-shifted palette + low alpha.** Three low-detail recipes ([recipes.ts](../tools/atlas-builder/src/recipes.ts)) built from deep ocean (`V`), structure-blue (`S`/`s`), muted stone (`Q`), faint dark-leaf (`l`) kelp and one dull-gold (`o`) accent — no vivid reds/oranges — each with a wide water border so the patch bleeds into the sea: `tile/coral-a` (soft mound), `tile/coral-b` (sparse kelp), `tile/coral-c` (seabed rubble). Baked **semi-transparent** at `CORAL_ALPHA` ≈ 0.4 so the flowing water shows through and they look deep/murky. (Replaced the first pass, which read as opaque, vivid, surface-level reefs.) Atlas bakes **176 frames** (`npm run atlas`).
- **`computeCoral()` + bake ([render-systems.ts](../packages/farm-valley/src/render-systems.ts)):** picks **open-water** ocean candidates (non-walkable tile with NO walkable neighbour in its 8-ring, so zones stay clear of the shore foam / island walls), then grows **14 seeded clusters** of 3–5 tiles each via a tiny fixed-seed LCG (no `Math.random` → deterministic, stable layout). Baked into `iterStaticSprites` at **layer 2** (above the animated water + foam, below bridges=3 / shore / walls) at `CORAL_ALPHA`. Yields **57 coral tiles** across all three variants.
- **Render-only → sim/determinism untouched** (coral lives only in the static render layer, never in sim state). Tests: render-systems test asserts a coral frame is baked; typecheck clean; palette guard passes; **433** farm-valley tests pass. Wiki: [player-and-interaction.md](wiki/player-and-interaction.md) → *Coral zones*.

## [2026-06-05] impl | Big workshop buildings + solid prop collision (blacksmith/carpenter)

Added large **multi-tile buildings** to anchor the two craft islands and made all workshop decorations block movement (the "shouldn't be able to walk through decorations" ask), with a connectivity guard so nothing gets walled off.

- **First non-16×16 sprites.** `PixelRecipe` ([recipes.ts](../tools/atlas-builder/src/recipes.ts)) gained optional `width`/`height`; the [atlas-builder](../tools/atlas-builder/src/index.ts) packs/rasterizes by `recipeWidth/recipeHeight` and widens the atlas so the widest frame fits a shelf. Two **32×48** buildings: `structure/forge-house` (stone+timber smithy, brick chimney, slate roof, glowing forge window) and `structure/carpenter-workshop` (green-roofed timber lumber-mill). Plus 6 new 16×16 yard props (grindstone/coal-pile/ingot-rack, lumber-rack/sawpit/shavings-pile) and 3 chimney-smoke frames. Atlas now bakes **173 frames** (`npm run atlas`).
- **Buildings are static → baked.** `BIG_STRUCTURES` in [render-systems.ts](../packages/farm-valley/src/render-systems.ts) `iterStaticSprites` emits them on **layer 5**, bottom-anchored (center `y = ty*TILE + TILE − hPx/2`; drawSprite is center-anchored). Forge gets an animated chimney-smoke overlay in [main.ts](../packages/farm-valley/src/main.ts) (cycled like the forge fire).
- **Solid collision.** New `Solid` component ([components.ts](../packages/farm-valley/src/components.ts)); `placeProps` makes every prop solid by default and a new `placeFootprint()` blocks each building's tiles. [`FeatureCollisionSystem`](../packages/farm-valley/src/systems/feature-collision.ts) now blocks `solid` tiles too (alongside trees/stones), and `PlayerControlSystem.featureAt` checks `solid` — so both Pip and AI farmers path **around** props/buildings.
- **Connectivity is load-bearing.** Each craft island has a vertical through-road spine (blacksmith x60–61, carpentry x24–25) that bridges land on; blocking it severs the island (and forest-north + farm-cora route through carpentry). First placement broke 3 regions; fixed by moving the forge-house to the island's east half (x63–64) and the workshop to the west half (x21–22), keeping the spine + the mushroom-grove road landing (x20,y37–38) clear. Guarded by [solid-connectivity.test.ts](../packages/farm-valley/src/world/solid-connectivity.test.ts) (BFS from village over every region center / plot / NPC station; no solid on a craft bridge).
- **Verify:** typecheck clean; **487** tests pass (433 farm-valley + 54 engine); determinism MATCH (2× `check-determinism`); visually confirmed in Playwright (workshop + forge-house render bottom-anchored with their yards). Wiki: [player-and-interaction.md](wiki/player-and-interaction.md) → *Big workshop buildings* + *Feature collision*.

## [2026-06-05] impl | Hover tooltips now cover decorative props

Hover-to-show-name already covered farmers, NPCs/structures, trees, stones, and crops, but the `decoration/*` props (barrel, crate, potted-plant, lamp-post, signpost, hay-bale, bush, log-stack) showed nothing on hover — they're sprite-only entities with no identifying component, so the snapshot builder's component-presence label chain skipped them.

- **`DECORATION_LABELS` frame→{label,description} map + final `else` branch ([snapshot-builder.ts](../packages/farm-valley/src/worker/snapshot-builder.ts)):** props get a friendly name keyed off `sprite.frame`. A new prop just needs one map entry to become hover-able. No schema/spawn-time change, no new component.
- **Render-only.** Labels live only in the `RenderSnapshot`, never in sim state → determinism untouched, no headless re-verify. Typecheck + `worker`/`render-systems` tests pass (the full-suite 5s timeout on the 4-seed reproducibility test is pre-existing parallel-load flakiness — passes in 4.55s run in isolation).

## [2026-06-05] impl | Region-themed island edges (replaces edge fences)

The island edges used to render the wooden `tile/fence-h` band on their whole perimeter — in the archipelago every farm margin faces ocean, so `computeFences` drew a fence on all of it (the "weird fence texture on the island edge"). Replaced with a per-region edge band oriented per side: farms get a sandy beach, carpentry a wooden bulwark, blacksmith/quarries a stone wall.

- **Three edge recipes ([recipes.ts](../tools/atlas-builder/src/recipes.ts)), all top-edge-up + rotated 0/90/180/270 like `tile/shore`:** `tile/wall` (stone `q`/`Q` + `k` seam), `tile/wall-wood` (plank `d`/`D` + `k` seam), `tile/shore-sand` (full wet-sand + foam beach band). Atlas now bakes **161 frames** (`npm run atlas`).
- **`edgeFrame(region)` + `computeWalls()` ([render-systems.ts](../packages/farm-valley/src/render-systems.ts)):** `computeWalls` mirrors `computeShores` over **region** tiles only — for each side whose neighbour is non-walkable (ocean/off-grid), emit `edgeFrame(region)` at **layer 4** (above ocean/shore/dirt/bridges, below fences/entities). `edgeFrame`: `farm-*` & fishing isles → `tile/shore-sand`; `carpentry` → `tile/wall-wood`; everything else (blacksmith, quarries, village, …) → `tile/wall`. Region-only means road-only **bridge** mouths stay open (no edge seals a crossing).
- **`computeFences` narrowed:** now only fences a farm edge that abuts **another land region** (`regionAt(neighbour) !== null` — none in the current layout), so ocean-facing margins are edges, not fences.
- **Collision unchanged.** Pip/AI already can't step onto ocean (`PlayerControlSystem.canStand` → `isWalkable`); the player-control "can't walk onto ocean/void" test still passes. Render-only change → sim/determinism untouched, no headless re-verify needed.
- **Tests/verify:** render-systems test asserts all three edge materials baked + no `tile/fence-h`; typecheck clean; palette guard passes; **483** tests pass (429 farm-valley + 54 engine); verified visually (Playwright — farms with sandy beaches, stone islands with grey walls, bridges open, no fence texture). Wiki: [player-and-interaction.md](wiki/player-and-interaction.md) → *Island edges*.

## [2026-06-05] impl | Smoother travel: diagonal path-smoothing (sim) + eased interpolation (render)

Travel looked choppy because (a) both pathfinders are 4-connected so routes staircased, and (b) the render lerp was linear and could freeze at alpha=1 on a late snapshot. Fixed both, high-value/low-risk pair (no WASM change, no 8-connected pathfinding).

- **`smoothPath()` ([travel.ts](../packages/farm-valley/src/systems/travel.ts)).** Post-processes the 4-connected route into a diagonal-cutting one: a greedy string-pull (keep an anchor, extend to the farthest later node still in line of sight) collapses straight runs to corner anchors, then each anchor→anchor segment is re-rasterized (Bresenham, 8-connected) back into a **dense one-tile-per-step** sequence. Staying one-tile-per-step preserves `STEP_TICKS` pacing exactly. Line-of-sight is supercover-style and forbids corner-clipping past two blocked orthogonals, so a smoothed diagonal never crosses a blocked tile. Called once at path setup; pure integer transform, no rng → **determinism intact** (`CHECK_DETERMINISM=1` MATCH).
- **Render: smoothstep easing + interpolate-in-the-past ([sim-client.ts](../packages/farm-valley/src/worker/sim-client.ts)).** `getInterpolatedSprites` now eases the lerp `alpha` with smoothstep (3t²−2t³) so farmers ease out of / into each tile instead of constant-velocity snapping, and shifts the interpolation head back by one tick (`renderDelayMs = msPerTick`) so a slightly-late snapshot is absorbed by the margin instead of showing as a freeze-then-jump. Render-only, ~50 ms display latency (imperceptible for watch-only).
- **Note:** `resolveFacing` ([snapshot-builder.ts](../packages/farm-valley/src/worker/snapshot-builder.ts)) already handles diagonal deltas (vertical dominates ties), so the new diagonal steps need no facing changes.
- **Tests/verify:** 5 new `smoothPath` unit tests (diagonal-cut, adjacency, no blocked-tile step, determinism); typecheck clean; **478** tests pass (424 farm-valley + 54 engine); `CHECK_DETERMINISM=1 SEED=12345 MAX_DAYS=20` MATCH. The `[travel] no path` warnings in headless runs are pre-existing (predate this change).

## [2026-06-04] impl | Fishing isles (×2) + bubbles, stone carpentry floor, more decorations

Player-facing batch (no brief): added fishing as a destination activity, restyled the carpentry floor, and enriched world dressing. (Superseded an earlier same-day draft that put two fixed fishing spots at the village edge — reworked into a dedicated island per user feedback.)

- **Two fishing isles.** New 8×8 sand islands `fishing-isle` (`40–47 × 68–75`, bridge `42–43 × 64–67`, off the mill) and `fishing-isle-2` (`22–29 × 68–75`, bridge `24–25 × 64–67`, off forest-south) ([regions.ts](../packages/farm-valley/src/world/regions.ts)) in open ocean. New `tile/sand` backdrop (`backdropFrame` in [render-systems.ts](../packages/farm-valley/src/render-systems.ts)); a `FISHING_ISLE_IDS`/`isFishingIsle()` helper treats both uniformly. Walkable count **1849 → 1993**.
- **Fishing.** `fish` action ([ActSystem.handleFish](../packages/farm-valley/src/systems/act.ts)): 1 AP, **stand on the isle + cast into an adjacent ocean tile**, random **5–30 s** busy window, lands **minnow/bass/salmon worth 1/3/5 gold**. Rarity depends on the water: casting next to a **bubble** uses `FISH_WEIGHTS_BUBBLE` `{25/45/30}`, calm water uses `FISH_WEIGHTS_CALM` `{80/17/3}` ([components.ts](../packages/farm-valley/src/components.ts)). Banks gold immediately + tallies `inventory.fish`. One **rod, no durability** (`durability: Infinity`), in everyone's `STARTING_TOOLS`. `ActSystem` forks a `"fish"` rng → deterministic; `fish` excluded from `actionTicks`.
- **Bubbles drift daily.** New [BubbleSystem](../packages/farm-valley/src/systems/bubbles.ts) (after `TileFeatureSystem`, day-triggered, forked `"bubbles"` rng) clears + re-rolls `BUBBLE_COUNT`=5 bubble spots on the ocean ring around **each** isle every day. Each is a `fishingSpot: FishingSpotTag` + `structure/fishing-spot` sprite on non-walkable ocean (no movement block).
- **AI farmers fish.** [`deliberateFishing`](../packages/farm-valley/src/agents/watering.ts) sends opportunist (every 5 days, 3 casts) + aggressive (every 7 days, 2 casts) to the **nearest** isle edge (`(40,71)`/`(22,71)`), low-priority + AP-gated (≥30). **Changes the AI economy → determinism baseline shifted**; re-verified MATCH across seeds `0xc0ffee/1/42` over 100 days.
- **Hotbar grew 7→8 slots:** rod at index 4 (`🎣`), seeds shifted to 5/6/7; the rod slot emits `fish` only when Pip stands on the isle facing ocean. `player-control.test.ts` `SLOT` map + 3 fishing tests.
- **Carpentry floor → stone** (`tile/carpentry-floor`, offset-brick slabs) replacing `tile/wood-plank`.
- **More decorations.** New `decoration/{barrel,crate,potted-plant,lamp-post,signpost,hay-bale,bush,log-stack}` + `fish/{minnow,bass,salmon}` + `tool/fishing-rod` + `tile/sand` in [recipes.ts](../tools/atlas-builder/src/recipes.ts) (EDG32, 16×16; atlas **158 frames**). Visual-only `placeProps` batch across village/craft/resource/mill yards.
- **Tests/verify:** typecheck clean; **419** farm-valley + 47 engine tests pass; `npm run build` clean.
- Wiki: rewrote the Fishing section + added "Floor tiles & world dressing" in [wiki/player-and-interaction.md](wiki/player-and-interaction.md).

## [2026-06-04] impl | World rebuilt as an archipelago (88×80, island-per-zone)

Replaced the abutting-regions map with a true **archipelago**: every zone is its own island ringed by ocean, connected **only** by 2-tile-wide bridges (no land touching between islands). Per request: **Pip's farm moved to the top**, the **four AI farms pushed to the four corners** to encourage travel, **village kept as the central hub** all bridges radiate from. Map grew **52×40 → 88×80**.

- **[world/regions.ts](../packages/farm-valley/src/world/regions.ts)** is the whole change: new `WORLD_WIDTH/HEIGHT`, a 17-island bounds table (Pip top, farms in corners, village center, craft islands flanking, resources/mill/wells/seasonal filling the rest), and a `ROADS` array that is now 16 water-spanning bridges forming a tree rooted at the village. `EAST_SHIFT` and the stale ASCII map deleted. `TOWN_SQUARE`/`AUCTION_PODIUM_TILE`/`NOTICE_BOARD_TILE` recomputed into the new village bounds.
- **Coordinated coordinate moves:** `BLACKSMITH_TILE`/`MARKET_WALL_TILE`/`SHOPKEEPER_TILE` + forge & carpentry props/NPC stations ([region-setup.ts](../packages/farm-valley/src/world/region-setup.ts)) and `FORGE_OVEN_TILE` ([render-systems.ts](../packages/farm-valley/src/render-systems.ts)) re-anchored inside the new island bounds. Both `PERSONALITY_TO_REGION` maps unchanged (IDs stable).
- **Renderer untouched structurally** — `backdropFrame`/`computeShores`/`computeBridges`/`computeFences`/`OCEAN_TILES` derive everything from `regionAt`/`isWalkable`, so the islands, shores and bridges fall out for free. No more plain `tile/path` (every road is a bridge).
- **Tests:** `regions.test.ts`, `walkable-grid.test.ts` (`EXPECTED_WALKABLE` 1447→**1849**, BFS start → new village center 43,39), `new-mechanics.test.ts` (Cora fountain 15,1→3,3; well-north 49,11→69,6) and `render-systems.test.ts` (dropped the `tile/path` assertion, added `tile/ocean`+`tile/bridge-h`) updated. `npm run typecheck`, all 416 farm-valley + 47 engine tests, and `check-determinism` all pass. Verified no island is stranded (BFS reachability guard) and JS-pathfinder routes corner→village (pathLen 51–58).
- Wiki: rewrote the "World widening 40→52" section of [wiki/player-and-interaction.md](wiki/player-and-interaction.md) into "Archipelago layout (88×80)".

## [2026-06-04] doc | Pip + interaction systems folded into the wiki

Promoted the post-brief-35 work — previously captured only in session/agent memory — into the corpus.

- **New page [wiki/player-and-interaction.md](wiki/player-and-interaction.md)**: the keyboard-controlled 5th farmer **Pip** (real farmer entity, input-driven intentions, `PlayerControlSystem`, not AP-gated, authoritative facing), the slot-based **hotbar** (`HOTBAR_SLOTS`), **hover tooltips** (name + description for all labeled objects), **feature collision** (`FeatureCollisionSystem` blocks tree/stone tiles on the shared pathfinder grid), styled **bridges** (`computeBridges` / `tile/bridge-h`), the **craft-NPC idle pose** fix (blacksmith no longer "becomes the building" at the oven), **plot layout** (`PLOT_OFFSETS`), and the **40→52 world widening** with the dual-`PERSONALITY_TO_REGION` gotcha.
- Added a *Shipped 2026-06-04* section to [wiki/status.md](wiki/status.md) and refreshed its header (all briefs done; Pip shipped brief-less).
- Linked the new page from [index.md](index.md).
- All claims were grepped against current code before writing (`WORLD_WIDTH=52`, dual `PERSONALITY_TO_REGION`, `HOTBAR_SLOTS`, `FeatureCollisionSystem`, `computeBridges`, `idlePose` all confirmed). No code changed — documentation only.

## [2026-06-04] impl | EDG32 palette enforced project-wide

Locked the project to the **Endesga-32 (EDG32)** palette and made it enforceable. The atlas `SWATCH` (drawn sprites/tiles) was already 100% EDG32; the leak was in the HTML/canvas UI layer (panels, leaderboard, world-clock, home-screen, observer, debug overlay, particles, day/night anchors), which used ~41 off-palette literals.

- **New single source of truth:** `packages/engine/src/render/palette.ts` — `EDG32` (32 hex), `EDG` (named constants), `EDG32_SET`, `isEdg32`/`nearestEdg32`/`rgbOf`. Re-exported from `@engine/core/render`.
- **Migration:** every off-palette `#rgb`/`#rrggbb` and `rgba()` literal across `packages/` + `tools/` replaced with `EDG.*` (role-curated mapping, not blind nearest-RGB). Day/night season anchors and the dirt/coin/leaf particle colors now lerp between EDG32 anchors. Engine `clearColor` default + canvas shadow + ground-noise multiply/screen operands snapped to `EDG.black`/`EDG.white`.
- **Enforcement:** `packages/engine/src/render/palette.test.ts` scans all source for off-palette hex literals (fails CI), asserts the atlas SWATCH tuples ⊆ EDG32, and `EDG` ⊆ EDG32. Allowlist mechanism for legitimate exceptions (currently empty).
- Decision recorded in [wiki/decisions.md](wiki/decisions.md) → "Art / Palette". Typecheck + full suite green (447 tests), atlas + dist rebuilt clean.

## [2026-06-03] impl | Briefs 32–35 + engine/08 — rendering overhaul, world expansion, WASM expansion, agent activity; pathfinder worker bug fixed

Full visual + world + agent-activity pass. All verified live (Playwright + build clean).

**Critical bug fixed (engine/08):** The WASM pathfinder was loaded in the main render thread but never transferred to the sim worker. `TravelSystem` requires it and was silently skipped — farmers have never actually walked since the Worker migration. Fixed by fetching `/wasm/pathfinding.wasm` in `SimClient.init()`, transferring the `ArrayBuffer` (zero-copy) with the init message, and instantiating `Pathfinder` inside the worker.

**Brief 32 — rendering overhaul:** Y-sort depth ordering replaces flat render queue; drop shadows via `multiply` blend; `ParticleSystem` (coin burst / dirt puff / leaf floats); 54-frame pixel-art atlas redesign; walk/work/idle-bob animations; `action` field on `SnapshotSprite`. Earlier ySquash/depth-scale attempt reverted (genre uses pure orthographic).

**Brief 33 — world expansion:** 11 walkable regions (was 5). Blacksmith (SE, tool upgrades), carpentry (NW, decorations), 4 dedicated resource zones (forest-north/south for trees, quarry-north/south for stones). Tool system: hoe/axe/pickaxe × wooden/stone/iron with durability + upgrade path. Watering can (10 charges, refills at farm fountain). Resource drops (wood/stone/iron-ore/geode). Farm decorations (+10–30% yield, capped +75%). Plot decay 5 days. Home entity per farm. 8 new shared deliberation helpers in `agents/watering.ts`. 1257 walkable tiles.

**Engine brief 08 — WASM expansion:** Three new AssemblyScript modules: `noise.wasm` (value-noise fill, ~8× faster than JS path, wired into ground bake), `rng.wasm` (Mulberry32 batch), `floodfill.wasm` (BFS reachable tiles). All exported from `@engine/core`.

**Brief 35 — player activity:** Slower movement (STEP_TICKS 5→8). `busyUntilTick` — physical actions take 1–3 real seconds based on tool tier. Home/sleep routine — all farmers travel home at evening. Periodic market visit every 3 days. Early village visit day 0–1. Debug player (WASD + P toggle, checks `isWalkable`).

**Brief 31 (corpus sync)** resolved by this update — moved to done.

Corpus: 4 new briefs in `done/`; updated `status.md`, `architecture.md`, `index.md`, `log.md`; moved brief 31 `todo/`→`done/`.

## [2026-06-03] impl | Briefs 24–30 implemented + merged to main; corpus synced

All 7 implementation briefs from the grilling session shipped — built inline one at a time (opus), each tested + verified live with Playwright + headless probes, committed individually, then merged to `main` (`--no-ff`, "Merge briefs 24-30"). Brief 31 is this corpus sync.

**Final state:** 489 tests pass (398 farm-valley + 91 engine); typecheck clean across all workspaces; determinism MATCHes across seeds 0xc0ffee/1/42 at the live `ticksPerDay=1200`.

Per brief (commit → result):
- **24** auction bidding + golden bean — agents bid (per-personality valuation, Vickrey tie-break hardened), bean resells ×3 / gifts for +0.20 trust. Auction duration scaled (×1.5/day) so day-gated agents get a cycle to bid. Live: 20/20 auctions win, 0 no-winner.
- **25** panel overlap — observer + activity feed in a shared fixed right-column flex container.
- **30** ground texture — per-tile value-noise baked into the static layer (engine `bakeStaticLayer(...,decorate?)` hook); seed-deterministic.
- **27** long days — `ticksPerDay` default 20→**1200** (not 6000; that's the documented run-hash-selectable target). Intra-day phases (`PHASE_START`) drive the FSM, new `SLEEP` state, AP refill on morning wake. Final gold IDENTICAL at 20 vs 1200 — macro-economy stayed day-denominated.
- **28** AP economy — `maxApForDay=100+2·day`, sleep-gated (½ unrested), free travel, tiered friend discount, new cost table; fixed `sell-from-wall` cost-0 bug.
- **29** irrigation & crop death — `daysSinceWater` + 2-day grace, rain auto-waters, `CROP_DEATH` event; survival-reflex watering (new `PlotSenseSystem` + `agents/watering.ts`). Agents keep crops alive → ~0 deaths in practice (death unit-tested).
- **26** day/night grading — tick-synced sun curve + seasonal palette wash via engine `endFrame(wash?)`; render-only, sim untouched.

**Two latent bugs fixed in passing:** `EncounterTradeSystem` was never registered after the Worker migration (peer trades + bean gifts were dead live) — now wired in; and `sell-from-wall` silently cost 0 AP.

**Deltas from the specs:** day = 1 min not 5 (watchability/CI; 6000 documented); the warned-of "intra-day rebalancing" did NOT happen (day stayed the economic unit, survival reflexes keep agents productive); crop death rarely fires in normal play (reflex is effective).

Corpus: moved briefs 24–30 `todo/`→`done/`; updated status.md (Now-in-todo → Shipped 2026-06-03 with as-shipped notes + deltas; brief-21 row marked resolved-by-24), open-questions.md (auction gap + the redesign questions → Resolved), index.md (24–30 under a "Shipped" subsection, only 31 left in todo). Not pushed to origin.

## [2026-06-03] briefs | Grilling session — 8 new todo briefs (24–31); auctions found dead-on-field, day/night idea expanded into a long-day gameplay redesign

Reviewed project status, ran the app under Playwright (full 100-day run, seed `0xc0ffee`), researched whether [The Book of Shaders](https://thebookofshaders.com/) fits, then stress-tested 5 improvement ideas via a grilling pass. The 5 grew to 8 briefs as one idea unfolded.

**Playwright findings (live, not in any doc):**
- **Auctions are dead on the field.** 21 of ~22 Activity-feed entries over 100 days read "Auction closed with no winner." Root cause traced: brief 21's auction machinery is correct + tested, but **no agent ever emits an `auction-bid` intention** — the `golden_bean` prize has zero in-sim value. → brief 24. (status.md brief-21 row annotated "Done (machinery) / dead on the field".)
- **Top-right panel overlap.** Observer and event-feed both anchor `top:0; right:0`; the higher-z observer covers the feed. → brief 25.
- **Visual flatness.** Solid-color tiles, no atmosphere, no sense of time across 100 days. → briefs 26 + 30.

**Book of Shaders verdict:** targets GPU GLSL/WebGL and is "all rights reserved"; project is locked to Canvas2D. The *code/tooling does not fit; the math does.* Briefs 26 (color-mix / day-night curve) and 30 (value noise) reimplement its algorithms in JS — no GLSL, no copied code, no Canvas2D revisit.

**The cascade:** "day/night color grading" (cosmetic) → user wanted real Stardew-style long days → wanted agents to live through them (sleep at night, AP penalty) → an AP rework → watering with crop death. A background impact-analysis workflow (5 parallel subsystem probes + synthesis) found the gating blocker: **the agent FSM only advances on `DAY_START`, so "one decision/day" and "all per-day balance rules" are the same invariant** — changing `ticksPerDay` alone does nothing but slow the sim. That split the one idea into **3a/3b/3c/3d**:
- **24** — auction bidding + golden bean (rare/high-resale/giftable; per-personality bids; Vickrey tie-break hardened; `OFFER_BEAN` gift → trust).
- **25** — panel overlap fix (shared right-column flex container).
- **26 (3a)** — render-side day/night + seasonal color wash, tick-synced, season modulates palette + daylight length. Ships with 27 (strobes at the current 1-sec day).
- **27 (3b)** — 1 day = 5 min (ticksPerDay 20→6000); phased intra-day timeline with live re-deliberation + sleep penalty; **macro-economy stays day-denominated** (the one deliberate exception is watering, brief 29).
- **28 (3c)** — AP max 100 (+2/day), sleep-gated (half if unrested), free travel (time-throttled), tiered friend discounts, full cost table + `sell-from-wall` cost-0 bug fix.
- **29 (3d)** — watering required; grace-windowed dryness (`daysSinceWater`); rain auto-waters; crops die after 2 dry days; survival-reflex watering per personality.
- **30** — subtle per-tile value-noise on the baked static layer.
- **31** — this corpus sync.

**Dependency chain:** 24 & 25 independent (ship first) · 26 ships with 27 · 27 → 28 → 29 (strict) · 30 & 31 independent. **27–29 are a real gameplay redesign** — briefs 01–23 were built against one-decision-per-day; expect rebalancing.

**Determinism/save notes captured in the briefs:** old shared run URLs survive the `ticksPerDay` default change (it's field 3 of the run hash; hash value preferred over default); any new sim-affecting intra-day param must version the run descriptor with backward-compatible parsing.

Corpus sync (brief 31): fixed `index.md` — briefs 06 + 16–22 were stale-listed under "todo" headers (and linked to `todo/` paths) though they shipped to `done/`; moved them to the done listings and registered 24–31 under todo. Updated status.md, open-questions.md. No source changed.

## [2026-05-29] impl | Final brief swarm — all 8 remaining todos shipped, `todo/` now empty

Cleared every remaining brief in one orchestrated swarm. Each brief was implemented by an isolated worktree subagent on its own `feat/<NN>-<slug>` branch, then rebased onto current `main` and merged (`--no-ff`) by the orchestrator. Briefs grouped into waves by file-overlap to avoid `main.ts`/observer/snapshot conflicts (user chose "grouped batches").

- **Wave 1 (parallel, disjoint files):** `21-complete-auctions` (English+FPSB), `06-determinism-harness` (run-sim CHECK_DETERMINISM + EXPORT modes + sim-bootstrap.test.ts guard), `22-seasons-weather-arcs` (4×25-day seasons biasing the weather draw + observer header).
- **Wave 2 (serialized, shared `main.ts`/observer/worker-snapshot):** `19-decision-trace` (focused-farmer "why"), `18-seed-picker` (home-screen seed + Randomize), `17-save-replay` (run-descriptor URL share/load), `16-playback-controls` (pause/speed/step as worker control messages), `20-event-feed` (read-only snoop → snapshot → panel).

**Worktree-base gotcha:** the harness created worktrees from a *stale* commit (`4402790`, pre-Web-Worker move) rather than current `main`. Wave-1 agents implemented against the old layout — auctions/determinism rebased cleanly, but `22-seasons` had put its observer plumbing in the old inline `main.ts` `buildObserverSnapshot`, which the worker move had relocated to `worker/snapshot-builder.ts`. Orchestrator resolved the rebase: took `main`'s worker-based `main.ts`, re-applied the `season` field in `worker/snapshot-builder.ts`. The `06` rebase also restored the shock narrator that the agent's pre-shock base had dropped from run-sim's default mode. Wave-2 agents were told to `git rebase main` first and did so cleanly.

**Determinism:** verified MATCH across seeds 0xc0ffee/1/42 over the full 100-day run after all merges. Playback/seasons/auctions/trace all deterministic (tick-count-driven, no wall-clock/random in sim).

Final: **446 tests pass** (355 farm-valley + 91 engine), typecheck clean across farm-valley/engine/run-sim. All 8 briefs moved `todo/` → `done/`.

## [2026-05-29] impl | Open-questions round — 5 fixes landed on feature/open-questions-round

Went through every open question with the user and implemented their choices, one commit per item on branch `feature/open-questions-round` (not yet merged/PR'd):

1. **act.ts buy-seed → bus** (`2233a15`). Removed the direct slate-mutation shortcut; `buy-seed` now emits `ONT_SHOP.SELL`, handled by `ShopkeeperSystem.handleSell`. Accepted determinism shift (seed lands ~1 tick later). User chose full bus routing over a sync shared-helper refactor.
2. **Pathfinder verify + docs** (`1793ac6`). Audit found it was already load-bearing (not idle, as the stale docs claimed). Added a game-grid around-obstacle test; corrected architecture.md. Brief engine/05 → done.
3. **Cached static backdrop** (`a8e0c0b`). `Canvas2dRenderer.bakeStaticLayer` bakes tiles+fences+plot-dirt once; dynamic sprites stay per-frame. User opted to build it now rather than wait on the profile gate. Brief engine/07 → done.
4. **Mid-game shock** (`7699993`). Direction B of brief 23: a deterministic one-time blight on the run midpoint, targeting a crop-holding farmer so it always lands. Brief game/23 → done. Standings shifted (Atticus 2298→2018 at the default seed) — expected.
5. **Sim → Web Worker** (`2ed2a4d`). Sim runs in a Worker posting RenderSnapshots; main thread interpolates + renders. postMessage only (no SAB). Determinism verified (`npm run sim` byte-identical) and browser-verified (focus camera, halo, panels, no errors). Implemented by a sonnet subagent against an opus-authored snapshot schema; opus verified.

Brief game/19 (BDI "why" trace) was kept as a todo (user chose lightweight-as-briefed, deferred implementation). Final: 379 tests pass (288 farm-valley + 91 engine), typecheck clean.

Also folded in earlier same-day housekeeping that hadn't been committed: the 11 improvement briefs (game 16–23, engine 05–07), the world-preview rewrite to the real 40×40 world, and the stale-trust-comment cleanup.

## [2026-05-29] brief | 11 improvement TODOs drafted (game 16–23, engine 05–07)

Engine/game review surfaced gaps between stated capability and shipped experience; drafted 11 task briefs to track them. None implemented yet — all in `todo/`.

**Game (`briefs/game/todo/`):**
- **16-playback-controls** — pause / speed (1×/2×/4×) / step. Highest experience-per-effort: it's a watch-only game with no time control today. Presentation-only; must stay byte-identical to an uninterrupted run for the same seed.
- **17-save-replay** — ship the save/replay model the architecture already promises ("seed + event-sourced input log"). `InputLog` is currently instantiated and discarded (`void inputLog;` in main.ts). Adds a shareable run URL.
- **18-seed-picker** — choose/randomize the seed on the home screen (it's hardcoded `0xc0ffee`). Pairs with 17.
- **19-decision-trace** — the deferred BDI "why". Brief 11's focus mode (the stated trigger to revisit) shipped, so this is now actionable. Lightweight intention+reason, not a full log.
- **20-event-feed** — activity ticker narrating trades / auctions / weather by snooping the bus read-only (TrustSystem/MeetIndicator precedent). Highest narrative payoff.
- **21-complete-auctions** — implement English + FPSB. Today they're stubs in auction.ts that route through a Vickrey shell and always return null winners; Vickrey + Dutch work.
- **22-seasons-weather-arcs** — season cycle biasing weather/yields, giving the 100-day run a shape. Depth brief.
- **23-fifth-personality-or-shock** — variance injector, **design-gated** (preserves "no balance work, moments matter"). Pick a 5th personality or a mid-game shock at activation.

**Engine (`briefs/engine/todo/`):**
- **05-pathfinder-into-movement** — make the WASM pathfinder load-bearing in travel, or document straight-line and remove dead plumbing. Closes the "loaded but unused" gap.
- **06-determinism-harness-and-analytics** — enforce the determinism guarantee in CI (run-twice-and-diff) + per-day CSV/JSON export from run-sim. Protects the foundation 17/18/20 depend on.
- **07-chunked-tile-layer** — cached/chunked backdrop render pass, **profile-gated**: the brief's first step is measuring whether the per-tile backdrop is actually hot before any code. Canvas2D stays locked (no WebGPU revival).

Corpus updates: cataloged all 11 in [index.md](index.md); restructured [wiki/open-questions.md](wiki/open-questions.md) so the tilemap / decision-trace / fifth-personality / pathfinder questions now point at their briefs, and re-surfaced the `act.ts` buy-seed bypass as a still-untracked code gap.

## [2026-05-29] fix | typecheck unblocked + world-preview rewritten to the real world

Edge-tooling cleanup after an engine review. `npm run typecheck` was red across the monorepo: `tools/world-preview` imported the deleted `farm-valley/src/decorate`. Rewrote [tools/world-preview/src/index.ts](../../tools/world-preview/src/index.ts) to render the real 40×40 region world — reads layout from the shared `world/regions.ts` (single source of truth), boots the actual sim via `bootstrapSim`, and mirrors `render-systems.ts` backdrop/fence/plot/sprite logic (it had been rendering a stale hardcoded 20×12 layout). Also removed two stale `// TODO: real trust updates land in a future ticket` comments in hoarder.ts / opportunist.ts (trust landed in Brief 10) and gitignored the generated `world-preview.png`. Typecheck green; 355 tests still pass.

## [2026-05-26] impl | Briefs 11–15 landed: viewer upgrade + visual polish

Five briefs spec'd from the design interview ("watch BDI with tension via moments") landed via 5 parallel sonnet subagents in 5 worktrees. Locked decisions from the interview: focus camera + free pan; visual emphasis + current/next intention; moments-driven tension with ambient leaderboard; smallest first slice = viewer upgrade. The user said "all of them, separated todo" and 5 worktrees were spun up at once.

- **11-focus-camera**: Click an observer row to follow that farmer (gold halo, gold row outline, Reset View button). Free pan (mouse drag) + scroll-wheel zoom (0.5×–3×). `Camera2D` gained `setCenter` / `setZoom` setters (the only engine change in this round).
- **12-live-leaderboard**: New `LeaderboardPanel` (bottom-left) updates each render frame using the existing `leaderboard(world)` from `sim-bootstrap.ts`.
- **13-walking-animation**: 8 new atlas recipes (4 personalities × walk-a / walk-b) and a `pickFarmerFrame(entity, tick)` helper. Two-tick phase flip while `farmer.path` is set; reverts to idle on arrival.
- **14-meet-indicator**: New `MeetIndicatorSystem` (snoops farmer inboxes, not the bus, because `EncounterSystem` writes directly to inboxes). New `indicator/meet` speech-bubble atlas frame. `iterateMeetIndicators` generator in render-systems.ts renders the bubble above each active farmer for 10 ticks.
- **15-slate-billboard**: New `SlateBillboardPanel` (bottom-right) reads `shopkeeper.dailySlate` each frame, shows `[crop] [price]g · [remaining]/[total] left` rows.

Merge story: serialized merges to main. 15 + 12 conflicted on `main.ts` (panel instantiation lines) and `ui/index.ts` (re-exports) — both trivial additive. 14 auto-merged. 13 conflicted on `render-systems.ts` (sprite loop signature), `main.ts` (buildCanvasFrame call), and binary atlas artifacts (resolved by re-running `npm run atlas`). 11 conflicted on the same `render-systems.ts` + `main.ts` lines; final `buildCanvasFrame` signature became `(renderer, world, alpha, tick, meetIndicators, focusedFarmerId)`. 264/264 farm-valley tests pass on main.

Live verification via Playwright: focus camera works (clicking Hannah shifts the camera south, her row gets the gold outline), MEET indicator visible as a white "!" bubble over co-located farmers, leaderboard updates throughout the run (Hannah was #1 at day 3 with 111g, Atticus the eventual day-100 winner at 2086g), slate billboard renders live and `radish 16/17 left` confirms `act.ts` is genuinely consuming from the slate (Brief 08's path through `act.ts` is now exercised in-game, not just in tests).

Screenshot: [media/farm-valley-polish.png](../../media/farm-valley-polish.png).

## [2026-05-26] impl | Follow-up gaps closed (slate-in-act, cnp-registry, responder-trust)

Three short cleanup briefs landed via three parallel sonnet subagents (no opus planner — orchestrator-planned, sonnet-executed). Worktrees: `feature/slate-in-act`, `feature/cnp-registry`, `feature/responder-trust`. All three merged to main; 238/238 farm-valley tests pass.

- `slate-in-act` (commit `bac5499`): ActSystem.buy-seed now consumes from `shopkeeper.dailySlate` via a shared `consumeFromSlate(slate, crop, qty, { dryRun? })` helper in `agents/shop-slate.ts`. `ShopkeeperSystem.handleSell` refactored to use the same helper. The hardcoded `SEED_COST` table in `act.ts` is gone. Slate's stock + price variance are now load-bearing in the running game.
- `cnp-registry` (commit `7e8da0a`): Extracted the per-farmer `CnpCoordinator` map from `hoarder.ts` into a new `agents/cnp-registry.ts` module with `getOrCreateCoordinator` + `listCoordinators`. `sim-bootstrap.ts` passes `listCoordinators()` to `TrustSystem`, so broken-commitment trust deltas now fire in running games (previously `cnpCoordinators: undefined`).
- `responder-trust` (commit `2d606f8`): When `EncounterTradeSystem.handleOffer` returns `decision: "accept"`, the acceptor applies `+0.05` trust toward the sender directly via the exported `applyTrustDelta`. The trust matrix is fully live.

Verified end-to-end in Playwright: dev server boots, 4 farms + village render, farmers travel and the Region column flips between `home` / `village` / `traveling`, day 100 leaderboard fires with Atticus's end-of-sim liquidation reflected (`Region: traveling`, `unsold: 0`). Screenshot saved at `media/farm-valley-final.png`.

Tracked PNGs moved from repo root to `media/` (README updated).

## [2026-05-26] reorg | Adopt LLM Wiki pattern

Reorganized the corpus from a flat `engine/todo/` + `game/todo/` layout into the three-layer wiki pattern:
- `briefs/` for raw historical task specs (was `engine/` and `game/`)
- `wiki/` for LLM-curated synthesis pages
- `CLAUDE.md` schema, `index.md` catalog, this `log.md`

Added: [wiki/overview.md](wiki/overview.md), [wiki/architecture.md](wiki/architecture.md), [wiki/decisions.md](wiki/decisions.md), [wiki/open-questions.md](wiki/open-questions.md). Migrated `STATUS.md` → [wiki/status.md](wiki/status.md) and split its "Open gaps" section into [wiki/open-questions.md](wiki/open-questions.md).

## [2026-05-26] impl | Briefs 08 + 09 + 10 landed in parallel worktrees

Three feature branches (`feature/shop-slate-sales`, `feature/peer-meet-trades`, `feature/trust-and-endgame`) dispatched as parallel background opus subagents per the new opus-plans-then-sonnet-executes pattern. Two of the three opus subagents discovered the nested-Agent-tool wasn't loaded in their sandbox and inlined their implementations; one (Brief 10) got blocked partway when the classifier flagged the policy-divergence. I (orchestrator) took over the verify/finish step for 09 and 10, ran typecheck + tests, then merged all three to main.

218/218 farm-valley tests pass on main after all three merges. Auto-merge resolved the overlap in `aggressive.ts` between briefs 09 (peer-trade respond hook) and 10 (end-game liquidation) — different sections of the file, no conflict markers needed.

Closed gaps that were in [open-questions.md](wiki/open-questions.md):
- Shop slate is consumed by trades (brief 08).
- MEET messages drive real gameplay via peer seed trades (brief 09).
- Trust scores update on encounter and CNP outcomes (brief 10).
- Aggressive liquidates in the last 2 days (brief 10).

New / surfaced gaps:
- `act.ts` has a direct-mutation `buy-seed` path that bypasses `ShopkeeperSystem.SELL`, so brief 08's slate-driven path is currently only exercised by tests. Follow-up: route `buy-seed` through the bus.
- The CNP coordinator registry lives inside `hoarder.ts` as a private const; TrustSystem accepts `cnpCoordinators: undefined` at construction today. A small refactor exposing the registry will activate broken-commitment trust deltas in the running game.

Process note: the nested-Agent-tool issue is real and recurring — the saved subagent workflow ("opus plans → sonnet executes") only works if the subagent dispatch tool is loaded in the planner's environment. Two paths forward: (a) preload `Agent` in subagent prompts, or (b) accept opus inlining as the fallback. Today's run used (b) successfully for 08 and 09.

## [2026-05-26] impl | Brief 07 landed — renderer caught up to the new world

Brief 07 implemented on `feature/render-regions` by a single senior (opus) subagent. Game now renders the 40×40 tile world: grass for farms, dirt for the village, path tiles for roads, fence perimeters around each farm. All `Transform.{x,y}` are now in tile units; renderer converts at draw time. `decorate.ts` deleted. Observer panel gained a region column (home / village / traveling / `<peer-farm>`). 159/159 farm-valley tests pass; production build green.

Tile size = 16; camera covers full 640×640 world (zoomed-out always-on view as decided in Briefs 05/06).

Subagent note: the brief said "must not touch `region-setup.ts`" but the senior had to add sprite stamping for market wall + shopkeeper there once `decorate.ts` was deleted (decorate.ts was providing both the pixel-coord override AND the sprite component). Reasonable judgment call — flagged in their report.

## [2026-05-26] process | Subagent workflow change

Going forward, implementation work uses **opus-plans-then-sonnet-executes** instead of the parallel opus+sonnet pattern used for Briefs 05/06. The senior plans (reads brief, surveys code, writes concrete step-by-step plan including exact diffs and tests), then dispatches one sonnet to execute the plan. Cheaper, more predictable, fewer scope drifts. Saved to memory.

## [2026-05-26] impl | Briefs 05 + 06 landed via parallel subagents

Brief 05 (`0c50acd`) and Brief 06 (`e45c7d7`) implemented on branch `feature/village-farms` using paired senior (opus) + junior (sonnet) subagents per brief, working in one shared worktree at `.claude/worktrees/village-farms`. 157/157 farm-valley tests pass. Both briefs moved to `briefs/game/done/`.

Worked as expected:
- The senior/junior file-ownership split in the briefs gave both subagents non-overlapping scopes and they ran cleanly in parallel.
- The WASM pathfinder is now load-bearing: personalities prepend a `travel → village` intent before any market action when they're not already there. TravelSystem consumes those and walks farmers tile-by-tile (STEP_TICKS=5).

Divergences from the briefs worth noting:
- Walkable tile count was 752, not 728 — my arithmetic in Brief 05 was off (4×144 + 144 + 32 = 752). Test asserts the correct count.
- Senior found that the "flat plot loop" the brief said to remove from `world-setup.ts` actually lived in `sim-bootstrap.ts`. They pragmatically extended scope to `sim-bootstrap.ts` and replaced it there. Reasonable call.
- `System.run(ctx)` was used everywhere (not `step(stepMs)` as the briefs sketched) — the senior caught this from existing code. Codebase wins, per [CLAUDE.md](CLAUDE.md).
- Brief 06's "ShopkeeperSystem consumes from `remaining` and rejects sold-out trades" wasn't implemented because my junior prompt forbade touching `shopkeeper.ts`. The slate is generated and broadcast but trades still hit the existing fixed-price handlers. See [wiki/open-questions.md](wiki/open-questions.md).
- No renderer changes yet — the new 40×40 region layout is invisible until the canvas2d renderer is taught about regions. Tracked in open-questions.

## [2026-05-26] brief | 05-village-and-farms + 06-spatial-market drafted

Spatial restructure: 4 farms (N/E/S/W) + village center with shop and town square. Decisions made:
- World view: all 5 regions on one zoomed-out canvas (one continuous map, no scene transitions)
- Spatial coupling: posting offers + peer trades require presence in village; reading stays remote
- Shop: daily slate of 5 offers, ±10–20% off baseline, mix of buy/sell

Brief 05 (foundation) covers regions, walkable grid, pathfinder integration, travel intent + TravelSystem. Finally puts the WASM pathfinder to work — closes [open-questions.md](wiki/open-questions.md) "Pathfinder loaded but unused."

Brief 06 (depends on 05) layers in market presence enforcement, peer encounter trades, shop daily slate, and updates personalities to plan trips. Trust score gap from Brief 01 still deferred.

## [2026-05-26] status | Brief sweep + post-corpus work documented

Audited all 8 task briefs against the codebase. 7 of 8 are **done**; `01-tilemap` is **superseded** (WebGPU dropped for Canvas2D in commit `5ac7f8d`). Recorded post-corpus work that never had a brief: Canvas2D renderer, in-house ECS replacing miniplex (`020406d`), WASM pathfinding infrastructure, home screen, headless `run-sim`, `world-preview`. See [wiki/status.md](wiki/status.md).

## [2026-06-05] wiki | performance.md — optimization opportunities

New page [wiki/performance.md](wiki/performance.md), born from an "what optimizations can we do" question. Mapped the engine's per-tick/per-frame hot spots and filtered generic best-practice advice against actual code. Key findings:

- **Already done** (don't redo): pooled query iteration, baked static layer + water pattern, message-bus buffer-swap, foam-bubble viewport culling.
- **Tier 1**: the snapshot boundary ships ~150–200 allocs/tick via structured clone — candidate for transfer / `SharedArrayBuffer` packing of numeric sprite data; and `getInterpolatedSprites()` allocates a Map + array + per-sprite spread every *frame* (poolable).
- **Tier 2 (culling/clipping)**: the static layer is blitted full-frame with **no clipping**, and dynamic sprites/shadows are **not** viewport-culled (only foam is) — so the classic 2D culling/clip-rect/sort-on-dirty wins are genuinely unrealized here.
- **Explicitly NOT worth it at ~4-farmer scale**: archetype/SoA ECS rewrite (5–10× cache wins need thousands+ entities), extra path caching (pathfinder isn't a per-tick cost).

No code changed — analysis only. Suggested order: profile → mechanical allocation + culling fixes → snapshot interim → SAB boundary. Indexed in [index.md](index.md).

## [2026-06-05] brief | 09-perf-optimization (todo)

Turned [wiki/performance.md](wiki/performance.md) into an ordered, shippable brief: [briefs/engine/todo/09-perf-optimization.md](briefs/engine/todo/09-perf-optimization.md). First entry in the previously-empty engine-todo list. Priority tiers:

- **P0** — instrument worker tick + render frame (baseline; gates whether P2.7 is worth it).
- **P1** — pool per-frame interpolation, viewport-cull sprites/shadows, clip static-layer blit, kill loose per-tick allocs, sort-on-dirty. All mechanical, `EXPORT=json`-verifiable.
- **P2** — snapshot interim (no double-alloc events, day-boundary observer/leaderboard rebuild), then packed numeric snapshot over transfer/`SharedArrayBuffer` (COOP/COEP caveat noted).
- **P3** — deferred: archetype/SoA ECS rewrite, extra path caching (both near-zero payoff at ~4-farmer scale).

## [2026-06-05] code | Brief 09 P0 — perf profiling instrumentation

Shipped P0 of [briefs/engine/todo/09-perf-optimization.md](briefs/engine/todo/09-perf-optimization.md). New dependency-free `Profiler` in `@engine/core` ([packages/engine/src/debug/profiler.ts](../packages/engine/src/debug/profiler.ts)) — per-metric rolling ring → count/mean/min/max/p50/p95, no-op when disabled. Wired worker (`tick`, `snapshot.build`, `snapshot.bytes`) + main (`interp`, `frame`); surfaced in DebugOverlay; opt-in via `?profile` URL param (off by default = zero overhead). New protocol msgs (WorkerProfileToggleMsg / WorkerProfileMsg).

Verification: typecheck clean, 473 tests pass (+7 new in [profiler.test.ts](../packages/engine/src/debug/profiler.test.ts)), `check-determinism` MATCH, production build OK. No sim-state changes (host-timing only) so determinism is unaffected. This is the baseline for the rest of brief 09; P1/P2 remain. See [wiki/performance.md](wiki/performance.md) "Measuring".

## [2026-06-05] code | Brief 09 P1 — allocation pooling + culling/clipping

Shipped P1 of [briefs/engine/todo/09-perf-optimization.md](briefs/engine/todo/09-perf-optimization.md) — mechanical, behavior-preserving render/alloc work:

- **Interpolation pooling** ([sim-client.ts](../packages/farm-valley/src/worker/sim-client.ts)): `getInterpolatedSprites()` reuses a pooled array + records (`copySprite`); prev-id index rebuilt once per snapshot, not per frame. Removes the per-frame Map + `.map()` + spread. Return is now pooled (documented contract: consume within the frame).
- **Viewport culling** ([canvas2d.ts](../packages/engine/src/render/canvas2d.ts)): `beginFrame` computes the visible world rect; `push`/`pushShadow` cull off-screen centers — covers all push sites at once. Queues reused (length-reset, not realloc); shadow records pooled.

## [2026-06-05] code | Brief 09 P2 — snapshot interim win (events); #7 deferred

Shipped the safe half of P2 and **corrected the brief** on the rest:

- **#6 events double-alloc fixed** ([snapshot-builder.ts](../packages/farm-valley/src/worker/snapshot-builder.ts)): `buildEvents` no longer does `.slice().map()` (two allocations/tick); it fills a pooled `eventsScratch` buffer in place. Aliasing contract documented — safe in prod because postMessage structured-clones the snapshot before the next build; same-thread callers (tests, run-sim) only compare observer/leaderboard, never events.
- **#6 day-boundary caching DROPPED as incorrect.** The brief said "rebuild observer/leaderboard only on day boundaries — that state barely changes tick-to-tick." Verified false against [act.ts](../packages/farm-valley/src/systems/act.ts): gold (sell/buy/fish/mill) and observer fsm/AP/intention change on arbitrary intra-day ticks; per-day caching would freeze the live panels. Source-of-truth = code (per [CLAUDE.md](CLAUDE.md)).
- **#7 (packed transfer / SharedArrayBuffer) DEFERRED** — user decision, gated on profiling. Build only if `?profile` shows `snapshot.bytes`/copy time is material (expected negligible at ~25 sprites/tick). Prefer transferable buffers over SAB to avoid COOP/COEP. Trigger + plan recorded in the brief.

Verification: typecheck clean, **473 tests** pass (snapshot-builder suite incl.), check-determinism MATCH. Behavior-preserving (event contents unchanged, only allocation). Brief 09 now: P0 ✅ P1 ✅ P2 #6 ✅ / #7 deferred; P3 deferred by design. See [wiki/performance.md](wiki/performance.md).
- **Static-layer + water clipping**: `endFrame` blits/fills only the visible source rect (9-arg `drawImage`).
- **Loose system allocs**: crop-growth `plotScratch` (day-boundary, reused) + event-feed `this.fresh` (per-tick, reused).
- **Item 5 (sort-on-dirty)**: partially deferred — queue trimmed before sort, but full dirty-tracking skipped (live set is tiny after culling). Noted in the brief, not silently dropped.

Verification: typecheck clean; **473 tests** pass (incl. render-systems suite exercising push/endFrame); `check-determinism` MATCH; **multi-seed `EXPORT=json` before/after byte-identical** (seeds 1/42/1337, 100 days each — proves the event-feed/crop-growth sim-path changes are behavior-preserving, per CLAUDE.md); production build OK. Next: P2 (snapshot boundary). See [wiki/performance.md](wiki/performance.md).

## [2026-06-05] measure | Brief 09 — `?profile` numbers captured; P3 + #7 settled

Ran the P0 profiler in a real browser (Playwright-driven dev server, seed 0xc0ffee, ~250–300 entities, sampled across day boundaries). Numbers in [wiki/performance.md](wiki/performance.md) "Measured results":

- sim `tick` **0.33–0.37ms** (mean) / 0.50–0.70ms (p95) — **~0.7% of the 50ms 20Hz budget**.
- `snapshot.build` 0.08ms; `snapshot.bytes` **~36KB/tick** (~720KB/s structured clone).
- render `frame` **1.36–1.69ms** / 2.0–2.3ms p95 — **~10% of the 16.6ms 60fps budget**.
- `interp` 0.03ms (T1.2 pooling made it negligible). fps ~60 = browser vsync.

**Clarified the "60fps" question:** there is no self-imposed fps cap — render is rAF/vsync (60fps) and the sim is a separate 20Hz worker loop; the renderer interpolates between snapshots. Nothing to "uncap."

**Decisions settled by the data:**
- **P2 #7 (packed/SAB snapshot): not worth building.** 0.08ms build + 36KB clone is invisible in budget. Re-trigger only on a ~10× entity increase. Brief #7 + perf wiki updated.
- **P3 (archetype/SoA ECS rewrite, path caching): confirmed deferred.** Tick is 0.33ms over ~300 entities — no cache-locality cost to recover. Brief P3 section updated with the measured justification.

No code changed — measurement + corpus only. Brief 09 is now effectively complete: P0 ✅ P1 ✅ P2 ✅(#6 / #7 declined-on-data) P3 declined-on-data.

## [2026-06-05] ship | Game brief 36 — End-of-run "Legends" recap

Implemented [briefs/game/done/36-end-of-run-recap.md](briefs/game/done/36-end-of-run-recap.md) (Sonnet executor, opus-planned). The bare day-100 standings block is now a **Legends recap**: standings with a mid-season (day-50) rank delta (▲/▼/—), a one-line auto-generated season arc per farmer, and a single run headline.

- **NEW [systems/run-history.ts](../packages/farm-valley/src/systems/run-history.ts)** — passive read-only `RunHistorySystem` snooping `DAY_START` off the weatherStation inbox (BubbleSystem pattern, `lastDayProcessed` guard); appends `{day,farmerId,gold,rank}` per farmer per new day. Rank = `totalValue desc → farmerId asc` (matches the live leaderboard's `leaderboard()` ordering + adds the deterministic farmerId tiebreak the live one lacks). Registered in the read-only snoop band (after `eventFeed`, before `PerceiveSystem` clears inboxes); exposed as `BootedSim.runHistory`.
- **NEW [run-recap.ts](../packages/farm-valley/src/run-recap.ts)** — pure `summarizeRun(history, events, finalStandings) → RunRecap`. Arc patterns: surge (≥50% days last → ended 1st), collapse (led ≥50% days → ended ≥3rd), steady (top-half ≥75% days), generic fallback. Headline: biggest gold trade (parsed from the `(Xg)` suffix in event text) + first `Drought!` shock, with a winner fallback. `rivalries` field omitted — gated on brief 37 (not merged).
- **Wire-through**: `recap: RunRecap | null` added to `RenderSnapshot` (snapshot.ts), built at game-over in `buildRenderSnapshot` (snapshot-builder.ts, new `runHistoryRows` param defaulted `[]` for snapshot-builder.test back-compat), threaded from `sim-worker.ts`, surfaced via `SimClient.recap`, rendered by `createGameOverPanel`/`renderGameOver` in main.ts (headline + arcs block + delta column; share button + seed badge unchanged).
- **NEW tests**: run-history.test.ts (7) + run-recap.test.ts (9).

Verification: typecheck clean; **449/449** farm-valley tests pass (+16 new); `CHECK_DETERMINISM` **MATCH** across seeds `0xc0ffee/1/42` (history collection does not perturb sim outcomes). Recap is a pure function → same seed = byte-identical recap. Not committed. Note: the day-100 panel was not Playwright-verified live (a full run is ~100 min at the live 1200 ticks/day); the data path is covered by unit tests + the determinism harness driving the full game-over machinery.

## [2026-06-05] ship+finding | Game brief 37 — Rivalries & relationship legibility (plumbing shipped DORMANT)

Implemented [briefs/game/done/37-rivalries-and-relationship-legibility.md](briefs/game/done/37-rivalries-and-relationship-legibility.md) (Sonnet executor, opus-planned). All code green and deterministic — **but a verification run revealed the feature is inert in live play**, so it ships as correct-but-dormant scaffolding (user call: "ship as plumbing, document the gap").

**Shipped:**
- **NEW [systems/rivalry.ts](../packages/farm-valley/src/systems/rivalry.ts)** — passive `RivalrySystem` (read-only snoop, TrustSystem discipline): unbounded `rivalryScore` per ordered pair key `min:max`, incremented on adverse events (peer `ONT_ENCOUNTER.DECLINE`; broken CNP commitments via its own `seenBroken` dedup, never calling `markBrokenCommitmentReported`). `RIVALRY_THRESHOLD = 3`, `ALLIANCE_TRUST_THRESHOLD = 0.8`. Accessors: `freshlyFormedThisTick()`, `activeRivalries()`, `activeAlliances()` (derived from current mutual trust), `nameOf()`. Registered after `TrustSystem`, **before** `EventFeedSystem` so the feed reads fresh rivalries same-tick. Exposed as `BootedSim.rivalry`.
- **NEW [ui/relationship-matrix.ts](../packages/farm-valley/src/ui/relationship-matrix.ts)** — N×N trust grid panel (leaderboard.ts pattern), mounted in the brief-25 right column. Bands: <0.35 `EDG.red`, 0.35–0.65 `EDG.steel`, >0.65 `EDG.green`; diagonal inert; headers via `personalityColor`.
- **EDIT event-feed.ts** — "A rivalry is brewing: X vs. Y" / "X and Y formed an alliance" lines (stable dedup keys), reading the rivalry system via a new optional ctor param.
- **Wire-through**: `relationships` + `rivalries` on `RenderSnapshot` → `SimClient.relationships`/`.rivalries` → matrix panel + game-over "Notable relationships" section. **Fed brief 36's recap**: `summarizeRun` now takes the active rivalries/alliances and populates `RunRecap.rivalries` (the placeholder is gone).
- **+23 tests** (rivalry.test 9, relationship-matrix.test 10, run-recap rivalry suite 4). 472 farm-valley pass; typecheck clean; `CHECK_DETERMINISM` MATCH ×3 seeds.

**Finding (the gap) — verified by instrumented headless runs:** over a full 100-day run on `0xc0ffee/1/42`, **zero** farmer↔farmer interaction events fire — no ACCEPT/DECLINE/peer-TRADE_COMPLETED/broken-commitment. `farmer.trust` is never even lazy-initialized; the matrix stays flat at 0.5. So rivalries/alliances **never form** and the matrix is a static neutral grid. The only live events all run are golden-bean auction wins + crop withering. This is upstream of brief 37: `EncounterTradeSystem` doesn't escalate steady-state market encounters into offers. Brief 37's acceptance ("≥1 rivalry per live run") is therefore **unmet**; the code is nonetheless correct and will activate for free once a future gameplay brief makes peer interaction happen (must touch `agents/**`, out of 36–40 scope — likely folded into the 41–46 batch). Logged in [wiki/open-questions.md](wiki/open-questions.md) → "Peer-interaction layer is inert". Not committed.

## [2026-06-05] ship | Game brief 38 — Drama scoring & narrative escalation

Implemented [briefs/game/done/38-drama-scoring-and-narrative-escalation.md](briefs/game/done/38-drama-scoring-and-narrative-escalation.md) (Sonnet executor, opus-planned). Purely additive observation — every captured feed event now carries a `drama` score that drives visual emphasis, a recap headline, and (when they occur) rank-flip / race-on lines.

- **NEW [systems/drama.ts](../packages/farm-valley/src/systems/drama.ts)** — pure `dramaScore(kind, {day, maxDays})` + `actBandForDay`. Base table (routine ~0.1; auction/trade/crop-death ~0.4–0.6; rank-flip/blight/race-on ~0.8–1.0) × act-band multiplier (establishment 0.80 / competition 1.00 / climax 1.20; bands = first 30% / middle / last 30% of `maxDays`), clamped [0,1]. Rank source = `RunHistorySystem` (brief 36, merged).
- **EDIT [event-feed.ts](../packages/farm-valley/src/systems/event-feed.ts)** — `EventEntry` gains `drama`; every capture sets it. `maxDays` via new `DayClockSystem.maxDays` getter. `snoopRankChange()` emits "X overtakes Y for 1st!" on a day-over-day rank-1 change (key `rankflip:day:leader`); `snoopRaceOn()` emits a one-shot "Final stretch — X and Y separated by N%" when day ≥ 90% and the top-2 gap ≤ 8% (key `raceon:run`). Constructor now `(world, dayClock, rivalry?, runHistory?)`.
- **EDIT [event-feed-panel.ts](../packages/farm-valley/src/ui/event-feed-panel.ts)** — drama ≥ 0.7 rows render `EDG.gold` + `★ ` prefix; routine rows stay `EDG.green`. Color set per-update so reused DOM nodes toggle.
- **EDIT [run-recap.ts](../packages/farm-valley/src/run-recap.ts)** — `buildHeadline` prefers the highest-drama event (tie-break latest day → stable), keeping the brief-36 text fallbacks when drama is uniformly low.
- `SnapshotEvent` gains `drama`; `buildEvents` copies it (both create + reuse branches).
- **+~24 tests** (drama 12, event-feed +4, panel +4, recap +4). 498 farm-valley pass (552 total w/ engine); typecheck clean; `CHECK_DETERMINISM` MATCH ×3 seeds.

**Live observation (seed 0xc0ffee):** as expected from the inert-peer-layer + dominant-leader reality, **0 rank-flip and 0 race-on lines** fired — Atticus dominates wire-to-wire (winning every golden-bean auction), so there's no top-rank crossing and no close finish. The one high-drama event was the Day-50 blight (`drama=0.85`), which now renders emphasized and becomes the recap headline. Scoring/emphasis/detection are correct and deterministic — they just need a closer race (or a live peer layer) to light up. Related: [[project-peer-interaction-inert]]; the late-game flatness is its own gap (the leader runs away). Not committed.

## [2026-06-05] brief | Game brief 47 — Split atlas into specialized sheets (queued, user request)

Filed [briefs/game/todo/47-split-atlas-into-specialized-sheets.md](briefs/game/todo/47-split-atlas-into-specialized-sheets.md) at the user's request: break the single `main` atlas into purpose-grouped sheets (characters / buildings / terrain / crops / props / items-ui). Diagnosis from a code read — all 110 recipes (~157 frames) pack into one `main.png` via `packShelf(RECIPES)`; the renderer keeps a single `LoadedAtlasImage` (`Canvas2dRenderer.setAtlas`) and **ignores the `atlasId: "main"` every sprite already carries**; the loader fetches a hardcoded `/atlas/main.json`. Frame names are already prefix-namespaced (`structure/ tile/ farmer/ npc/ crop/ decoration/ fish/ tool/ indicator/ debug/`), giving clean seams. Brief scopes: builder emits one PNG+JSON per sheet + an `atlas/index.json`; renderer holds an atlas **map** and resolves `frameRect` by `atlasId`; a single `frameToAtlasId` helper sets each sprite's atlasId from its frame (no per-call-site edits); `bakeStaticLayer`/`bakeWaterPattern` resolve their sheets. Render + asset-pipeline only — **no sim/tick/determinism impact** (re-verify MATCH anyway). Listed in [index.md](index.md) + [wiki/open-questions.md](wiki/open-questions.md). Open question flagged for the executor: authoring-ergonomics only vs. leaving a seam for lazy/hot-swap (brief 45 seasonal terrain).

## [2026-06-05] ship | Briefs 39 + 47 — wealth graph & atlas split (parallel worktrees, merged to main)

First use of the per-brief branch+worktree+merge workflow (user request). Wave 1 = the two file-independent briefs run in parallel worktrees, each by a Sonnet executor, then merged to `main` when green (auto-merge gate). Only `main.ts` overlapped between them; it auto-merged.

**Brief 39 — [Wealth-over-time graph](briefs/game/done/39-wealth-over-time-graph.md)** (commit on `main`): NEW [ui/wealth-graph.ts](../packages/farm-valley/src/ui/wealth-graph.ts) — multi-line chart (one line/farmer, X=day, Y=gold, personality colors), crossing markers, collapsible right-column panel, per-day redraw. Pure consumer of brief-36 `RunHistorySystem`: the per-day series is now surfaced live on the snapshot as `wealthSeries` (NEW `SnapshotWealthSeries`) → `SimClient.wealthSeries`. Pure `computePoints`/`detectCrossings` layout math unit-tested. Render-only, no sim/agent/engine changes. +26 tests; palette guard green.

**Brief 47 — [Split atlas into specialized sheets](briefs/game/done/47-split-atlas-into-specialized-sheets.md)** (commit on `main`): the single `main` atlas is now **6 sheets** — `characters` (farmer/*+npc/*), `buildings` (structure/*), `terrain` (tile/*), `crops` (crop/*), `props` (decoration/*), `items-ui` (fish/*+tool/*+indicator/*+debug/*) — plus `atlas/index.json`. `atlasId` is now **load-bearing**: `Canvas2dRenderer` holds an atlas `Map`, `addAtlas()` registers each sheet, `drawSprite`/`bakeStaticLayer`/`bakeWaterPattern`/`endFrame` resolve by `atlasId`; `frameToAtlasId()` ([render-systems.ts](../packages/farm-valley/src/render-systems.ts)) sets each sprite's sheet from its frame prefix; `main.ts` loads all sheets via new engine `loadAllAtlasSheets`. `world-preview` updated. `setAtlas` kept as a back-compat shim + the **seam for brief 45's seasonal-terrain swap** (open question answered: leave the replace-a-sheet seam, don't build lazy-load). `main.png`/`main.json`/`main.png.bak` deleted. No-visual-change refactor; sim/tick untouched. +19 tests.

**Verified on `main` after both merges:** typecheck clean; **537 farm-valley + 60 engine tests pass**; determinism MATCH ×3 seeds (47 confirmed zero sim impact). Worktrees removed, branches deleted.

## [2026-06-05] ship | Game brief 40 — Thought bubbles + skip-to-highlight (worktree → main)

Implemented [briefs/game/done/40-thought-bubbles-and-highlight-skip.md](briefs/game/done/40-thought-bubbles-and-highlight-skip.md) (Sonnet executor in a worktree, merged to `main` when green). Two bundled spectator features:

- **Part A — ambient intention bubbles.** 14 new `indicator/intention-*` glyphs (→ the brief-47 `items-ui` sheet, EDG-only). [snapshot-builder.ts](../packages/farm-valley/src/worker/snapshot-builder.ts) maps each AI farmer's current `intention.kind` → a glyph and sets a new `SnapshotSprite.bubble` field; shown for a **10-tick window on intention *change*** (meet-bubble precedence; mirrors the meet indicator's window) so the map stays scannable. Drawn in [render-systems.ts](../packages/farm-valley/src/render-systems.ts) above the farmer (layer 89; meet at 90). Player (Pip) excluded.
- **Part B — skip-to-highlight + zoom.** New `skipToHighlight` worker control ([sim-worker.ts](../packages/farm-valley/src/worker/sim-worker.ts)): runs the SAME `runOneTick()` until a `drama ≥ 0.7` event appears (`HIGHLIGHT_THRESHOLD`, matches the feed-panel emphasis) or a **30-day safety cap**; pure `shouldStopSkip()` stop-condition unit-tested; pacing-only, determinism intact. `SimClient.skipToHighlight()` + a **`H`** hotkey + button. `SnapshotEvent.farmerId` (set at capture for events with a clear subject — auction winner, shock target, crop-death owner, rank-flip/race-on leader) lets a **feed-row click snap the focus camera** to the involved farmer.
- +18 tests (556 farm-valley pass); typecheck clean; atlas + palette guards pass; determinism **MATCH ×3**.

Live caveat (expected, not a bug): high-drama events are rare (leader runs away; the Day-50 blight is the main beat), so "skip to highlight" can fast-forward far or hit its 30-day cap. Related: [[project-peer-interaction-inert]] + the leader-runaway flatness. This **completes the spectator/story layer (briefs 36–40)**. Worktree removed.

## [2026-06-05] ship | Game brief 41 — Crop roster + quality tiers (THE SPINE; worktree → main; re-baselined)

Implemented [briefs/game/done/41-crop-roster-and-quality-tiers.md](briefs/game/done/41-crop-roster-and-quality-tiers.md) (Sonnet executor in a worktree, merged to `main` when green). First gameplay brief that **changes the determinism baseline by design** — verified MATCH-on-replay (×3), not equality to the old numbers.

- **Part A — crops, season-gated.** `CropKind` 3→**8**: + `carrot` (spring), `tomato`+`corn` (summer), `grape` (autumn), `winter-squash` (winter — **winter is no longer cropless**). `economy.ts` gains `CROP_SEASON`, `OUT_OF_SEASON_GROWTH_RATE=0.5`, `ZERO_CROPS`; all crop tables expanded. `CropGrowthSystem` multiplies the daily growth advance by 1.0 in-season / 0.5 out. 15 new `crop/*` recipes → the brief-47 `crops` sheet (rebaked).
- **Part B — quality tiers.** `CropQuality` Normal/Silver/Gold; `Inventory.cropQuality?` is an OPTIONAL parallel breakdown (back-compat — flat `crops` count preserved). `computeQuality()` (pure, in harvest.ts) = water(0.5)+growth(0.3)+weather(0.2)+decoration shift + a **forked `crop-quality` Rng** roll (Gold ≥0.82, Silver ≥0.52). `HarvestSystem` takes the rng. Quality-weighted net worth via `cropInventoryValue()` (×1/×1.25/×1.5), used by `leaderboard()` + `run-history`. Crop sprite quality pip + tooltip.
- **Agents:** all four personalities now plant **season-aware** (in-season × margin × affordability, per-personality flavor; `decisionTrace` reasons). Shop slate/shopkeeper sell all 8 seeds.
- **Part C (multi-harvest):** corn is in the roster; the executor's report did not confirm a regrow loop landed — treat multi-harvest as NOT guaranteed this brief (follow-up if desired).
- **+6 tests** (562 farm-valley + 60 engine pass); typecheck clean; atlas + palette guards pass; determinism **MATCH ×3** (replay).
- **Live verification (seed 0xc0ffee):** all 8 crops get planted across the run; all 3 qualities (normal/silver/gold) get banked — the new systems are genuinely exercised.

**⚠️ New baseline / balance note:** day-100 standings are now an EXTREME runaway — Atticus (aggressive) **16,467g** vs Cora 980 / Hannah 199 / Otto 72 (Pip 60, idle player). The aggressive personality exploits the high-value seasonal crops (esp. autumn grape / premium) far better than the others. This is not a brief-41 defect (re-baseline was expected) but it sharpens the pre-existing **leader-runaway flatness** — relevant to 42–46 balancing and to the spectator layer (38/40's drama stays dormant when one farmer dominates wire-to-wire). See [[project-peer-interaction-inert]] and the leader-runaway gap in open-questions.

## [2026-06-05] ship | Game brief 43 — Greenhouse + per-farm skills (worktree → main; re-baselined)

Implemented [briefs/game/done/43-greenhouse-and-farm-skill-progression.md](briefs/game/done/43-greenhouse-and-farm-skill-progression.md) (Sonnet executor in a worktree; merged when green). Builds on 41 (season-locked crops + quality) and 42 (the working patient-capital excursion deliberation).

- **Part A — Greenhouse.** Buildable structure (140g, or ~90g with a 20-wood+12-stone discount — the heaviest single sink). Spawns a glasshouse + 4 **season-immune plots** that grow ANY crop at full rate year-round and never decay ([crop-growth.ts](../packages/farm-valley/src/systems/crop-growth.ts) bypasses the brief-41 season-suitability multiplier for greenhouse plots). Built via brief-42's committed-excursion pattern (conservative/hoarder favor; aggressive skips), interior-tile placement so it never traps the farmer. Atlas: `structure/greenhouse` + `tile/greenhouse-floor` (existing prefixes → buildings/terrain sheets).
- **Part B — Skills.** NEW [systems/skills.ts](../packages/farm-valley/src/systems/skills.ts) — pure level/bonus math, 10-level gentle curve `threshold(n)=5·(n-1)·n`. `Skills` component (farming/foraging/fishing/mining). XP granted at the ACT sites (1/plant·forage·cast·mined-rock, 2/harvest). Level bonuses (pure, gentle): farming → +quality husbandry (≤+0.18) & +growth (≤×1.12); fishing → minnow→bass/salmon reweight (≤0.30); mining → +geode/iron bands (≤+0.15); foraging → forage gold (≤×1.40). Surfaced per-farmer in `observer.ts` + snapshot. Professions/milestone-fork SKIPPED (optional; follow-up).
- **+15 tests (592 FV + 60 engine); typecheck clean; atlas + palette guards pass; determinism MATCH ×3** (re-baselined by design).
- **Live (seed 0xc0ffee, pathfinder on):** Cora builds the greenhouse d33; out-of-season corn confirmed growing in it d62 (full rate vs 0.5 open-field); Atticus reaches farming L6.

**⚠️ Baseline / balance note:** the greenhouse capital did NOT amortize by day 100 at this seed — Cora sinks ~140g + off-season effort and DROPS from her brief-42 #1 back to **#2**, so **Atticus (aggressive) runs away again (2655 vs Cora 1075)**. The leader-runaway returns at this seed (brief 42's crossing was livestock-driven; the greenhouse is a longer-horizon bet that a 100-day run barely repays). Also: skills are **lopsided toward farming** (Atticus L6) because the AI rarely forages/fishes/mines — the other 3 skills stay L1 (legible but mostly inert). Neither is a defect (feature fires, deterministic) — both are balance observations for the runaway gap. See [[project-leader-runaway]].

## [2026-06-05] fix | Determinism regression — mining used raw Math.random() (exposed by brief 44)

After merging brief 44, `CHECK_DETERMINISM` started reporting **DIVERGE on `main`** at the default `ticksPerDay=20` (all 3 seeds; two runs of the SAME seed differed — e.g. seed 0xc0ffee's day-4 weather was "sunny" vs "normal", the signature of an Rng draw-count desync). Root cause: [`ActSystem.handleMine`](../packages/farm-valley/src/systems/act.ts) rolled ore/geode drops with a **raw `Math.random()`** — a latent "wart" left untouched through brief 43. The sim was only deterministic *while no agent mined*; brief 43's harness PASS was luck. **Brief 44 made the blacksmith VALIDATE + consume ore (2 stone→stone tool, 2 iron-ore→iron tool), so agents began mining to upgrade tools and reliably tripped the nondeterminism.** Fix: fork a seeded `mineRng = rng.fork("mine")` channel (mirroring the existing `fishRng`) and use `this.mineRng.nextFloat()`. Swept the tree — no other unseeded `Math.random()`/`Date.now()` remains in `systems/**` or `agents/**` (the only residual is the fish/mine `Math.random()` *fallback* used solely when ActSystem is rng-less, i.e. legacy tests). Restored **MATCH ×3** (0xc0ffee/1/42) at the default tick rate; 607 FV + 60 engine tests green; typecheck clean. Merged to `main` (commit `3cab29b`). Lesson recorded: verify determinism at run-sim's DEFAULT ticksPerDay (20), not just 1200 — a subagent had reported MATCH by checking the slow seeds only at 60/day; the failure surfaced at 20. A `Math.random()` in any sim ACT path is a time-bomb that the harness misses until a behavior change reaches it.

## [2026-06-06] ship | Game brief 45 — Seasonal visual identity + festival events (worktree → main; re-baselined)

Implemented [briefs/game/done/45-seasonal-visual-identity-and-festivals.md](briefs/game/done/45-seasonal-visual-identity-and-festivals.md). Started by a Sonnet executor in a worktree that errored (API "Overloaded") before any verification, leaving the work UNVERIFIED; this session rebased the worktree onto the determinism-fixed `main`, then verified + completed it (found + fixed one real contest bug, see below).

- **Part A — Seasonal visual identity (render-only).** Season-variant ground-tile recipes + autumn/bare-tree variants in [recipes.ts](../tools/atlas-builder/src/recipes.ts) (+153 lines; new prefixes → terrain/buildings sheets, atlas rebaked), season-aware `bakeStaticLayer` (re-bakes on season change, 4× per run) in [render-systems.ts](../packages/farm-valley/src/render-systems.ts), and **rain/snow ambient particle overlays** in [main.ts](../packages/farm-valley/src/main.ts) driven by the snapshot's current weather/season (existing game-layer ParticleSystem, EDG32 palette, wall-clock animated — the `Math.random()` jitter there is main-thread render only, never sim, matching the pre-existing ambient-leaf code).
- **Part B — Festivals (sim, deterministic).** NEW [protocols/festival.ts](../packages/farm-valley/src/protocols/festival.ts) — a fixed mid-season calendar (Spring Planting Fair **day 13**, Summer Market Day **38**, Autumn Harvest Fair **63**, Winter Feast **88**), each celebrating an in-season contest crop with a gold prize + a one-day special-market price spike; all pure calendar functions (no RNG/clock). NEW [systems/festival.ts](../packages/farm-valley/src/systems/festival.ts) `FestivalSystem` (snoop band, before DeliberateSystem): announces the festival + writes `festivalToday`/`daysUntilFestival`/`nextFestival` into every farmer's beliefs (so personalities can plan), then resolves a **deterministic harvest contest** the next day-start. [day-clock.ts](../packages/farm-valley/src/systems/day-clock.ts) gained `festivalToday`/`daysUntilFestival` getters; [event-feed.ts](../packages/farm-valley/src/systems/event-feed.ts) narrates a drama-scored `ONT_FESTIVAL.RESULT` beat ("Spring Planting Fair — Hannah wins with a Gold wheat"); all 4 personalities queue a gather-at-podium intention with a planning `decisionTrace` reason.
- **Contest bug found + fixed (the verification catch).** The original code resolved the contest by reading **live inventory at the next day-start** — but agents sell/harvest the contest crop *during* the festival day, so a farmer who harvested a Gold crop for the fair could have sold it before judging (the failing test had Atticus's planted Gold wheat sold on the first ACT tick of the festival day). Fix: FestivalSystem now captures a **per-day high-water mark** of each farmer's best contest-crop unit *every tick of the festival day* (day derived from `ctx.tick`, not the one-tick-late DAY_START message, so the first capture beats ActSystem's first sale), and judges on that. The ranking was also extracted to a pure exported `rankSubmissions()` (quality desc → count desc → id asc; total order, deterministic) and unit-tested directly — the live-sim test now only asserts that *a* festival fires, awards *a* winner, and narrates (the realistic invariant), instead of pinning a specific winner the running sim's harvests can change.
- **Determinism:** the only randomness is a forked `rng.fork("festival")` reserved for a full tie-break (ids are unique so it never actually decides, but the stream advances identically across replays). **CHECK_DETERMINISM MATCH ×3** (0xc0ffee/1/42) at the DEFAULT ticksPerDay. Briefs **41–45 re-baseline outcomes by design** — same-seed reproducibility, not equality to pre-41 numbers.
- **Tests:** 618 FV + 60 engine = **678** green; typecheck clean; atlas frame-count + palette guards pass.
- **Live probe** ([tools/run-sim/src/probe-45.ts](../tools/run-sim/src/probe-45.ts), seed 0xc0ffee, pathfinder on): all **4 festivals fire** (beliefs written on days 13/38/63/88), **4 feed lines** narrate results — Spring (Hannah, Gold wheat), Autumn (Hannah, Gold pumpkin), Winter (Atticus, Gold winter-squash), and a graceful Summer "no contest entries this year" (no farmer held tomato that day). festivalWins surface on standings (Hannah 2, Atticus 1).

**Note / smaller gap:** the *physical* podium gathering is thin live (the probe saw 1 farmer-day at the podium) — farmers are usually mid-excursion at festival time. The contest itself reads inventory (not presence), so the dramatic beat + narration fire correctly regardless; richer "everyone convenes at the stage" choreography is a future visual polish, not an acceptance miss.

## [2026-06-06] ship | Game brief 46 — Harbor, shipping & contracts (worktree → main; re-baselined) — THE LAST BRIEF

Implemented [briefs/game/done/46-harbor-shipping-and-contracts.md](briefs/game/done/46-harbor-shipping-and-contracts.md) (Sonnet executor in a worktree, auto-merged when green; a focused follow-up agent added the missing harbor sprites; orchestrator independently verified all gates + the live probe before merge). This completes **game briefs 01–46** — none remain in `todo/` (the only open brief anywhere is engine 09-perf-optimization, unscoped).

- **Part A — Harbor.** New 8×8 harbor island ([regions.ts](../packages/farm-valley/src/world/regions.ts): `'harbor'` RegionId + `HARBOR_BOUNDS` tiles 58–65 × 68–75, `HARBOR_DOCK_TILE`/`HARBOR_BOARD_TILE`, a quarry-south bridge road) with a dockmaster NPC + a contract board entity (reuses `structure/notice-board`) spawned in [region-setup.ts](../packages/farm-valley/src/world/region-setup.ts). **walkable-grid `EXPECTED_WALKABLE` 1993→2065** (+64 island, +8 bridge) — test updated. New atlas recipes `npc/dockmaster/idle`, `structure/dock`, `structure/cargo-ship` (the diegetic shipping anchor; EDG32, `solid:false` props so they don't change the walkable count); characters 92→93, buildings 48→50.
- **Part B — Contracts (the demand-side axis).** NEW [protocols/harbor.ts](../packages/farm-valley/src/protocols/harbor.ts) (`ONT_HARBOR` CFP-style ontology, `HarborContract`) + [systems/harbor.ts](../packages/farm-valley/src/systems/harbor.ts) `HarborSystem` (snoop band, after FestivalSystem, before EventFeed). Posts seeded, time-boxed contracts (good + quantity + quality tier + deadline + gold reward above shop price + a `minReputation` gate) on a day cadence; tracks commitments on the board's `committed` Map; resolves delivery (farmer at harbor with goods → payout + reputation bump, unlocking bigger contracts) and deadline misses (forfeit + reputation penalty). Farmers gain `harborReputation` + a `committedContract` slot ([components.ts](../packages/farm-valley/src/components.ts)); reward/reputation tables in [economy.ts](../packages/farm-valley/src/economy.ts). [act.ts](../packages/farm-valley/src/systems/act.ts) gains `commit-contract` + `deliver-contract` (delivery resolves in HarborSystem); [ap.ts](../packages/farm-valley/src/systems/ap.ts) costs; [perceive.ts](../packages/farm-valley/src/systems/perceive.ts) surfaces open contracts into beliefs; [event-feed.ts](../packages/farm-valley/src/systems/event-feed.ts) + [drama.ts](../packages/farm-valley/src/systems/drama.ts) narrate posted/delivered/missed as drama-scored beats. All 4 personalities wired via `deliberateHarborContract`/`deliberateDeliverContract` ([watering.ts](../packages/farm-valley/src/agents/watering.ts)) with distinct risk profiles (conservative: only with goods in hand; hoarder/opportunist: grow-then-deliver on long deadlines; aggressive: speculate on short ones), mirroring brief 42's committed-excursion + winning-travel-priority. Contract generation + fulfillment ranking are PURE exported functions, unit-tested directly (the festival-brief lesson: don't pin a specific live winner).
- **Part C (bulk export)** deferred as a follow-up — the core post/commit/deliver/miss loop is fully operational.
- **Determinism:** generation uses `rng.fork("harbor")`; contract ids are `day`+slot; no `Math.random`/`Date.now`; resolution iterates the `openContracts` array + the deterministic farmer query (the `committed` Map is keyed-access only, never iterated). **CHECK_DETERMINISM MATCH ×3** (0xc0ffee/1/42) at the DEFAULT ticksPerDay, verified twice (pre- and post-sprites) and again on `main`. Briefs **41–46 re-baseline outcomes by design.**
- **Tests:** 636 FV + 60 engine = **696** green; typecheck clean; palette + atlas + walkable-grid guards pass. (Note: a fresh worktree needs a one-time `npm run build-wasm` — the gitignored `pathfinding.wasm` isn't present, which fails the engine pathfinder test until built; the rebuild is byte-identical so it creates no diff.)
- **Live probe** ([tools/run-sim/src/probe-46.ts](../tools/run-sim/src/probe-46.ts), seed 0xc0ffee, pathfinder on): contracts post throughout (board max 7 open+committed); **Hannah (hoarder) commits + delivers 3** (+224g/+500g/+364g, +6 rep total) and **misses 1** (−3 rep — the forfeit path fires). The loop is LIVE, not dormant.

**⚠️ Baseline / balance note (the recurring theme, now across 6 depth briefs):** brief 46 fires but only the *stockpiling hoarder* reaches the commit gate at this seed — the other 3 personalities evaluate contracts every tick yet rarely find an eligible one they'll act on, the same spare-capacity reality that left 43 (greenhouse) and 44 (tavern/hiring) flush-only. Combined with the inert peer-interaction layer (37), a single dominant farmer keeps the field flat and the spectator/rivalry drama (37/38/39/40) only intermittently lit. The depth systems (41–46) are each correct + tested + individually live; the clearest remaining work is a **balance / rubber-banding / peer-interaction brief** that broadens who can afford the deep systems and activates the drama layer. See [[project-leader-runaway]] / [[project-peer-interaction-inert]] and open-questions.

### Milestone: game briefs 01–46 complete

With 46 merged, the full game-brief backlog (01–46, plus 47 the atlas split) is shipped. The engine is feature-complete for Farm Valley; the one open brief is engine 09-perf-optimization (unscoped). The standing theme for any next wave is **balance/drama activation**, not new mechanics — the systems exist and fire; the competition is just lopsided.
