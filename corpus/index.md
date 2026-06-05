# Corpus Index

Catalog of everything in this corpus. Start here.

## Schema & log

- [CLAUDE.md](CLAUDE.md) — how this directory works; conventions; workflows
- [log.md](log.md) — chronological record of corpus changes

## Wiki — start here for synthesis

- [wiki/overview.md](wiki/overview.md) — what Farm Valley is; lineage; cast
- [wiki/architecture.md](wiki/architecture.md) — workspaces, layers, sim loop, ECS, message bus, data flow
- [wiki/player-and-interaction.md](wiki/player-and-interaction.md) — the playable farmer Pip, hotbar, hover tooltips, feature collision, bridges, plot layout, the 88×80 archipelago layout
- [wiki/decisions.md](wiki/decisions.md) — locked tech choices
- [wiki/performance.md](wiki/performance.md) — optimization opportunities filtered against actual code (snapshot boundary, interpolation pooling, culling/clipping); what's already done; what's not worth doing at current scale
- [wiki/status.md](wiki/status.md) — what's done, what's open (brief-by-brief)
- [wiki/open-questions.md](wiki/open-questions.md) — live list of gaps and unresolved questions

## Briefs — historical task specs

### Engine

- [briefs/engine/done/02-input.md](briefs/engine/done/02-input.md) — input system (keyboard/mouse/manager)
- [briefs/engine/done/03-tests.md](briefs/engine/done/03-tests.md) — engine unit tests (clock, rng, log, bus, world, persistence)
- [briefs/engine/done/04-spatial-anim.md](briefs/engine/done/04-spatial-anim.md) — spatial hash grid + sprite animation
- [briefs/engine/superseded/01-tilemap.md](briefs/engine/superseded/01-tilemap.md) — WebGPU chunked tilemap (renderer dropped)

- [briefs/engine/done/05-pathfinder-into-movement.md](briefs/engine/done/05-pathfinder-into-movement.md) — audit confirmed the WASM pathfinder is load-bearing; added a game-grid around-obstacle test + fixed stale docs
- [briefs/engine/done/06-determinism-harness-and-analytics.md](briefs/engine/done/06-determinism-harness-and-analytics.md) — determinism harness (CHECK_DETERMINISM) + per-day CSV/JSON export from run-sim
- [briefs/engine/done/07-chunked-tile-layer.md](briefs/engine/done/07-chunked-tile-layer.md) — cached static backdrop layer (bake once, blit per frame); chunking not needed

- [briefs/engine/done/08-wasm-expansion.md](briefs/engine/done/08-wasm-expansion.md) — three new WASM modules (noise, rng-batch, floodfill); pathfinder worker wiring bug fixed (farmers now actually walk)

#### Engine — todo

- [briefs/engine/todo/09-perf-optimization.md](briefs/engine/todo/09-perf-optimization.md) — prioritized perf pass (P0 profile → P1 mechanical alloc + culling/clipping → P2 snapshot boundary → P3 deferred); source analysis in [wiki/performance.md](wiki/performance.md)

### Game

- [briefs/game/done/01-personalities.md](briefs/game/done/01-personalities.md) — aggressive / hoarder / opportunist + CNP coordinator
- [briefs/game/done/02-weather-crops.md](briefs/game/done/02-weather-crops.md) — weather, crop growth, action points
- [briefs/game/done/03-market-shop.md](briefs/game/done/03-market-shop.md) — market wall, shopkeeper, Vickrey/Dutch auctions
- [briefs/game/done/04-observer-ui.md](briefs/game/done/04-observer-ui.md) — observer dashboard + config panel
- [briefs/game/done/05-village-and-farms.md](briefs/game/done/05-village-and-farms.md) — 5 regions, compass layout, pathfinder-driven travel
- [briefs/game/done/06-spatial-market.md](briefs/game/done/06-spatial-market.md) — market presence, encounters, shop daily slate
- [briefs/game/done/07-render-regions.md](briefs/game/done/07-render-regions.md) — draw the 40×40 world; unify on tile coords; delete decorate.ts
- [briefs/game/done/08-shop-slate-sales.md](briefs/game/done/08-shop-slate-sales.md) — slate-driven shop seed sales with limited daily stock
- [briefs/game/done/09-peer-meet-trades.md](briefs/game/done/09-peer-meet-trades.md) — peer seed trades via MEET; OFFER_SEED gains `direction`
- [briefs/game/done/10-trust-and-endgame.md](briefs/game/done/10-trust-and-endgame.md) — trust updates + Aggressive end-of-sim liquidation
- [briefs/game/done/11-focus-camera.md](briefs/game/done/11-focus-camera.md) — focus follow + free pan + sprite halo
- [briefs/game/done/12-live-leaderboard.md](briefs/game/done/12-live-leaderboard.md) — running standings panel
- [briefs/game/done/13-walking-animation.md](briefs/game/done/13-walking-animation.md) — 2-frame walk cycle per personality
- [briefs/game/done/14-meet-indicator.md](briefs/game/done/14-meet-indicator.md) — speech bubble over MEET'd farmers
- [briefs/game/done/15-slate-billboard.md](briefs/game/done/15-slate-billboard.md) — daily shop slate DOM panel
- [briefs/game/done/16-playback-controls.md](briefs/game/done/16-playback-controls.md) — pause / speed (1×/2×/4×) / step (worker control messages)
- [briefs/game/done/17-save-replay.md](briefs/game/done/17-save-replay.md) — seed+maxDays+ticksPerDay run descriptor; shareable run URL
- [briefs/game/done/18-seed-picker.md](briefs/game/done/18-seed-picker.md) — choose / randomize the seed on the home screen
- [briefs/game/done/19-decision-trace.md](briefs/game/done/19-decision-trace.md) — "why" — focused farmer's intention + reason ring buffer
- [briefs/game/done/20-event-feed.md](briefs/game/done/20-event-feed.md) — activity ticker narrating trades / auctions / weather
- [briefs/game/done/21-complete-auctions.md](briefs/game/done/21-complete-auctions.md) — English + FPSB auctions with real resolution (no null-winner stubs)
- [briefs/game/done/22-seasons-weather-arcs.md](briefs/game/done/22-seasons-weather-arcs.md) — 4×25-day seasons biasing weather + yields
- [briefs/game/done/23-fifth-personality-or-shock.md](briefs/game/done/23-fifth-personality-or-shock.md) — **done** (Direction B): one-time mid-game blight shock, deterministic, on-by-default

##### Shipped 2026-06-03 (grilling-session batch — see [log.md](log.md))

- [briefs/game/done/24-auction-bidding-golden-bean.md](briefs/game/done/24-auction-bidding-golden-bean.md) — agents bid; golden bean = rare/high-resale/giftable good (fixed the "no winner" dead feature)
- [briefs/game/done/25-panel-overlap-fix.md](briefs/game/done/25-panel-overlap-fix.md) — observer + activity feed share a right-column flex container
- [briefs/game/done/26-day-night-seasonal-grading.md](briefs/game/done/26-day-night-seasonal-grading.md) — **3a** render-side day/night + seasonal color wash (tick-synced)
- [briefs/game/done/27-long-days-intraday-timeline.md](briefs/game/done/27-long-days-intraday-timeline.md) — **3b** long days (ticksPerDay 1200); phased intra-day agent timeline + sleep; macro-economy stays day-denominated
- [briefs/game/done/28-ap-economy-rework.md](briefs/game/done/28-ap-economy-rework.md) — **3c** AP max 100 (+2/day), sleep-gated, free travel, tiered friend discounts, new cost table
- [briefs/game/done/29-irrigation-crop-death.md](briefs/game/done/29-irrigation-crop-death.md) — **3d** watering required; grace-windowed dryness; rain auto-waters; crops die from neglect
- [briefs/game/done/30-procedural-ground-texture.md](briefs/game/done/30-procedural-ground-texture.md) — subtle per-tile value-noise on the baked static layer

##### Shipped 2026-06-03 (visual + world + activity overhaul — see [log.md](log.md))

- [briefs/game/done/31-corpus-index-sync.md](briefs/game/done/31-corpus-index-sync.md) — corpus sync (resolved by this update)
- [briefs/game/done/32-rendering-overhaul.md](briefs/game/done/32-rendering-overhaul.md) — Y-sort, drop shadows, particles, 54-frame atlas redesign, walk/work/idle-bob animations
- [briefs/game/done/33-world-expansion.md](briefs/game/done/33-world-expansion.md) — 11 regions, blacksmith, carpentry, forest/quarry zones, tool system, decorations, home entities
- [briefs/game/done/35-player-activity.md](briefs/game/done/35-player-activity.md) — slower movement, action time cost, home/sleep routine, periodic market visits, debug player (WASD)

##### Shipped 2026-06-05 (spectator/story layer)

- [briefs/game/done/36-end-of-run-recap.md](briefs/game/done/36-end-of-run-recap.md) — Day-100 "Legends" wrap-up (standings + mid-season rank delta + per-farmer season arc + run headline); passive per-day `RunHistorySystem` + pure `summarizeRun`. **Done.**
- [briefs/game/done/37-rivalries-and-relationship-legibility.md](briefs/game/done/37-rivalries-and-relationship-legibility.md) — relationship-matrix panel + `RivalrySystem` (rivalry/alliance detection, feed lines, recap rivalries). **Done (plumbing) but DORMANT** — peer↔peer events never fire in live play so the trust matrix stays flat and no rivalries form; see [wiki/open-questions.md](wiki/open-questions.md) → "Peer-interaction layer is inert".
- [briefs/game/done/38-drama-scoring-and-narrative-escalation.md](briefs/game/done/38-drama-scoring-and-narrative-escalation.md) — per-event `drama` score (pure `drama.ts`, act-band weighted) → feed emphasis (★ + EDG.gold ≥0.7), rank-flip + race-on lines, max-drama recap headline. **Done.** (Live: rank-flip/race-on dormant — leader runs away; blight is the headline.)
- [briefs/game/done/39-wealth-over-time-graph.md](briefs/game/done/39-wealth-over-time-graph.md) — multi-line wealth-over-time chart with crossings marked; pure consumer of brief-36 history (live `wealthSeries` on the snapshot). **Done.**
- [briefs/game/done/40-thought-bubbles-and-highlight-skip.md](briefs/game/done/40-thought-bubbles-and-highlight-skip.md) — ambient intention bubbles + "skip to next highlight" (H) worker control + click-feed-to-zoom. **Done.** (Spectator layer 36–40 complete.)
- [briefs/game/done/47-split-atlas-into-specialized-sheets.md](briefs/game/done/47-split-atlas-into-specialized-sheets.md) — atlas split into 6 sheets (characters/buildings/terrain/crops/props/items-ui) + index; `atlasId` now load-bearing (renderer atlas map). **Done.**

#### Game — todo

Gameplay / content / world depth (queued 2026-06-05; **bold** scope — these change the determinism baseline by design, re-verify reproducibility; 41 is the spine others build on):

- [briefs/game/todo/41-crop-roster-and-quality-tiers.md](briefs/game/todo/41-crop-roster-and-quality-tiers.md) — 4–6 more season-locked crops + Normal/Silver/Gold quality tiers feeding sell price + net worth. **The spine.**
- [briefs/game/todo/42-livestock-and-orchards.md](briefs/game/todo/42-livestock-and-orchards.md) — coops/barns (counter-based herds → daily products) + perennial fruit orchards: a slow-burn parallel playstyle.
- [briefs/game/todo/43-greenhouse-and-farm-skill-progression.md](briefs/game/todo/43-greenhouse-and-farm-skill-progression.md) — year-round greenhouse + per-farm skills (farming/foraging/fishing/mining) that compound over the run.
- [briefs/game/todo/44-living-world-working-npcs-and-tavern.md](briefs/game/todo/44-living-world-working-npcs-and-tavern.md) — make the cosmetic carpenter/blacksmith fulfill real orders; add a tavern social hub; repurpose the dead notice board.
- [briefs/game/todo/45-seasonal-visual-identity-and-festivals.md](briefs/game/todo/45-seasonal-visual-identity-and-festivals.md) — season-variant tiles + rain/snow particles (the art ask) + scheduled festival days with contests/special markets.
- [briefs/game/todo/46-harbor-shipping-and-contracts.md](briefs/game/todo/46-harbor-shipping-and-contracts.md) — a harbor + time-boxed contracts + reputation: a demand-driven new playstyle axis (and a soft fix for the fixed-price-shop flatness).
