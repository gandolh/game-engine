# Project Status

Snapshot of where the Farm Valley engine + game sit relative to the task briefs in [../briefs/](../briefs/). As of 2026-06-03. Briefs 01–23 are all in `done/` or `superseded/`. **A grilling session on 2026-06-03 filed 8 new briefs (24–31) into `todo/`** — see [§ Now in todo](#now-in-todo) below.

## Engine tasks

| Brief | Status | Notes |
|---|---|---|
| [01-tilemap](../briefs/engine/superseded/01-tilemap.md) | **Superseded** | WebGPU renderer was removed; Canvas2D took over. No `tilemap.ts` / `tilemap-shader.ts` shipped. If a tile layer is needed, it'll be a new Canvas2D-shaped brief. |
| [02-input](../briefs/engine/done/02-input.md) | **Done** | [packages/engine/src/input/](../../packages/engine/src/input/) — keyboard, mouse, input-manager + tests. |
| [03-tests](../briefs/engine/done/03-tests.md) | **Done** | All required suites exist: clock, rng, input-log, message-bus, world, event-log. |
| [04-spatial-anim](../briefs/engine/done/04-spatial-anim.md) | **Done** | [spatial/](../../packages/engine/src/spatial/) and [animation/](../../packages/engine/src/animation/) with tests. |
| [05-pathfinder-into-movement](../briefs/engine/done/05-pathfinder-into-movement.md) | **Done** | Audit confirmed the WASM pathfinder is load-bearing (`TravelSystem.findPath` on the real walkable grid, waypoint-by-waypoint travel). Added a game-grid around-obstacle test; fixed the stale "loaded but unused" docs. No source change needed. |
| [07-chunked-tile-layer](../briefs/engine/done/07-chunked-tile-layer.md) | **Done** | `Canvas2dRenderer.bakeStaticLayer` bakes the static backdrop (tiles + fences + plot dirt) once into an offscreen canvas, blitted under the per-frame dynamic queue. Chunking not needed at 40×40. Profile gate waived by user. |

| [06-determinism-harness-and-analytics](../briefs/engine/done/06-determinism-harness-and-analytics.md) | **Done** | `tools/run-sim` gained two env/flag-gated modes (default human output unchanged): `CHECK_DETERMINISM=1`/`--check-determinism` runs each seed twice and reports MATCH/DIVERGE with a non-zero exit on divergence (`SEEDS=a,b,c` for a sweep); `EXPORT=csv`/`json` dumps per-day per-farmer rows (day,name,personality,gold,unsold,total,weather), to `EXPORT_FILE` or stdout. Regression guard lives in [sim-bootstrap.test.ts](../../packages/farm-valley/src/sim-bootstrap.test.ts) (run-sim has no vitest). Verified MATCH across seeds 0xc0ffee/1/42 over the full 100-day run. |

## Game tasks

| Brief | Status | Notes |
|---|---|---|
| [01-personalities](../briefs/game/done/01-personalities.md) | **Done** | aggressive, hoarder (+ CNP coordinator), opportunist all registered with tests. |
| [02-weather-crops](../briefs/game/done/02-weather-crops.md) | **Done** | weather-station, weather, crop-growth, ap all in [systems/](../../packages/farm-valley/src/systems/) + tests. |
| [03-market-shop](../briefs/game/done/03-market-shop.md) | **Done** | market, shopkeeper, auction systems + spawners + tests. |
| [04-observer-ui](../briefs/game/done/04-observer-ui.md) | **Done** | [ui/](../../packages/farm-valley/src/ui/) ships observer, config-panel, dom helpers + tests. |
| [05-village-and-farms](../briefs/game/done/05-village-and-farms.md) | **Done** | 5 regions (4 farms N/E/S/W + village), 40×40 tile grid, walkable grid, `TravelSystem` consuming `travel` intents through the WASM pathfinder. Loaded but unused → now load-bearing. |
| [06-spatial-market](../briefs/game/done/06-spatial-market.md) | **Done** | Market presence enforced; 4 personalities plan trips; EncounterSystem emits MEET pairs; ShopSlateSystem generates 5-offer daily slate. The earlier "partial" gaps closed by 08 and 09. |
| [07-render-regions](../briefs/game/done/07-render-regions.md) | **Done** | Renderer draws the 40×40 tile world: grass/dirt/path + farm fences. All Transforms in tile coords; renderer converts at draw. `decorate.ts` deleted. Observer shows region per farmer. Camera 640×640. |
| [11-focus-camera](../briefs/game/done/11-focus-camera.md) | **Done** | Clickable observer rows + free pan + scroll-wheel zoom + sprite halo on the focused farmer. Camera follows the chosen farmer until Reset View. |
| [12-live-leaderboard](../briefs/game/done/12-live-leaderboard.md) | **Done** | Ambient standings panel updates each frame (no more waiting until day 100). Bottom-left corner. |
| [13-walking-animation](../briefs/game/done/13-walking-animation.md) | **Done** | 2-frame walk cycle (`walk-a` / `walk-b`) per personality while `farmer.path` is set. Atlas grew to 28 frames. |
| [14-meet-indicator](../briefs/game/done/14-meet-indicator.md) | **Done** | `MeetIndicatorSystem` snoops farmer inboxes; renders the new `indicator/meet` speech bubble over both farmers for 10 ticks per pair. |
| [15-slate-billboard](../briefs/game/done/15-slate-billboard.md) | **Done** | Bottom-right DOM panel showing the shop's daily slate (crop / unit price / remaining stock). Updates per render frame. |
| [08-shop-slate-sales](../briefs/game/done/08-shop-slate-sales.md) | **Done** | ShopkeeperSystem.SELL now consumes the daily slate cheapest-first; rejects with `no-matching-offer` / `insufficient-stock`. BUY (crop sales to shop) stays fixed-price + unlimited. (The `act.ts` `buy-seed` bypass noted here as a follow-up was resolved 2026-05-29 — it now routes through `ONT_SHOP.SELL`.) |
| [09-peer-meet-trades](../briefs/game/done/09-peer-meet-trades.md) | **Done** | EncounterTradeSystem dispatches personality initiate/respond hooks on MEET. OFFER_SEED gains a `direction` field. Hannah initiates radish buy on encounter; all four personalities have respond hooks. ACCEPT/DECLINE left in inboxes for TrustSystem to snoop. |
| [10-trust-and-endgame](../briefs/game/done/10-trust-and-endgame.md) | **Done** | TrustSystem snoops farmer inboxes + market wall for ACCEPT/DECLINE/TRADE_COMPLETED and CNP coordinators for broken commitments; applies ±0.05 / -0.10 deltas, clamp [0, 1]. DayClock publishes `daysRemaining`; Aggressive liquidates all crops when `<= 2`. |
| [23-fifth-personality-or-shock](../briefs/game/done/23-fifth-personality-or-shock.md) | **Done** | Direction B: `ShockSystem` fires a deterministic one-time blight on the run midpoint, wiping a crop-holding farmer's planted plots and broadcasting `ONT_SIMULATION.SHOCK`. On-by-default; `bootstrapSim({ shock })` to tune/disable. A fifth personality was *not* added. |

| [16-playback-controls](../briefs/game/done/16-playback-controls.md) | **Done** | Pause / 1×·2×·4× speed / single-step, implemented as **worker control messages** (`pause`/`speed`/`step` added to `WorkerInbound`) since the sim lives in the Web Worker — not a `GameLoop` hook. The worker's tick body is factored into `runOneTick()`; speed runs N ticks per interval fire, pause skips the body, step runs exactly one. `SimClient.setPaused/setSpeed/step`; new [ui/playback-controls.ts](../../packages/farm-valley/src/ui/playback-controls.ts) panel; keyboard space/`.`/`1`/`2`/`4` (ignores the seed input). Determinism preserved — only wall-clock pacing changes, tick count drives state. |
| [17-save-replay](../briefs/game/done/17-save-replay.md) | **Done** | New [run-descriptor.ts](../../packages/farm-valley/src/run-descriptor.ts): `RunDescriptor {seed,maxDays,ticksPerDay}` with pure `serializeRun`/`parseRun` (compact `seed-maxDays-ticksPerDay` hex, `#run=…` hash). Boot reads the hash and prefills the seed picker + carries maxDays/ticksPerDay; game-over panel got a "Share this run" button (sets the hash, copies the URL, shows `Run #<seed>`). The pre-worker `void inputLog` dead code was already gone — not resurrected (no sim-affecting external inputs exist yet; noted as the future extension point). |
| [18-seed-picker](../briefs/game/done/18-seed-picker.md) | **Done** | Home screen gained a seed field (hex `0x…` or decimal, robust parse → default `0xc0ffee`) + a Randomize button (`Math.random` confined to this pre-sim UI handler). `onStartClicked` now passes the chosen seed → `client.init`. Seed shown via a corner badge during play and on the game-over header. Engine `DebugOverlay` untouched. |
| [19-decision-trace](../briefs/game/done/19-decision-trace.md) | **Done** | New game-side `decisionTrace?: { reasons: string[] }` on `GameEntity` (ring buffer, last 3), recorded at each intention push inside the four `deliberate*` personality fns with terse consistent strings. Plumbed through `buildObserverSnapshot` (current + next intention + reasons); the observer renders the "why" block for the **focused** farmer only (brief-11 focus). |
| [20-event-feed](../briefs/game/done/20-event-feed.md) | **Done** | New [systems/event-feed.ts](../../packages/farm-valley/src/systems/event-feed.ts) — a passive read-only snoop (TrustSystem placement: after InboxDispatch, before Perceive clears inboxes) capturing `TRADE_COMPLETED` / `AUCTION_RESULT` / `ENCOUNTER.ACCEPT` / `SHOCK` off the market wall + farmer inboxes, deduped by stable key, deterministic per-tick ordering. Surfaced via `BootedSim.eventFeed` → `buildRenderSnapshot` → `RenderSnapshot.events` → `SimClient.events` → new [ui/event-feed-panel.ts](../../packages/farm-valley/src/ui/event-feed-panel.ts) (newest-first, capped 30). Shock surfaced once (no double-count with the existing `snapshot.shock` banner). |
| [21-complete-auctions](../briefs/game/done/21-complete-auctions.md) | **Done** (machinery) | `english` and `fpsb` auctions now have real state + resolution (no more Vickrey-shell fallthrough → null winner). FPSB: highest bid above reserve wins, pays own bid, deterministic tie-break (amount → earliest `tickReceived` → lowest bidder id). English: ascending clock anchored on first observation (Dutch pattern), `EnglishAuctionOptions {incrementPerTick, noBidTimeout}`, closes on timeout/`closesAtTick`, last affirming bidder wins at the current ask. **⚠️ Dead on the field:** a live 100-day run (Playwright, 2026-06-03) shows every shopkeeper auction closing "no winner" — **no agent ever bids** (the `golden_bean` prize has no in-sim value). The format machinery is correct + tested; the gameplay wiring is missing. Fix tracked in [game/24](../briefs/game/todo/24-auction-bidding-golden-bean.md). |
| [22-seasons-weather-arcs](../briefs/game/done/22-seasons-weather-arcs.md) | **Done** | 100-day run split into four 25-day seasons (`seasonForDay`, pure). Each biases the weather draw — spring mild/wet, summer hot/drought-prone, autumn balanced, winter harsh — flowing through the existing weather multipliers into crop yields (no separate yield table). Forecasts soften toward the season trend so agents can plan. Season stamped on the station + broadcast + beliefs, surfaced in the observer header (`Day N — Season`). Deterministic on `(seed, day)`. |

## Now in todo

Filed 2026-06-03 from a grilling session that ran the app under Playwright, reviewed status, and stress-tested 5 improvement ideas — which expanded to 8 briefs as the day/night idea unfolded into a gameplay redesign. None implemented yet; these are specs.

| Brief | Status | Notes |
|---|---|---|
| [24-auction-bidding-golden-bean](../briefs/game/todo/24-auction-bidding-golden-bean.md) | **Todo** | Make agents actually bid (fixes the brief-21 "no winner" gap). `golden_bean` becomes a rare/high-resale/giftable status good; per-personality valuation; Vickrey tie-break hardened; `OFFER_BEAN` gift handshake → trust. **Independent — ship first.** |
| [25-panel-overlap-fix](../briefs/game/todo/25-panel-overlap-fix.md) | **Todo** | Observer + activity feed both anchor top-right and overlap. Fix: shared right-column flex container that reflows when the observer grows. **Independent — ship first.** |
| [26-day-night-seasonal-grading](../briefs/game/todo/26-day-night-seasonal-grading.md) | **Todo (3a)** | Render-side day/night + seasonal color wash, tick-synced, season modulates palette + daylight length. Book-of-Shaders *math* reimplemented in Canvas2D (not its GLSL/code). **Ships with 27** (strobes at the current 1-sec day). |
| [27-long-days-intraday-timeline](../briefs/game/todo/27-long-days-intraday-timeline.md) | **Todo (3b)** | 1 day = 5 min (ticksPerDay 20→6000). Phased intra-day agent timeline (wake/work/evening/sleep) with live re-deliberation; sleep penalty. **Macro-economy stays day-denominated.** Decouples the deliberation FSM from the day boundary — the gating change. |
| [28-ap-economy-rework](../briefs/game/todo/28-ap-economy-rework.md) | **Todo (3c)** | AP max 100 (+2/day), sleep-gated (half if unrested), free travel (time-throttled), tiered friend discounts on trades, full new cost table + `sell-from-wall` cost-0 bug fix. **Requires 27.** |
| [29-irrigation-crop-death](../briefs/game/todo/29-irrigation-crop-death.md) | **Todo (3d)** | Watering required: grace-windowed dryness (`daysSinceWater`), rain auto-waters, crops die after 2 dry days, survival-reflex watering per personality. **The one intentional crop-economy change.** Requires 27 + 28. |
| [30-procedural-ground-texture](../briefs/game/todo/30-procedural-ground-texture.md) | **Todo** | Subtle per-tile value-noise brightness on the baked static layer (kills the flat solid-color look). Seed-deterministic, one-time bake. Book-of-Shaders *math*, reimplemented. **Independent.** |
| [31-corpus-index-sync](../briefs/game/todo/31-corpus-index-sync.md) | **In progress** | This sync (fix the stale `index.md` todo/done drift + register 24–31). |

**Dependency chain:** 24 & 25 independent (ship first) · 26 ships with 27 · 27 → 28 → 29 (strict) · 30 & 31 independent.

> ⚠️ **Note on 27–29:** these are a genuine gameplay redesign. All of briefs 01–23 were built against the *one-decision-per-day* model; a continuous-ish intra-day timeline with a real AP economy and crop death will require rebalancing. Each brief fences its determinism/save-format risks, but expect the 100-day balance to shift.

## Post-corpus work (delivered, never had a brief)

- **Canvas2D renderer** replacing the planned WebGPU pipeline — [packages/engine/src/render/canvas2d.ts](../../packages/engine/src/render/canvas2d.ts). WebGPU code was deleted in commit `5ac7f8d`.
- **In-house ECS** replacing miniplex — [packages/engine/src/ecs/world.ts](../../packages/engine/src/ecs/world.ts). Removed external dep, kept the same `spawn` / `query` / `despawn` surface (commit `020406d`).
- **WASM pathfinding infrastructure** — new workspace [packages/wasm-modules/](../../packages/wasm-modules/) (AssemblyScript → `pathfinding.wasm`) consumed by [packages/engine/src/wasm/](../../packages/engine/src/wasm/) (`loader`, `memory`, `Pathfinder` class). Built artifacts committed under `packages/farm-valley/public/wasm/`. Load-bearing in `TravelSystem` (see brief 05).
- **Sim in a Web Worker** — [packages/farm-valley/src/worker/](../../packages/farm-valley/src/worker/). The Worker owns the ECS world + clock and posts a `RenderSnapshot` per tick; the main thread interpolates + renders. `postMessage` only (no SharedArrayBuffer). Determinism preserved. See [decisions.md](decisions.md) → Concurrency.
- **Home screen** — pre-sim overlay with Start CTA — [packages/farm-valley/src/screens/home-screen.ts](../../packages/farm-valley/src/screens/home-screen.ts).
- **Headless sim runner** — [tools/run-sim](../../tools/run-sim/) (`npm run sim`), runs the deterministic sim with no renderer (no Worker); narrates the mid-game shock.
- **Offline world preview** — [tools/world-preview](../../tools/world-preview/) (`npm run preview`), static snapshot viewer; rewritten 2026-05-29 to render the real 40×40 region world from the shared layout.
- **README + screenshots** at repo root.

## Open gaps

See [open-questions.md](open-questions.md) for the live list.
