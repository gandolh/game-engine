# Architecture

## Workspaces

```
packages/
  engine/          @engine/core         — reusable engine
  sim-core/        @farm/sim-core        — the deterministic sim (Node-safe + browser-safe)
  farm-valley/     farm-valley          — the renderer (the game's client)
  wasm-modules/    @engine/wasm-modules — AssemblyScript sources
tools/
  atlas-builder    runtime sprite atlas
  run-sim          headless sim driver
  world-preview    offline snapshot viewer
```

Root [package.json](../../package.json) is an npm workspaces monorepo; all packages share TS config via [tsconfig.base.json](../../tsconfig.base.json).

**`@farm/sim-core` (brief 56)** holds the deterministic simulation — `bootstrapSim` + `systems/**`, `agents/**`, `world/**`, `economy/**`, `protocols/**`, `components/**`, the snapshot layer (`snapshot/`, `snapshot-builder/`), `render-systems/` (pure sprite-frame production, no DOM), and the transport-neutral message contract (`protocol/`, still using the historical `Worker*` names). It imports `@engine/core` (incl. the render barrel, for the EDG palette + sprite types — Node-safe because nothing instantiates a Canvas at module load) but **never** the renderer. It exposes TS source directly via subpath `exports` (no build step), like `@engine/core`. This was extracted so both the renderer and the future Node WS server (brief 57) can depend on the sim without the renderer in between.

## Layers

```
┌──────────────────────────────────────────────────────────┐
│  farm-valley/  main, screens, ui, render, worker/sim-    │  ← renderer (client)
│                client  (Canvas2D, DOM panels)            │
├──────────────────────────────────────────────────────────┤
│  @farm/sim-core  bootstrapSim · systems · agents · world │  ← deterministic sim
│                  economy · protocols · components ·      │    (Node + browser safe)
│                  snapshot · snapshot-builder · render-   │
│                  systems · protocol (message contract)   │
├──────────────────────────────────────────────────────────┤
│  @engine/core  ecs · sim · render · input · runtime ·    │  ← generic engine
│                assets · debug · wasm                      │
├──────────────────────────────────────────────────────────┤
│  @engine/wasm-modules  pathfinding.wasm (AssemblyScript) │  ← native-speed kernels
└──────────────────────────────────────────────────────────┘
```

Engine never imports game; the renderer (`farm-valley`) depends on `@farm/sim-core` for sim logic + the snapshot/message types; `@farm/sim-core` never imports the renderer. WASM artifacts are committed under `packages/farm-valley/public/wasm/` (the renderer fetches them) and built into `packages/wasm-modules/dist/` (sim-core's `travel.test.ts` + the Node server read the dist copy); fresh clones can `npm run dev` without first running `npm run build-wasm`.

**`@farm/server` (briefs 57–58)** is a second consumer of `@farm/sim-core`: a long-running Node process (`packages/server`, `ws` WebSocketServer, `npm run server`) that hosts the sim and bridges the `@farm/sim-core/protocol` message contract over a WebSocket. `SimHost` is the old worker tick-loop ported transport-agnostically (a `send(msg)` callback + `handleInbound(msg)` instead of `postMessage`/`onmessage`); one sim per connection; WASM pathfinder from `wasm-modules/dist`; drop-stale snapshot backpressure. **The renderer's `SimClient` is now a pure WebSocket client of this server** (brief 58) — the in-browser Web Worker is gone. `SimClient`'s public API was preserved, so the `main/*` consumers were untouched; only its transport changed (WebSocket frames instead of `postMessage`). Dev: `npm run dev` starts both the server and Vite; Vite proxies `/sim` → `ws://localhost:8787`. Prod: Caddy reverse-proxies `/farm-valley/sim` → the pm2-managed server (see [decisions.md](decisions.md) → Concurrency + the deploy section).

**Module-directory convention.** Large units are split into a directory of focused modules fronted by a barrel `index.ts` that re-exports the public surface (e.g. `systems/act/` → `system.ts` + `handlers/*` + `constants` + `index`; `components/` → per-domain type files + `index`; `agents/watering/` → per-domain `deliberate*` helpers + `index`). Consumers import the directory (`from "../components"`, `from "./act"`) and resolve to the barrel, so internal layout can change without touching importers. (Brief 58 removed the lone former exception — `worker/sim-worker.ts`, the Vite-URL-referenced Worker entry — since the sim no longer runs in the browser.)

## Sim loop

- **Fixed step**: 20 Hz tick (`FixedStepClock` in [runtime/](../../packages/engine/src/runtime/)). Render interpolates with an `alpha ∈ [0,1)`.
- **Runs in a Node server** (browser play): the sim lives in `@farm/server`'s `SimHost`, which owns the ECS `world` + clock and sends a `RenderSnapshot` per tick over a WebSocket; the browser ([worker/sim-client/](../../packages/farm-valley/src/worker/sim-client/)) renders + interpolates between the latest two snapshots. JSON over WS (no SharedArrayBuffer). The headless [run-sim](../../tools/run-sim/) and all tests still drive the sim directly in-process (no server). See [decisions.md](decisions.md) → Concurrency. *(Through brief 56 this ran in an in-browser Web Worker; briefs 57–58 moved it to the Node server.)*
- **Deterministic**: all randomness via seeded [`Rng`](../../packages/engine/src/runtime/rng.ts) (mulberry32 + named forks). No `Math.random` or `Date.now` in sim. Driving ticks from the server's `setInterval` doesn't affect this — the sim depends only on the tick count.
- **Save / replay / share**: a run is fully described by its seed + params (`ticksPerDay`/`maxDays`), captured in the [`run-descriptor`](../../packages/sim-core/src/run-descriptor.ts) and round-tripped through the URL hash (the "Share this run" button in the game-over screen). Because the sim is deterministic, the seed alone reproduces the run byte-for-byte — there is **no** input-log or snapshot-based save model. *(An engine-level `InputLog`/event-sourced persistence layer was once planned but never built; do not cite `packages/engine/src/persistence/` — it does not exist.)*

## ECS

In-house entity system at [packages/engine/src/ecs/world.ts](../../packages/engine/src/ecs/world.ts). Replaced miniplex (commit `020406d`) to drop the external dep while keeping the `spawn` / `query` / `despawn` API surface.

## Message bus

Generic pub/sub at [packages/engine/src/sim/message-bus.ts](../../packages/engine/src/sim/message-bus.ts). Messages carry `performative` + `ontology` + body — directly mirrors the Python SPADE FIPA-ACL format. Used by:
- Inter-agent CNP (Contract Net Protocol) for trade
- Market wall (post/read/cancel/buy offers)
- Shopkeeper (buy/sell, auctions)
- Weather station (broadcasts conditions + forecasts)
- Day clock (day-start, finish-day events)

## World layout

**88×80 tile archipelago** (`WORLD_WIDTH`/`WORLD_HEIGHT` in [world/regions.ts](../../packages/sim-core/src/world/regions.ts)) — islands joined by bridges, walkable tile count `2065` (guarded by `walkable-grid.test.ts`). Region bounds, placement, and the bridge tree are documented in [player-and-interaction.md](player-and-interaction.md) → archipelago layout; that page is the source of truth for tile geometry. Resource zones (forest/quarry) spawn trees/stones; all regions are BFS-verified reachable.

## Game data flow per tick

```
DayClock → Perceive → Deliberate → AP → TravelSystem → Act → Inbox-dispatch
                                                              → TileFeatures → Harvest → FinishDay
            (reads          (writes        (walks path)  (consumes
             inbox)         intentions)                  intentions)
```

Plus passive systems: WeatherSystem, CropGrowthSystem, MarketSystem, ShopkeeperSystem, AuctionSystem.

`TravelSystem` only registers when a `Pathfinder` is passed to `bootstrapSim`. In the browser the sim worker fetches the WASM bytes from `WorkerInitMsg.pathfinderWasm` and instantiates its own `Pathfinder` — zero-copy transfer. Headless `run-sim` and tests pass the pathfinder directly.

`TileFeatureSystem` runs once per new day — spawns trees/stones on farm tiles and in dedicated resource zones.

`ActSystem` sets `farmer.farmer.busyUntilTick` after physical actions; `PerceiveSystem` clears it when expired and re-arms deliberation.

## Render

Canvas2D ([packages/engine/src/render/canvas2d/](../../packages/engine/src/render/canvas2d/)) — replaced the planned WebGPU renderer in commit `5ac7f8d`.

Key render features:
- **Y-sort**: sprites sorted by `(layer, y)` each frame — overlap creates depth.
- **Shadow pass**: ground ellipses drawn before sprites with `multiply` blend.
- **Particle system**: `ParticleSystem` class — circles/rects/stars with alpha-fade + gravity, drawn in world space after sprites.
- **Static layer bake**: backdrop tiles baked once into an offscreen canvas; WASM noise generator fills the brightness grid (~8× faster than JS).
- **Walk/work/bob animation**: `walk-a`/`walk-b` while `farmer.path` is set, `/work` pose for physical actions, 1.5px idle bob.

Atlas: ~220 hand-crafted 16×16 pixel-art frames split across **6 sheets + an `index.json`** (characters/buildings/terrain/crops/props/items-ui) at `packages/farm-valley/public/atlas/`; `atlasId` is load-bearing (the renderer maps each frame to its sheet). Sheets are generated from pixel recipes in [tools/atlas-builder/src/recipes/](../../tools/atlas-builder/src/recipes/) (split into `base-recipes`, `templates`, `palette`, `sheet-map`).

## WASM

[packages/engine/src/wasm/](../../packages/engine/src/wasm/) wraps `WebAssembly.instantiate`, exposes `WasmHeap` typed-array views. Four typed kernels (all AssemblyScript, artifacts committed):

| Module | Size | Purpose |
|---|---|---|
| `pathfinding.wasm` | ~1.6 KB | 4-connected A* grid pathfinding — **load-bearing** in `TravelSystem` |
| `noise.wasm` | 671 B | Value-noise brightness fill for static-layer bake (~8× faster than JS) |
| `rng.wasm` | 603 B | Mulberry32 batch float fill |
| `floodfill.wasm` | 836 B | BFS flood-fill, returns reachable tile coordinates |

All kernels export via `@engine/core`. The pathfinder bytes are transferred to the sim worker at init time (`WorkerInitMsg.pathfinderWasm`) so the worker can instantiate its own `Pathfinder` without sharing memory.
