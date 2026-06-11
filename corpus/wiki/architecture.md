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

**160×160 tile radial archipelago** (`WORLD_WIDTH`/`WORLD_HEIGHT` in [world/regions.ts](../../packages/sim-core/src/world/regions.ts), 2026-06-09 reorg) — a central service cluster surrounded by two concentric rings of 21 farms, islands joined only by bridges. `walkable-grid.test.ts` recomputes the walkable count from `REGIONS + ROADS` (no hardcoded magic number) and BFS-asserts every region reachable. Region bounds, placement, and the bridge tree live in [player-and-interaction.md](player-and-interaction.md) → *RADIAL archipelago layout* (the source of truth for tile geometry) and [world-generation.md](world-generation.md). Resource zones (forest/quarry) spawn trees/stones.

## Game data flow per tick

[system-ordering.md](system-ordering.md) is the source of truth for the exact registration order + rationale (verify there, not here). High-level shape:

```
DayClock → [shock] → InboxDispatch → [snoop band] → Perceive → Grow → {PlotSense · Deliberate · AP} → Travel → Act → Resolve → FinishDay
```

**Snoop band** (between InboxDispatch and Perceive): the encounter/trust/rivalry/festival/harbor/tavern/event-feed/run-history systems all read inbox messages without consuming them (full list in system-ordering.md). `PerceiveSystem` is the barrier that clears inboxes and folds messages into beliefs. AP runs inside the deliberate stage, not as a separate step.

`TravelSystem` only registers when a `Pathfinder` is passed to `bootstrapSim`. It holds both a land grid (shared with `FeatureCollisionSystem`) and a separate boat grid (water lanes for coral fishing); farmers swap grids while aboard.

`ActSystem` sets `farmer.farmer.busyUntilTick` after physical actions; `PerceiveSystem` clears it when expired and re-arms deliberation.

## Render

Canvas2D ([packages/engine/src/render/canvas2d/](../../packages/engine/src/render/canvas2d/)) — replaced the planned WebGPU renderer in commit `5ac7f8d`.

Key render features:
- **Y-sort**: sprites sorted by `(layer, y)` each frame — overlap creates depth. Sprites may carry an optional `sortY` depth key overriding `y` (drawing position unchanged); used by the edge occluders below.
- **Pseudo-3D height axis** (2026-06-11, brief 81): `Canvas2dSprite.z` / `SnapshotSprite.z` (optional) is a height above the ground. `(x, y)` stays the ground/shadow point; the renderer draws the sprite lifted (`screenY = y - z`) while the **y-sort key stays the ground `y`** (so depth order is unaffected — the documented-correct base rule), and the entity drop-shadow shrinks/fades as `z` rises. `z=0`/undefined is an exact no-op, so this is a dormant foundation: **nothing populates `z` yet.** A deterministic sim-side `Elevation`/`GravitySystem` (jumps, thrown items) is the intended future consumer — it would ride the snapshot's `z` field. Do not assume anything is elevated today.
- **Weather field** (brief 81): `RainField` ([rain-field.ts](../../packages/engine/src/render/rain-field.ts)) is a render-only, world-space, **persistent recycled** drop pool (rain streaks / snow squares) drawn in front of the world via a new optional `weather` arg to `endFrame`. Each drop carries the pseudo-3D height model — a ground point + falling `z` — and rain fires `onImpact(gx, gy)` on landing; [render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts) turns that into a splash via `isWalkable` (ripple over water / dust over land) through `ParticleSystem`. This **replaced** the old per-frame top-edge spawn, which "reset" the curtain whenever the camera followed a walking farmer (it had no persistent volume). Render-only → `Math.random`, no determinism impact.
- **Edge occluders** (2026-06-10, brief 65 follow-up): south-facing island wall bands + cliff faces are NOT baked — [occluders.ts](../../packages/sim-core/src/render-systems/occluders.ts) re-pushes them every frame on the entity layer (50) with `sortY` at the face's bottom edge, so a character standing on a south-coast tile is occluded by the parapet instead of being painted over the wall / hovering over the water. Sandy beach edges stay baked (flat ground, no face).
- **Shadow pass**: ground ellipses drawn before sprites with `multiply` blend.
- **X-ray / occlusion transparency** (2026-06-11, brief 81 follow-up): a sprite flagged `occludable` (currently only the player, via `pushSnapshotSprites(..., playerId)`) is re-drawn at low alpha (`GHOST_ALPHA=0.4`) on top when a taller world sprite drawn in front of it (later in sort order, layer < `GHOST_UI_LAYER`=80, so bubbles/arrows are excluded) overlaps its rect ([`spritesOverlap`](../../packages/engine/src/render/canvas2d/draw.ts)). So the player stays partially visible behind layer-50 occluders (walls, cliff faces) and buildings.
- **Buildings are dynamic layer-50 occluders** (2026-06-11, brief 81 follow-up): `BIG_STRUCTURES` (houses/forge/carpenter/weather-station/antenna) used to be **baked into the static layer at layer 5**, below farmers (50), so they never occluded entities — a farmer behind a house was painted over the roof. They are now pushed each frame by [`pushBuildingSprites`](../../packages/sim-core/src/render-systems/occluders.ts) at layer 50 with `sortY` at the building's south base, so they y-sort against farmers (behind ⇒ occluded + player x-rays through; in front ⇒ draws over). Geometry is pixel-identical to the old bake (bottom-anchored). They're no longer in `iterStaticSprites`. Crops (10)/fences (20) the building now sorts above don't spatially overlap its body (they sit south/beside, not on the footprint), so the layer change is visually invisible there. `pushBuildingSprites` also feeds each building a **directional cast shadow** (offset lower-right, length scaling with `hPx`) at its south base — a code-level depth cue. *(Entities/trees already get a drop-shadow via `pushSnapshotSprites` for any sprite with an id.)* A richer 3D look (visible side-faces/eaves) would need new pixel art (atlas rebuild) — deferred.
- **Waterfall** ([render-loop.ts](../../packages/farm-valley/src/main/render-loop.ts)): a **tall cascade** — new clean rock-sided stream frames `tile/waterfall-fall-a/b/c` (no foam pool → stackable) are drawn for 2 tiles above the `structure/waterfall` foam-pool entity at `WATERFALL_TILE`. The bright streak steps down A→B→C, with a per-tile frame offset so it stays continuous across the 16px seam. Throttled, on-screen-gated **mist/spray** particles play at the pool foot. Render-only.
- **Decorative water life** ([water-decor.ts](../../packages/farm-valley/src/render/water-decor.ts)): render-only **lifecycle events** (wall-clock + Math.random). A duck **trio** flies in from the left (bird flap frames, layer 60) → lands on a shallow spot (duck frames, layer 6) → paddles ~9 s → flies off right; a **whale** glides L→R along an open deep-ocean row (layer 1, faint pulsing alpha → submerged), hidden behind land, splashing every few seconds. The same module also places two **scenic islands** (`decoration/volcano` inactive cone + `decoration/casino`) once in open ocean (5×5-clear spots) — drawn sprites at layer 5, **not** walkable regions. All render-only, no sim/determinism impact. *(Shores were also restricted to region edges so they don't show as sand under the swaying bridges.)*
- **Coastal shallow-water depth** (2026-06-11): islands read as sitting in shallows that deepen to open ocean. `oceanDepthAt(tx,ty)` ([geometry.ts](../../packages/sim-core/src/render-systems/geometry.ts)) is a seeded multi-source BFS giving each ocean tile its distance-from-land (1..`COAST_DEPTH_MAX`=4; 0 = land/open ocean). [water-depth.ts](../../packages/farm-valley/src/render/water-depth.ts) `makeWaterDepthDecorator` bakes a translucent `EDG.cyan` tint over those near-shore ocean tiles (alpha brightest at depth 1, fading out), composed after the ground-noise decorator in the static-layer bake. **Composites correctly because** the renderer fills the water pattern first, then blits the static layer (transparent at ocean) on top — so a translucent fill baked at an ocean tile tints the water beneath. Static (depth ≠ surface, doesn't scroll); render-only, no atlas change. BFS-organic rings (not circular) avoid "bathtub-ring" banding.
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
