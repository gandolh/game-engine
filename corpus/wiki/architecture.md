---
summary: The load-bearing map: workspaces, the four-layer dependency rule, the sim loop, ECS, message bus, per-tick data flow, render, audio, WASM, and the library-packaging seam.
updated: 2026-07-17
---

# Architecture

## Workspaces

```
engine/
  core/            @engine/core          — reusable engine
  ui/              @engine/ui            — shared in-canvas UI toolkit (text/icons/widgets/layout/theme), used by both games
  wasm-modules/    @engine/wasm-modules  — AssemblyScript sources
games/
  farm/
    sim-core/      @farm/sim-core        — the deterministic sim (Node-safe + browser-safe)
    client/        @farm/client          — the renderer (the game's browser client)
    server/        @farm/server          — Node WebSocket sim host (the Farm sim runs here)
    atlas-recipes/ @farm/atlas-recipes   — per-asset pixel recipes the atlas-builder bakes
  citadel/
    sim-core/      @citadel/sim-core      — Citadel (settlement/RTS) sim logic
    client/        @citadel/client        — Citadel browser client (sim runs in a Web Worker)
    server/        @citadel/server        — Node WebSocket sim host for Citadel online MP (solo runs in a Worker)
tools/
  atlas-builder    @tool/atlas-builder   — runtime sprite atlas
  run-sim          @tool/run-sim         — headless Farm sim driver
  world-preview    @tool/world-preview   — offline snapshot viewer
  citadel-sim      @tool/citadel-sim     — headless Citadel sim
```

Root [package.json](../../package.json) is an npm workspaces monorepo (`engine/*`, `games/*/*`, `tools/*`), grouped by the dependency seam; all packages share TS config via [tsconfig.base.json](../../tsconfig.base.json). The engine never imports a game and the two games never import each other.

**`@farm/sim-core` (brief 56)** holds the deterministic simulation — `bootstrapSim` + `systems/**`, `agents/**`, `world/**`, `economy/**`, `protocols/**`, `components/**`, the snapshot layer (`snapshot/`, `snapshot-builder/`), `render-systems/` (pure sprite-frame production, no DOM), and the transport-neutral message contract (`protocol/` — `Sim*` names since brief 115, 2026-07-15, replacing the historical `Worker*` names). It imports `@engine/core` (incl. the render barrel, for the EDG palette + sprite types — Node-safe because nothing instantiates a Canvas at module load) but **never** the renderer. It exposes TS source directly via subpath `exports` (no build step), like `@engine/core`. This was extracted so both the renderer and the future Node WS server (brief 57) can depend on the sim without the renderer in between.

## Layers

```
┌──────────────────────────────────────────────────────────┐
│  @farm/client  main, screens, ui, render, worker/sim-   │  ← renderer (client)
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

Engine never imports game; the renderer (`farm-valley`) depends on `@farm/sim-core` for sim logic + the snapshot/message types; `@farm/sim-core` never imports the renderer. WASM artifacts are committed under `games/farm/client/public/wasm/` (the renderer fetches them) and built into `engine/wasm-modules/dist/` (sim-core's `travel.test.ts` + the Node server read the dist copy); fresh clones can `npm run dev` without first running `npm run build-wasm`.

**`@farm/server` (briefs 57–58)** is a second consumer of `@farm/sim-core`: a long-running Node process (`games/farm/server`, `ws` WebSocketServer, `npm run server`) that hosts the sim and bridges the `@farm/sim-core/protocol` message contract over a WebSocket. `SimHost` is the old worker tick-loop ported transport-agnostically (a `send(msg)` callback + `handleInbound(msg)` instead of `postMessage`/`onmessage`); one sim per connection; WASM pathfinder from `wasm-modules/dist`; drop-stale snapshot backpressure. **The renderer's `SimClient` is now a pure WebSocket client of this server** (brief 58) — the in-browser Web Worker is gone. `SimClient`'s public API was preserved, so the `main/*` consumers were untouched; only its transport changed (WebSocket frames instead of `postMessage`). Dev: `npm run dev` starts both the server and Vite; Vite proxies `/sim` → `ws://localhost:8787`. Prod: Caddy reverse-proxies `/farm-valley/sim` → the pm2-managed server (see [decisions.md](decisions.md) → Concurrency + the deploy section).

**Module-directory convention.** Large units are split into a directory of focused modules fronted by a barrel `index.ts` that re-exports the public surface (e.g. `systems/act/` → `system.ts` + `handlers/*` + `constants` + `index`; `components/` → per-domain type files + `index`; `agents/watering/` → per-domain `deliberate*` helpers + `index`). Consumers import the directory (`from "../components"`, `from "./act"`) and resolve to the barrel, so internal layout can change without touching importers. (Brief 58 removed the lone former exception — `worker/sim-worker.ts`, the Vite-URL-referenced Worker entry — since the sim no longer runs in the browser.)

## Sim loop

- **Fixed step**: 20 Hz tick (`FixedStepClock` in [runtime/](../../engine/core/src/runtime/)). Render interpolates with an `alpha ∈ [0,1)`.
- **Runs in a Node server** (browser play): the sim lives in `@farm/server`'s `SimHost`, which owns the ECS `world` + clock and sends a `RenderSnapshot` per tick over a WebSocket; the browser ([net/sim-client/](../../games/farm/client/src/net/sim-client/) — renamed from the fossil `worker/` path by brief 115) renders + interpolates between the latest two snapshots. JSON over WS (no SharedArrayBuffer). The headless [run-sim](../../tools/run-sim/) and all tests still drive the sim directly in-process (no server). See [decisions.md](decisions.md) → Concurrency. *(Through brief 56 this ran in an in-browser Web Worker; briefs 57–58 moved it to the Node server.)*
- **Deterministic**: all randomness via seeded [`Rng`](../../engine/core/src/runtime/rng.ts) (mulberry32 + named forks). No `Math.random` or `Date.now` in sim. Driving ticks from the server's `setInterval` doesn't affect this — the sim depends only on the tick count.
- **Save / replay / share**: a run is fully described by its seed + params (`ticksPerDay`/`maxDays`), captured in the [`run-descriptor`](../../games/farm/sim-core/src/run-descriptor.ts) and round-tripped through the URL hash (the "Share this run" button in the game-over screen). Because the sim is deterministic, the seed alone reproduces the run byte-for-byte — there is **no** input-log or snapshot-based save model. *(An engine-level `InputLog`/event-sourced persistence layer was once planned but never built; do not cite `engine/core/src/persistence/` — it does not exist.)*

## ECS

In-house entity system at [engine/core/src/ecs/world.ts](../../engine/core/src/ecs/world.ts). Replaced miniplex (commit `020406d`) to drop the external dep while keeping the `spawn` / `query` / `despawn` API surface.

## Message bus

Generic pub/sub at [engine/core/src/sim/message-bus.ts](../../engine/core/src/sim/message-bus.ts). Messages carry `performative` + `ontology` + body — directly mirrors the Python SPADE FIPA-ACL format. Used by:
- Inter-agent CNP (Contract Net Protocol) for trade
- Market wall (post/read/cancel/buy offers)
- Shopkeeper (buy/sell, auctions)
- Weather station (broadcasts conditions + forecasts)
- Day clock (day-start, finish-day events)

## World layout

**240×240 tile radial archipelago** (`WORLD_WIDTH`/`WORLD_HEIGHT` in [world/regions.ts](../../games/farm/sim-core/src/world/regions.ts), 2026-06-09 reorg; grown 160→240 on 2026-06-12 via uniform position-only scaling, SCALE=1.5) — a central service cluster surrounded by two concentric rings of 21 farms, islands joined only by bridges. `walkable-grid.test.ts` recomputes the walkable count from `REGIONS + ROADS` (no hardcoded magic number) and BFS-asserts every region reachable. Region bounds, placement, and the bridge tree live in [player-and-interaction.md](player-and-interaction.md) → *RADIAL archipelago layout* (the source of truth for tile geometry) and [world-generation.md](world-generation.md). Resource zones (forest/quarry) spawn trees/stones.

## Game data flow per tick

[system-ordering.md](system-ordering.md) is the source of truth for the exact registration order + rationale (verify there, not here). High-level shape:

```
DayClock → [shock] → InboxDispatch → [snoop band] → Perceive → Grow → {PlotSense · Deliberate · AP} → Travel → Act → Resolve → FinishDay
```

**Snoop band** (between InboxDispatch and Perceive): the encounter/trust/rivalry/festival/harbor/tavern/event-feed/run-history systems all read inbox messages without consuming them (full list in system-ordering.md). `PerceiveSystem` is the barrier that clears inboxes and folds messages into beliefs. AP runs inside the deliberate stage, not as a separate step.

`TravelSystem` only registers when a `Pathfinder` is passed to `bootstrapSim`. It holds both a land grid (shared with `FeatureCollisionSystem`) and a separate boat grid (water lanes for coral fishing); farmers swap grids while aboard.

`ActSystem` sets `farmer.farmer.busyUntilTick` after physical actions; `PerceiveSystem` clears it when expired and re-arms deliberation.

## Render

Canvas2D ([engine/core/src/render/canvas2d/](../../engine/core/src/render/canvas2d/)) — replaced the planned WebGPU renderer in commit `5ac7f8d`.

Key render features:
- **Y-sort**: sprites sorted by `(layer, y)` each frame — overlap creates depth. Sprites may carry an optional `sortY` depth key overriding `y` (drawing position unchanged); used by the edge occluders below.
- **Pseudo-3D height axis** (2026-06-11, brief 81): `Canvas2dSprite.z` / `SnapshotSprite.z` (optional) is a height above the ground. `(x, y)` stays the ground/shadow point; the renderer draws the sprite lifted (`screenY = y - z`) while the **y-sort key stays the ground `y`** (so depth order is unaffected — the documented-correct base rule), and the entity drop-shadow shrinks/fades as `z` rises. `z=0`/undefined is an exact no-op, so this is a dormant foundation: **nothing populates `z` yet.** A deterministic sim-side `Elevation`/`GravitySystem` (jumps, thrown items) is the intended future consumer — it would ride the snapshot's `z` field. Do not assume anything is elevated today.
- **Weather field** (brief 81): `RainField` ([rain-field.ts](../../engine/core/src/render/rain-field.ts)) is a render-only, world-space, **persistent recycled** drop pool (rain streaks / snow squares) drawn in front of the world via a new optional `weather` arg to `endFrame`. Each drop carries the pseudo-3D height model — a ground point + falling `z` — and rain fires `onImpact(gx, gy)` on landing; [render-loop.ts](../../games/farm/client/src/main/render-loop.ts) turns that into a splash via `isWalkable` (ripple over water / dust over land) through `ParticleSystem`. This **replaced** the old per-frame top-edge spawn, which "reset" the curtain whenever the camera followed a walking farmer (it had no persistent volume). Render-only → `Math.random`, no determinism impact.
- **Edge occluders** (2026-06-10, brief 65 follow-up): south-facing island wall bands + cliff faces are NOT baked — [occluders.ts](../../games/farm/sim-core/src/render-systems/occluders.ts) re-pushes them every frame on the entity layer (50) with `sortY` at the face's bottom edge, so a character standing on a south-coast tile is occluded by the parapet instead of being painted over the wall / hovering over the water. Sandy beach edges stay baked (flat ground, no face).
- **Shadow pass**: ground ellipses drawn before sprites with `multiply` blend.
- **X-ray / occlusion transparency** (2026-06-11, brief 81 follow-up): a sprite flagged `occludable` (currently only the player, via `pushSnapshotSprites(..., playerId)`) is re-drawn at low alpha (`GHOST_ALPHA=0.4`) on top when a taller world sprite drawn in front of it (later in sort order, layer < `GHOST_UI_LAYER`=80, so bubbles/arrows are excluded) overlaps its rect ([`spritesOverlap`](../../engine/core/src/render/canvas2d/draw.ts)). So the player stays partially visible behind layer-50 occluders (walls, cliff faces) and buildings.
- **Buildings are dynamic layer-50 occluders** (2026-06-11, brief 81 follow-up): `BIG_STRUCTURES` (houses/forge/carpenter/weather-station/antenna) used to be **baked into the static layer at layer 5**, below farmers (50), so they never occluded entities — a farmer behind a house was painted over the roof. They are now pushed each frame by [`pushBuildingSprites`](../../games/farm/sim-core/src/render-systems/occluders.ts) at layer 50 with `sortY` at the building's south base, so they y-sort against farmers (behind ⇒ occluded + player x-rays through; in front ⇒ draws over). Geometry is pixel-identical to the old bake (bottom-anchored). They're no longer in `iterStaticSprites`. Crops (10)/fences (20) the building now sorts above don't spatially overlap its body (they sit south/beside, not on the footprint), so the layer change is visually invisible there. `pushBuildingSprites` also feeds each building a **directional cast shadow** (offset lower-right, length scaling with `hPx`) at its south base — a code-level depth cue. *(Entities/trees already get a drop-shadow via `pushSnapshotSprites` for any sprite with an id.)* A richer 3D look (visible side-faces/eaves) would need new pixel art (atlas rebuild) — deferred.
- **Waterfall** ([render-loop.ts](../../games/farm/client/src/main/render-loop.ts)): a **tall cascade** — new clean rock-sided stream frames `tile/waterfall-fall-a/b/c` (no foam pool → stackable) are drawn for 2 tiles above the `structure/waterfall` foam-pool entity at `WATERFALL_TILE`. The bright streak steps down A→B→C, with a per-tile frame offset so it stays continuous across the 16px seam. Throttled, on-screen-gated **mist/spray** particles play at the pool foot. Render-only.
- **Decorative water life** ([water-decor.ts](../../games/farm/client/src/render/water-decor.ts)): render-only **lifecycle events** (wall-clock + Math.random). A duck **trio** flies in from the left (bird flap frames, layer 60) → lands on a shallow spot (duck frames, layer 6) → paddles ~9 s → flies off right; a **whale** glides L→R along an open deep-ocean row (layer 1, faint pulsing alpha → submerged), hidden behind land, splashing every few seconds. The same module also places two **scenic islands** (`decoration/volcano` inactive cone + `decoration/casino`) once in open ocean (5×5-clear spots) — drawn sprites at layer 5, **not** walkable regions. All render-only, no sim/determinism impact. *(Shores were also restricted to region edges so they don't show as sand under the swaying bridges.)*
- **Coastal shallow-water depth** (2026-06-11): islands read as sitting in shallows that deepen to open ocean. `oceanDepthAt(tx,ty)` ([geometry.ts](../../games/farm/sim-core/src/render-systems/geometry.ts)) is a seeded multi-source BFS giving each ocean tile its distance-from-land (1..`COAST_DEPTH_MAX`=4; 0 = land/open ocean). [water-depth.ts](../../games/farm/client/src/render/water-depth.ts) `makeWaterDepthDecorator` bakes a translucent `EDG.cyan` tint over those near-shore ocean tiles (alpha brightest at depth 1, fading out), composed after the ground-noise decorator in the static-layer bake. **Composites correctly because** the renderer fills the water pattern first, then blits the static layer (transparent at ocean) on top — so a translucent fill baked at an ocean tile tints the water beneath. Static (depth ≠ surface, doesn't scroll); render-only, no atlas change. BFS-organic rings (not circular) avoid "bathtub-ring" banding.
- **Particle system**: `ParticleSystem` class — circles/rects/stars with alpha-fade + gravity, drawn in world space after sprites.
- **Static layer bake**: backdrop tiles baked once into an offscreen canvas; WASM noise generator fills the brightness grid (~8× faster than JS).
- **Walk/work/bob animation**: `walk-a`/`walk-b` while `farmer.path` is set, `/work` pose for physical actions, 1.5px idle bob.

Atlas: ~220 hand-crafted 16×16 pixel-art frames split across **6 sheets + an `index.json`** (characters/buildings/terrain/crops/props/items-ui) at `games/farm/client/public/atlas/`; `atlasId` is load-bearing (the renderer maps each frame to its sheet). Sheets are generated from pixel recipes in [games/farm/atlas-recipes/src/](../../games/farm/atlas-recipes/src/) (split into `base-recipes`, `templates`, `palette`, `sheet-map`).

## Audio

[engine/core/src/audio/](../../engine/core/src/audio/) (`@engine/core/audio`, 2026-07-15, engine brief 19) — a **generic, off-sim client subsystem**, same layer as particles/toasts/juice. **Never runs on the deterministic sim path**; `sim-core` is untouched and both games' determinism runs stay byte-identical (that's the acceptance proof audio didn't leak in). Like the rest of the engine it names no game — each game owns its own event→sound map.

- **`AudioEngine`** signal chain: per-voice source → per-voice gain → **master gain** → `destination`; `muted`/`volume` gate at the master. A voice cap (`maxVoices`, default 16) **skips** new voices when saturated (never cuts a playing one); voices are reaped on `onended` plus a scheduled-end backstop so a suspended/stubbed context can't leak them.
- **The unlock rule:** browsers create an `AudioContext` **suspended** until a user gesture. Clients call `unlock()` on the first pointer/key press; **before that, `play()` is a safe no-op returning `false`** (never throws, builds no node, no autoplay-gate console error). Calling `unlock()` on an already-running context is a no-op, so wiring it to a one-shot listener is safe.
- **Headless-testable:** the engine takes an injected `AudioContextLike` factory (a narrow Web-Audio subset) and, where Web Audio is absent (node/jsdom), constructs a **silent stub** rather than throwing — so client unit tests build the wrappers with no stubbing.
- **v1 sounds are procedural synth** (oscillator blips/chimes/buzzes) — **zero committed binary assets**. A `{ kind: "buffer" }` `SoundSpec` for future real assets is built but wired to no `.wav` yet.
- **Per-game wiring (test palettes, 3 sounds each):** Farm's `FarmAudio` ([games/farm/client/src/main/audio.ts](../../games/farm/client/src/main/audio.ts)) is an injected `JuiceAudioSink` fed from `JuiceLayer`'s existing new-event pass — so it inherits juice's resync-skip guarantee for free (do not add a second event diff). Citadel's `CitadelAudio` ([games/citadel/client/src/ui/audio.ts](../../games/citadel/client/src/ui/audio.ts)) keys off `toast.ts`'s `toneOf` classification, fed from the same `newEventsSince` loop that drives toasts. **Owed:** a real-browser audio sign-off (a code-only session can't hear it) — and specifically a listen for whether Citadel's every-warn/info tick is too frequent.

## WASM

[engine/core/src/wasm/](../../engine/core/src/wasm/) wraps `WebAssembly.instantiate`, exposes `WasmHeap` typed-array views. Four typed kernels (all AssemblyScript, artifacts committed):

| Module | Size | Purpose |
|---|---|---|
| `pathfinding.wasm` | ~1.6 KB | 4-connected A* grid pathfinding — **load-bearing** in `TravelSystem` |
| `noise.wasm` | 671 B | Value-noise brightness fill for static-layer bake (~8× faster than JS) |
| `rng.wasm` | 603 B | Mulberry32 batch float fill |
| `floodfill.wasm` | 836 B | BFS flood-fill, returns reachable tile coordinates |

All kernels export via `@engine/core`. The pathfinder bytes are transferred to the sim host at init time (`SimInitMsg.pathfinderWasm` — `WorkerInitMsg` until brief 115) so the host can instantiate its own `Pathfinder` without sharing memory.

## Library packaging (the reusable seam)

2026-07-17 (engine-library-extraction todo). `@engine/core` + `@engine/ui` + `@engine/wasm-modules` are the **reusable seam** — packaged as **MIT libraries, version 0.1.0, without publishing** (the two games stay in-repo as reference consumers). The public npm name is deferred to publish time (one rename commit then).

- **Dual resolution.** Inside the monorepo the packages still resolve **raw TS source** (`exports` → `./src/*.ts`) so Vite/tsx/vitest compile it with zero dev churn. Tarball consumers must resolve emitted `dist/` (ESM `.js` + `.d.ts`). The swap is done by a **prepack/postpack manifest swap** ([scripts/pack-swap.mjs](../../engine/core/scripts/pack-swap.mjs)), **not** `publishConfig.exports` — that field was empirically proven **not to work on npm** and is a dead end; don't reach for it again.
- **Build.** `tsconfig.build.json` emits `dist/` per package; [scripts/postbuild.mjs](../../engine/core/scripts/postbuild.mjs) rewrites extensionless imports → `.js` (our no-`.js`-suffix convention is a source-only rule) and copies the `.wgsl` shaders. `@engine/wasm-modules` diverges deliberately: no `tsc`, `prepack: npm run build` (asc), and `exports` maps the raw `.wasm` from `dist/` — it ships its wasm artifacts in-package (the games keep their own committed copies as consumers).
- **Pin discipline.** Consumer manifests pin the engine packages at the **exact** current version (0.1.0). A stale `0.0.0` pin does **not** fail while node_modules symlinks exist but **breaks a clean `npm install`** (the range can't be satisfied, npm 404s the registry) — keep consumer pins in lockstep with the engine version on any bump. (Bit us at closeout, `c67d6d8`.)
- **Acceptance fixture.** [examples/library-consumer](../../examples/library-consumer/) is **outside the npm workspaces list** and installs the three `npm pack` tarballs via `file:` — a Node smoke (ECS world+scheduler tick, seeded `Rng.fork`, message bus, wasm pathfinder from in-package bytes, UI layout under jsdom) proves external consumption with no reference back into monorepo source. `tarballs/` + its node_modules are gitignored; the fixture README documents regeneration (`npm pack --pack-destination` ×3).
- **Game-leakage audit.** The only leak found was the repo-walking palette guard test — excluded from the tarball via the `files` allowlist (tests never ship). Per-package READMEs document the reusable seam.
