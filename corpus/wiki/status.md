# Project Status

Snapshot of where the Farm Valley engine + game sit relative to the task briefs in [../briefs/](../briefs/). As of 2026-05-29.

## Engine tasks

| Brief | Status | Notes |
|---|---|---|
| [01-tilemap](../briefs/engine/superseded/01-tilemap.md) | **Superseded** | WebGPU renderer was removed; Canvas2D took over. No `tilemap.ts` / `tilemap-shader.ts` shipped. If a tile layer is needed, it'll be a new Canvas2D-shaped brief. |
| [02-input](../briefs/engine/done/02-input.md) | **Done** | [packages/engine/src/input/](../../packages/engine/src/input/) — keyboard, mouse, input-manager + tests. |
| [03-tests](../briefs/engine/done/03-tests.md) | **Done** | All required suites exist: clock, rng, input-log, message-bus, world, event-log. |
| [04-spatial-anim](../briefs/engine/done/04-spatial-anim.md) | **Done** | [spatial/](../../packages/engine/src/spatial/) and [animation/](../../packages/engine/src/animation/) with tests. |
| [05-pathfinder-into-movement](../briefs/engine/done/05-pathfinder-into-movement.md) | **Done** | Audit confirmed the WASM pathfinder is load-bearing (`TravelSystem.findPath` on the real walkable grid, waypoint-by-waypoint travel). Added a game-grid around-obstacle test; fixed the stale "loaded but unused" docs. No source change needed. |
| [07-chunked-tile-layer](../briefs/engine/done/07-chunked-tile-layer.md) | **Done** | `Canvas2dRenderer.bakeStaticLayer` bakes the static backdrop (tiles + fences + plot dirt) once into an offscreen canvas, blitted under the per-frame dynamic queue. Chunking not needed at 40×40. Profile gate waived by user. |

Still open: [06-determinism-harness-and-analytics](../briefs/engine/todo/06-determinism-harness-and-analytics.md) (CI determinism check + run-sim CSV export).

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

Still in [../briefs/game/todo/](../briefs/game/todo/): **16** playback-controls, **17** save-replay, **18** seed-picker, **19** decision-trace, **20** event-feed, **21** complete-auctions, **22** seasons-weather-arcs.

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
