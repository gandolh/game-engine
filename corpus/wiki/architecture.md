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

## Sim loop

- **Fixed step**: 20 Hz tick (`FixedStepClock` in [runtime/](../../packages/engine/src/runtime/)). Render interpolates with an `alpha ∈ [0,1)`.
- **Runs in a Web Worker** (browser): the Worker ([worker/sim-worker.ts](../../packages/farm-valley/src/worker/sim-worker.ts)) owns the ECS `world` + clock and posts a `RenderSnapshot` per tick; the main thread ([worker/sim-client.ts](../../packages/farm-valley/src/worker/sim-client.ts)) renders + interpolates between the latest two snapshots. `postMessage` only (no SharedArrayBuffer). The headless [run-sim](../../tools/run-sim/) and all tests drive the sim directly on the main thread (no Worker). See [decisions.md](decisions.md) → Concurrency.
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

40×40 tile grid. **11 walkable regions** connected by 2-tile-wide road corridors:

```
NW: carpentry (0–9, 0–9)     N: farm-cora (14–25, 0–11)      NE: forest-north (26–33,0–7) | quarry-north (35–39,0–9)
W: farm-otto (0–11,14–25)    Center: village (14–25,14–25)   E: farm-atticus (28–39,14–25)
SW: forest-south (0–7,26–33) S: farm-hannah (14–25,28–39)    SE: blacksmith (30–39,30–39)
    quarry-south (0–9,35–39)
```

Forest zones spawn trees only; quarry zones spawn stones only. North pair (forest-north + quarry-north) serves Cora + Atticus; south pair serves Otto + Hannah. All regions BFS-verified reachable from every farm. Walkable tile count: 1257.

Road network: 4 farm↔village roads + L-bridge to blacksmith + carpentry connector + 4 zone connectors.

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

Canvas2D ([packages/engine/src/render/canvas2d.ts](../../packages/engine/src/render/canvas2d.ts)) — replaced the planned WebGPU renderer in commit `5ac7f8d`.

Key render features:
- **Y-sort**: sprites sorted by `(layer, y)` each frame — overlap creates depth.
- **Shadow pass**: ground ellipses drawn before sprites with `multiply` blend.
- **Particle system**: `ParticleSystem` class — circles/rects/stars with alpha-fade + gravity, drawn in world space after sprites.
- **Static layer bake**: backdrop tiles baked once into an offscreen canvas; WASM noise generator fills the brightness grid (~8× faster than JS).
- **Walk/work/bob animation**: `walk-a`/`walk-b` while `farmer.path` is set, `/work` pose for physical actions, 1.5px idle bob.

Atlas: 54 hand-crafted 16×16 pixel-art frames (PNG + JSON manifest at `packages/farm-valley/public/atlas/`).

## WASM

[packages/engine/src/wasm/](../../packages/engine/src/wasm/) wraps `WebAssembly.instantiate`, exposes `WasmHeap` typed-array views. Four typed kernels (all AssemblyScript, artifacts committed):

| Module | Size | Purpose |
|---|---|---|
| `pathfinding.wasm` | ~1.6 KB | 4-connected A* grid pathfinding — **load-bearing** in `TravelSystem` |
| `noise.wasm` | 671 B | Value-noise brightness fill for static-layer bake (~8× faster than JS) |
| `rng.wasm` | 603 B | Mulberry32 batch float fill |
| `floodfill.wasm` | 836 B | BFS flood-fill, returns reachable tile coordinates |

All kernels export via `@engine/core`. The pathfinder bytes are transferred to the sim worker at init time (`WorkerInitMsg.pathfinderWasm`) so the worker can instantiate its own `Pathfinder` without sharing memory.
