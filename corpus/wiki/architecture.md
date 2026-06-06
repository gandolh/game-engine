# Architecture

## Workspaces

```
packages/
  engine/          @engine/core         — reusable engine
  farm-valley/     farm-valley          — the game
  wasm-modules/    @engine/wasm-modules — AssemblyScript sources
tools/
  atlas-builder    runtime sprite atlas
  run-sim          headless sim driver
  world-preview    offline snapshot viewer
```

Root [package.json](../../package.json) is an npm workspaces monorepo; `engine` and `farm-valley` share TS config via [tsconfig.base.json](../../tsconfig.base.json).

## Layers

```
┌──────────────────────────────────────────────────────────┐
│  farm-valley/  agents, systems, screens, ui, protocols   │  ← game-specific
├──────────────────────────────────────────────────────────┤
│  @engine/core  ecs · sim · render · input · runtime ·    │  ← generic engine
│                animation · spatial · wasm · persistence  │
├──────────────────────────────────────────────────────────┤
│  @engine/wasm-modules  pathfinding.wasm (AssemblyScript) │  ← native-speed kernels
└──────────────────────────────────────────────────────────┘
```

Engine never imports game; game never imports another game package. WASM artifacts are committed under `packages/farm-valley/public/wasm/` so fresh clones can `npm run dev` without first running `npm run build-wasm`.

**Module-directory convention.** Large units are split into a directory of focused modules fronted by a barrel `index.ts` that re-exports the public surface (e.g. `systems/act/` → `system.ts` + `handlers/*` + `constants` + `index`; `components/` → per-domain type files + `index`; `agents/watering/` → per-domain `deliberate*` helpers + `index`). Consumers import the directory (`from "../components"`, `from "./act"`) and resolve to the barrel, so internal layout can change without touching importers. The one exception is `worker/sim-worker.ts`, which stays a single file because Vite references it by URL (`new Worker(new URL("../sim-worker.ts", …))`).

## Sim loop

- **Fixed step**: 20 Hz tick (`FixedStepClock` in [runtime/](../../packages/engine/src/runtime/)). Render interpolates with an `alpha ∈ [0,1)`.
- **Runs in a Web Worker** (browser): the Worker ([worker/sim-worker.ts](../../packages/farm-valley/src/worker/sim-worker.ts)) owns the ECS `world` + clock and posts a `RenderSnapshot` per tick; the main thread ([worker/sim-client/](../../packages/farm-valley/src/worker/sim-client/)) renders + interpolates between the latest two snapshots. `postMessage` only (no SharedArrayBuffer). The headless [run-sim](../../tools/run-sim/) and all tests drive the sim directly on the main thread (no Worker). See [decisions.md](decisions.md) → Concurrency.
- **Deterministic**: all randomness via seeded [`Rng`](../../packages/engine/src/runtime/rng.ts) (mulberry32 + named forks). No `Math.random` or `Date.now` in sim. Driving ticks from the Worker doesn't affect this — the sim depends only on the tick count.
- **Input log**: external inputs flow through [`InputLog`](../../packages/engine/src/runtime/) so the seed + log replay byte-for-byte.
- **Save model**: seed + event-sourced input log (not snapshots). See [persistence/](../../packages/engine/src/persistence/).

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

**88×80 tile archipelago** (`WORLD_WIDTH`/`WORLD_HEIGHT` in [world/regions.ts](../../packages/farm-valley/src/world/regions.ts)) — islands joined by bridges, walkable tile count `2065` (guarded by `walkable-grid.test.ts`). Region bounds, placement, and the bridge tree are documented in [player-and-interaction.md](player-and-interaction.md) → archipelago layout; that page is the source of truth for tile geometry. Resource zones (forest/quarry) spawn trees/stones; all regions are BFS-verified reachable.

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
