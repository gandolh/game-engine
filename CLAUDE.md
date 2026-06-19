# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **two-game monorepo on one shared TypeScript ECS engine**:

- **Farm Valley** — 21 farmers (20 BDI AI personalities + the playable **Pip**) compete over 100 in-game days. Mostly a watch-it-play sim.
- **Citadel** — a settlement/RTS sim (economy, raids, sieges, fire/disease) on the same engine.

See [README.md](README.md) for the player-facing pitch and [corpus/](corpus/) for the project's living design wiki.

## Read the corpus first

`corpus/` is an LLM-maintained wiki and the source of truth for design intent — prefer it over scattered notes, and fold durable, reusable findings back into it (a wiki page + a `log.md` entry) instead of leaving them in chat or personal memory. Before non-trivial work:
- Start at [corpus/index.md](corpus/index.md), then drill into [corpus/wiki/architecture.md](corpus/wiki/architecture.md), [corpus/wiki/decisions.md](corpus/wiki/decisions.md), and [corpus/wiki/status.md](corpus/wiki/status.md).
- For player-facing / interaction systems (the playable farmer **Pip**, hotbar, hover tooltips, feature collision, bridges, plot layout, world widening), see [corpus/wiki/player-and-interaction.md](corpus/wiki/player-and-interaction.md).
- For the second game, see [corpus/wiki/citadel-overview.md](corpus/wiki/citadel-overview.md).
- [corpus/CLAUDE.md](corpus/CLAUDE.md) explains the brief/wiki workflow and the source-of-truth ordering (actual code > a `done/` brief > wiki > prototype README).
- Wiki pages may have drifted — verify any path/function/commit a page names before acting on it.

## Repository layout

npm workspaces, grouped by the dependency seam (`engine/*`, `games/*/*`, `tools/*`):

```
engine/
  core            @engine/core          generic ECS engine (subpath exports: /ecs /render /sim /runtime /input …)
  wasm-modules    @engine/wasm-modules  AssemblyScript kernels (pathfinder, noise, rng, floodfill)
games/
  farm/
    sim-core      @farm/sim-core        Farm Valley sim: systems, agents, world, protocols, economy
    client        @farm/client          browser client (Vite) — talks to the sim server over WebSocket
    server        @farm/server          Node WebSocket sim host (the Farm sim runs here)
  citadel/
    sim-core      @citadel/sim-core      Citadel sim logic
    client        @citadel/client        browser client (Vite) — runs the sim in an in-browser Web Worker
tools/
  run-sim         @tool/run-sim          headless deterministic Farm sim (no browser, no server)
  world-preview   @tool/world-preview    renders the Farm world/atlas to a PNG
  atlas-builder   @tool/atlas-builder    builds the sprite atlas from pixel recipes
  citadel-sim     @tool/citadel-sim      headless Citadel sim
```

**Dependency rule (enforced):** `@engine/wasm-modules` → `@engine/core` → `{@farm/sim-core, @citadel/sim-core}` → `{@farm/client, @farm/server, @citadel/client}`. The engine is generic and never imports a game; the two games never import each other.

## Commands

Run from the repo root:

```bash
npm install
npm run build-wasm     # NOT required after clone — wasm artifacts are committed
npm run dev            # Farm Valley: sim server + browser client together (vite :5173)
npm run server         # just the Farm sim server (WebSocket :8787)
npm run citadel        # Citadel client (vite :5174) — sim runs in its own Web Worker
npm run build          # production build of the Farm client
npm run typecheck      # tsc --noEmit across all workspaces — run before committing
npm run test           # vitest run across all workspaces
npm run sim            # headless deterministic Farm sim (no browser, no server, no Worker)
npm run sim:citadel    # headless Citadel sim
npm run preview        # render the Farm world to a PNG (world-preview)
npm run atlas          # rebuild the sprite atlas
```

Single test / single workspace (tests live in the package that owns the code):

```bash
npm run test -w @engine/core                                  # one workspace
npm run test -w @farm/sim-core -- src/systems/market.test.ts  # one file (sim systems live in @farm/sim-core)
npm run test -w @farm/sim-core -- -t "name of test"           # by test name
```

Headless sim knobs (env vars on `npm run sim`): `SEED`, `TICKS_PER_DAY` (default 1200), `MAX_DAYS` (default 100), `EXPORT=csv|json`, `EXPORT_FILE`, and `CHECK_DETERMINISM=1` (or `npm run check-determinism -w @tool/run-sim`) to run the same seed twice and assert byte-identical results.

## Locked conventions (do not relitigate — see decisions.md)

- **No `.js` import suffixes.** TypeScript-style extensionless imports throughout.
- **Pinned versions.** No `^`/`~` in any `package.json` — reproducibility wins.
- **TypeScript strict**, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (see [tsconfig.base.json](tsconfig.base.json)). No `any` without a comment.
- **EDG32 palette is enforced.** Every color (sprites, tiles, particles, day/night wash, HTML/canvas UI) must come from `EDG.*` constants in [palette.ts](engine/core/src/render/palette.ts). A guard test ([palette.test.ts](engine/core/src/render/palette.test.ts)) walks `engine/`, `games/`, and `tools/` and fails on any off-palette literal.
- **Engine never imports game; the two games never import each other.** `@engine/core` is generic; it is consumed by both the Farm stack (`@farm/sim-core` → `@farm/client`/`@farm/server`) and the Citadel stack (`@citadel/sim-core` → `@citadel/client`).

## Architecture essentials

**Layering** (`@engine/wasm-modules` → `@engine/core` → game sim-cores → game clients/server). The engine exposes subpath exports (`@engine/core/ecs`, `/render`, `/sim`, `/input`, …) from TS source directly — no build step for the engine.

**Determinism is load-bearing.** All randomness flows through the seeded mulberry32 [`Rng`](engine/core/src/runtime/rng.ts) with named `fork(label)` derivation. **Never** use `Math.random()` or `Date.now()` in sim code — the host's `setInterval` is wall-clock *pacing only*; a tick's output depends solely on the tick count. Prove behavior-preserving refactors with multi-seed `EXPORT=json` diffs, not just a determinism check (which only proves reproducibility).

**ECS** ([engine/core/src/ecs/world.ts](engine/core/src/ecs/world.ts)) is in-house (replaced miniplex). `world.spawn/query/despawn`; queries are cached by sorted component-key set and kept live as components are added/removed. Iterating a query takes a pooled private copy, so despawning mid-loop is safe.

**Sim ↔ render boundary (the big one).** The ECS world + scheduler always run *somewhere off the render path*, behind a snapshot stream — but the transport differs per game:
- **Farm Valley** runs the sim **server-side** in [@farm/server](games/farm/server/) ([sim-host.ts](games/farm/server/src/sim-host.ts)). The browser client ([@farm/client](games/farm/client/), [worker/sim-client/](games/farm/client/src/worker/sim-client/)) opens a **WebSocket** to it, receives one `RenderSnapshot` per tick, and interpolates between the latest two using `alpha`. `npm run dev` starts both via [scripts/dev.mjs](scripts/dev.mjs).
- **Citadel** runs the sim in an **in-browser Web Worker** ([sim-worker.ts](games/citadel/client/src/worker/sim-worker.ts)) and posts snapshots over `postMessage`.
- **Headless [run-sim](tools/run-sim/) and all tests** drive the scheduler directly on the main thread — no server, no Worker.

So `bootstrapSim()` (in [@farm/sim-core](games/farm/sim-core/src/sim-bootstrap.ts)) must stay transport-agnostic; anything server- or Worker-only lives in the server / client packages.

**Scheduler order matters.** [sim-bootstrap.ts](games/farm/sim-core/src/sim-bootstrap.ts) registers systems in a deliberate sequence (e.g. EncounterSystem → EncounterTradeSystem → PerceiveSystem, which clears inboxes; EventFeed must snoop messages before PerceiveSystem clears and MarketSystem drains them). Read the inline comments before reordering — the ordering encodes real data dependencies.

**Agents are BDI components + a per-tick FSM.** Each farmer carries `Beliefs`/`Desires`/`Intentions`/`FsmState`/`Personality` (component types defined in [@engine/core/ecs](engine/core/src/ecs/components.ts), used by Farm). The FSM cycles PERCEIVE → ACT (and WAIT_DAY/night phases). [DeliberateSystem](games/farm/sim-core/src/systems/deliberate.ts) dispatches by `personality.kind` through a registry ([agents/registry.ts](games/farm/sim-core/src/agents/registry.ts)); each personality file (`agents/conservative.ts`, etc.) self-registers via a side-effecting import in `sim-bootstrap.ts`. Personalities compose shared `deliberate*` helpers (`agents/watering.ts`, `bean-valuation.ts`) into a prioritized intention queue.

**Message bus** ([engine/core/src/sim/message-bus.ts](engine/core/src/sim/message-bus.ts)) is generic pub/sub with FIPA-ACL-style `performative` + `ontology` + body (mirrors the Python SPADE prototype). `send` queues inflight; `flush()` (called by InboxDispatchSystem inside the tick) swaps inflight→deliverable; `notifySubscribers()` (called by the sim host after each tick) dispatches to ontology subscribers. Protocol definitions live in [games/farm/sim-core/src/protocols/](games/farm/sim-core/src/protocols/).

**WASM modules** (AssemblyScript in [engine/wasm-modules/](engine/wasm-modules/), compiled artifacts committed to [games/farm/client/public/wasm/](games/farm/client/public/wasm/)) provide the pathfinder + noise/rng/floodfill kernels. The host instantiates the pathfinder from bytes; the headless runner can fall back to the pure-JS [js-pathfinder.ts](games/farm/sim-core/src/world/js-pathfinder.ts) (both satisfy `PathfinderLike`). Re-run `npm run build-wasm` and commit the artifacts when you change AssemblyScript sources.

## Tests

Vitest, `node` env for `@engine/core`, `jsdom` env for the browser clients (UI/DOM). Tests live beside their source as `*.test.ts`. System and agent tests live in `@farm/sim-core` and drive `bootstrapSim()` directly — the canonical way to exercise sim behavior without a browser or server.
