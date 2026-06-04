# Project Status

Snapshot of where the Farm Valley engine + game sit relative to the task briefs in [../briefs/](../briefs/). As of 2026-06-04. All briefs (01–35 + engine 01–08) are in `done/` or `superseded/`; the latest work (the playable character **Pip** + interaction systems) shipped without a brief — see [§ Shipped 2026-06-04](#shipped-2026-06-04-player--interaction-no-briefs) and [player-and-interaction.md](player-and-interaction.md).

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
| [21-complete-auctions](../briefs/game/done/21-complete-auctions.md) | **Done** (machinery) | `english` and `fpsb` auctions now have real state + resolution (no more Vickrey-shell fallthrough → null winner). FPSB: highest bid above reserve wins, pays own bid, deterministic tie-break (amount → earliest `tickReceived` → lowest bidder id). English: ascending clock anchored on first observation (Dutch pattern), `EnglishAuctionOptions {incrementPerTick, noBidTimeout}`, closes on timeout/`closesAtTick`, last affirming bidder wins at the current ask. **Was dead on the field** (every auction closed "no winner" — no agent bid, the `golden_bean` had no value) — **resolved 2026-06-03 by [game/24](../briefs/game/done/24-auction-bidding-golden-bean.md)**: the bean is now valuable and all four personalities bid. Live runs show 20/20 auctions producing winners. |
| [22-seasons-weather-arcs](../briefs/game/done/22-seasons-weather-arcs.md) | **Done** | 100-day run split into four 25-day seasons (`seasonForDay`, pure). Each biases the weather draw — spring mild/wet, summer hot/drought-prone, autumn balanced, winter harsh — flowing through the existing weather multipliers into crop yields (no separate yield table). Forecasts soften toward the season trend so agents can plan. Season stamped on the station + broadcast + beliefs, surfaced in the observer header (`Day N — Season`). Deterministic on `(seed, day)`. |

## Shipped 2026-06-03 (briefs 24–30)

Filed from a grilling session (Playwright review of the live app + the Book-of-Shaders question), where 5 improvement ideas expanded into a gameplay redesign. **All 7 implemented, tested, verified live, and merged to `main`** (`Merge briefs 24-30`). 489 tests pass (398 farm-valley + 91 engine); typecheck clean; determinism MATCHes across seeds 0xc0ffee/1/42 at the live `ticksPerDay=1200`.

| Brief | Status | Notes (as shipped) |
|---|---|---|
| [24-auction-bidding-golden-bean](../briefs/game/done/24-auction-bidding-golden-bean.md) | **Done** | Fixes the brief-21 "no winner" dead feature — agents now bid (per-personality valuation via `agents/bean-valuation.ts`; Vickrey tie-break hardened with a final bidderId key). `golden_bean` is a rare inventory good: win → resell to shop at reserve×3, or gift on MEET (`OFFER_BEAN`) for a +0.20 trust delta. **Auction duration was bumped 20→25 ticks** (later ×1.5/day) so a day-gated agent gets a deliberation cycle to bid. Live: 20/20 auctions win, 0 no-winner. |
| [25-panel-overlap-fix](../briefs/game/done/25-panel-overlap-fix.md) | **Done** | Observer + activity feed now share one fixed right-edge flex column ([ui/right-column.ts](../../packages/farm-valley/src/ui/right-column.ts)); the feed reflows below the observer instead of being covered. |
| [26-day-night-seasonal-grading](../briefs/game/done/26-day-night-seasonal-grading.md) | **Done (3a)** | Render-side day/night + seasonal wash ([render/day-night.ts](../../packages/farm-valley/src/render/day-night.ts) → engine `endFrame(wash?)`). Tick-synced sun curve + per-season palette/daylight length. Render-only, deterministic, sim untouched. Shipped with 27. |
| [27-long-days-intraday-timeline](../briefs/game/done/27-long-days-intraday-timeline.md) | **Done (3b)** | **`ticksPerDay` default 20→1200** (1 real min/day; not 6000 as originally specced — 6000 is the documented Stardew target, selectable via the run hash). Intra-day phases ([systems/day-phase.ts](../../packages/farm-valley/src/systems/day-phase.ts)) drive the FSM via `PHASE_START`; new `SLEEP` state; AP refill moved to the morning wake. Macro-economy stays day-denominated — final gold IDENTICAL at ticksPerDay 20 vs 1200. |
| [28-ap-economy-rework](../briefs/game/done/28-ap-economy-rework.md) | **Done (3c)** | `maxApForDay(day)=100+2·day`, sleep-gated (½ if unrested), free travel, tiered friend discount on trade-init (≥0.7→1 / ≥0.5→2 / else 3 AP), new cost table. **Fixed the `sell-from-wall` cost-0 bug.** |
| [29-irrigation-crop-death](../briefs/game/done/29-irrigation-crop-death.md) | **Done (3d)** | Watering required: `daysSinceWater` + 2-day grace, rain (rainy/storm) auto-waters, crops wither past grace ([systems/crop-growth.ts](../../packages/farm-valley/src/systems/crop-growth.ts) + `CROP_DEATH` event). Survival-reflex watering per personality via [agents/watering.ts](../../packages/farm-valley/src/agents/watering.ts), fed by new [systems/plot-sense.ts](../../packages/farm-valley/src/systems/plot-sense.ts). In practice agents keep crops alive → ~0 deaths (death is unit-tested). |
| [30-procedural-ground-texture](../briefs/game/done/30-procedural-ground-texture.md) | **Done** | Per-tile value-noise brightness baked into the static layer ([render/ground-noise.ts](../../packages/farm-valley/src/render/ground-noise.ts) → engine `bakeStaticLayer(...,decorate?)`). Seed-deterministic, one-time bake. |

**Two latent bugs fixed in passing:** `EncounterTradeSystem` was never registered in the scheduler after the Worker migration (so peer seed trades AND bean gifts were dead live) — now registered; and `sell-from-wall` silently cost 0 AP.

### Deltas from the original specs (worth knowing)

- **Day length is 1200 ticks (1 min), not 6000 (5 min).** Chosen for watchability/CI; 6000 is documented and run-hash-selectable. The run-sim tool still defaults to 20 for fast CI (determinism holds at any value).
- **The "intra-day rebalancing" warned about did NOT materialize.** Because the day stayed the economic unit and the AP/watering survival reflexes keep agents productive, 100-day outcomes are essentially unchanged from the pre-redesign baseline. Determinism held across the whole chain.
- **Crop death rarely fires in normal play** — the survival reflex is effective. Death has teeth (unit-tested) but only bites an AP-starved/stranded agent.

Brief [31-corpus-index-sync](../briefs/game/todo/31-corpus-index-sync.md) (this doc sync) is the only one left in `todo/` and is being applied now.

## Shipped 2026-06-03 (briefs 32–35 + engine 08)

Full visual, world, and agent-activity overhaul. All implemented, tested, and verified live.

| Brief | Status | Notes |
|---|---|---|
| [32-rendering-overhaul](../briefs/game/done/32-rendering-overhaul.md) | **Done** | Y-sort depth ordering, drop shadows (`multiply` blend), `ParticleSystem`, improved 54-frame pixel-art atlas, walk/work/idle-bob animations, `action` field on `SnapshotSprite`. Reverted wrong ySquash/depth-scale (genre uses pure orthographic). |
| [33-world-expansion](../briefs/game/done/33-world-expansion.md) | **Done** | 11 walkable regions (was 5): blacksmith, carpentry, forest-north/south, quarry-north/south. Tool system (hoe/axe/pickaxe, wooden→stone→iron, durability, AP cost). Watering can (10 charges, refill at farm fountain). Resource drops (wood/stone/iron-ore/geode). Farm decorations boost crop yield (+10% to +30%, capped +75%). Plot decay after 5 dry days. Home entity per farm. 1257 walkable tiles. |
| [engine/08-wasm-expansion](../briefs/engine/done/08-wasm-expansion.md) | **Done** | Three new WASM modules: `noise.wasm` (value-noise fill, ~8× faster than JS), `rng.wasm` (Mulberry32 batch), `floodfill.wasm` (BFS reachable tiles). **Critical bug fixed**: pathfinder WASM was never transferred to the sim worker → `TravelSystem` was never active → farmers never moved. Fixed by transferring bytes via `WorkerInitMsg.pathfinderWasm`. |
| [35-player-activity](../briefs/game/done/35-player-activity.md) | **Done** | Slower movement (STEP_TICKS 5→8). `busyUntilTick` action time cost (3s/2s/1s by tier). Home/sleep routine — all farmers travel home at evening. Periodic market visit every 3 days. Early village visit day 0–1. Debug player (WASD, cyan diamond, checks `isWalkable`). `Keyboard` exported from `@engine/core`. |

### Key decisions made during this batch

- **Orthographic projection confirmed** (research): Stardew Valley and the genre use pure top-down orthographic — depth via Y-sort overlap, not perspective foreshortening. Previous ySquash/depth-scale experiment reverted.
- **Pathfinder was never wired** (latent bug found): The pathfinder was loaded in the main render thread but never transferred to the sim worker. `TravelSystem` requires it and was silently skipped. Fixed by zero-copy `ArrayBuffer` transfer.
- **Forest/quarry zones type-locked**: forest-* zones spawn trees only, quarry-* zones spawn stones only (not mixed). Farmers can travel to them when their farm is depleted.
- **Brief 31 (corpus sync)** is resolved by this update — moved to done.

## Post-corpus work (delivered, never had a brief)

- **Canvas2D renderer** replacing the planned WebGPU pipeline — [packages/engine/src/render/canvas2d.ts](../../packages/engine/src/render/canvas2d.ts). WebGPU code was deleted in commit `5ac7f8d`.
- **In-house ECS** replacing miniplex — [packages/engine/src/ecs/world.ts](../../packages/engine/src/ecs/world.ts). Removed external dep, kept the same `spawn` / `query` / `despawn` surface (commit `020406d`).
- **WASM pathfinding infrastructure** — new workspace [packages/wasm-modules/](../../packages/wasm-modules/) (AssemblyScript → `pathfinding.wasm`) consumed by [packages/engine/src/wasm/](../../packages/engine/src/wasm/) (`loader`, `memory`, `Pathfinder` class). Built artifacts committed under `packages/farm-valley/public/wasm/`. Load-bearing in `TravelSystem` (see brief 05).
- **Sim in a Web Worker** — [packages/farm-valley/src/worker/](../../packages/farm-valley/src/worker/). The Worker owns the ECS world + clock and posts a `RenderSnapshot` per tick; the main thread interpolates + renders. `postMessage` only (no SharedArrayBuffer). Determinism preserved. See [decisions.md](decisions.md) → Concurrency.
- **Home screen** — pre-sim overlay with Start CTA — [packages/farm-valley/src/screens/home-screen.ts](../../packages/farm-valley/src/screens/home-screen.ts).
- **Headless sim runner** — [tools/run-sim](../../tools/run-sim/) (`npm run sim`), runs the deterministic sim with no renderer (no Worker); narrates the mid-game shock.
- **Offline world preview** — [tools/world-preview](../../tools/world-preview/) (`npm run preview`), static snapshot viewer; rewritten 2026-05-29 to render the real 40×40 region world from the shared layout.
- **README + screenshots** at repo root.

## Shipped 2026-06-04 (player + interaction; no briefs)

Post-brief-35 work delivered directly in working sessions (no formal brief). Full synthesis in [player-and-interaction.md](player-and-interaction.md). Verified live (Playwright); typecheck clean; full suite green; determinism MATCHes.

- **Pip — playable 5th farmer.** Keyboard-controlled farmer entity (`personality.kind: "pip"` + `player` component); intentions come from input via [`PlayerControlSystem`](../../packages/farm-valley/src/systems/player-control.ts) instead of `DeliberateSystem` (which skips it). WASD/arrows move (not AP-gated), Space/E acts, P pauses. The world is now an **88×80 archipelago** (every zone an isolated island, bridge-connected); Pip's farm is the top island and the four AI farms sit in the corners — see [player-and-interaction.md](player-and-interaction.md).
- **Hotbar action dispatch.** `HOTBAR_SLOTS` (1 Can · 2 Hoe · 3 Axe · 4 Pickaxe · 5 Radish · 6 Wheat · 7 Pumpkin); number keys 1–7 select; Space uses the selected slot. Replaced the `1/2/4` speed hotkeys (speed now sidebar-only).
- **Hover tooltips** — name + description for farmers, structures/NPCs, fountains, farmhouses, trees, stones, and crops.
- **Feature collision** — [`FeatureCollisionSystem`](../../packages/farm-valley/src/systems/feature-collision.ts) blocks tree/stone tiles on the shared pathfinder grid each tick so farmers route around them; the player is blocked via `featureAt`.
- **Bridges** — road tiles spanning water render as `tile/bridge-h` (rotated for vertical spans) via `computeBridges()`, not a flat dirt path.
- **Craft-NPC idle pose** — blacksmith/carpenter use an `idlePose` at pose-less stations (e.g. the oven) so they no longer revert to the building sprite.
- **Plot layout** — 2×2 grid spaced ≥2 cells apart (`PLOT_OFFSETS`); Pip starts on its first plot.
- **Fishing** — destination activity at a new 8×8 **fishing isle** (sand, bridged S of the mill). `fish` action (1 AP, random 5–30 s, minnow/bass/salmon = 1/3/5 gold). Rarity tilts on **bubble spots** that drift daily around the isle (`BubbleSystem`); casting next to one favours rare fish. One durability-free rod (hotbar slot 5). **AI opportunist + aggressive fish too** (changed the determinism baseline; re-verified MATCH ×3 seeds). See [player-and-interaction.md](player-and-interaction.md) → Fishing.
- **Carpentry floor → stone** (`tile/carpentry-floor`); **more decoration props** (`barrel`/`crate`/`potted-plant`/`lamp-post`/`signpost`/`hay-bale`/`bush`/`log-stack`) scattered as visual-only dressing. Atlas now 157 frames.

## Open gaps

See [open-questions.md](open-questions.md) for the live list.
