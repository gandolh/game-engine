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
- **Deterministic**: all randomness via seeded [`Rng`](../../packages/engine/src/runtime/rng.ts) (mulberry32 + named forks). No `Math.random` or `Date.now` in sim.
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

## Game data flow per tick

```
DayClock → Perceive → Deliberate → AP → Act → Inbox-dispatch → Harvest → FinishDay
            (reads          (writes        (consumes
             inbox)         intentions)    intentions)
```

Plus passive systems: WeatherSystem, CropGrowthSystem, MarketSystem, ShopkeeperSystem, AuctionSystem.

## Render

Canvas2D ([packages/engine/src/render/canvas2d.ts](../../packages/engine/src/render/canvas2d.ts)) — replaced the planned WebGPU renderer in commit `5ac7f8d`. The atlas is procedurally built at install time by [tools/atlas-builder](../../tools/atlas-builder/) (PNG + JSON manifest).

## WASM

[packages/engine/src/wasm/](../../packages/engine/src/wasm/) wraps `WebAssembly.instantiate`, exposes `WasmHeap` typed-array views, and currently ships one typed kernel: [`Pathfinder`](../../packages/engine/src/wasm/pathfinder.ts) (4-connected grid shortest-path). The Pathfinder is **loaded at boot but not yet routed into agent movement** — see [open-questions.md](open-questions.md).
