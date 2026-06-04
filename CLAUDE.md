# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Farm Valley: four BDI AI farmers compete over 100 in-game days on a custom TypeScript ECS engine. You watch, you don't play. See [README.md](README.md) for the player-facing pitch and [corpus/](corpus/) for the project's living design wiki.

## Read the corpus first

`corpus/` is an LLM-maintained wiki and the source of truth for design intent — prefer it over scattered notes, and fold durable, reusable findings back into it (a wiki page + a `log.md` entry) instead of leaving them in chat or personal memory. Before non-trivial work:
- Start at [corpus/index.md](corpus/index.md), then drill into [corpus/wiki/architecture.md](corpus/wiki/architecture.md), [corpus/wiki/decisions.md](corpus/wiki/decisions.md), and [corpus/wiki/status.md](corpus/wiki/status.md).
- For player-facing / interaction systems (the playable farmer **Pip**, hotbar, hover tooltips, feature collision, bridges, plot layout, the 40→52 world widening), see [corpus/wiki/player-and-interaction.md](corpus/wiki/player-and-interaction.md).
- [corpus/CLAUDE.md](corpus/CLAUDE.md) explains the brief/wiki workflow and the source-of-truth ordering (actual code > a `done/` brief > wiki > prototype README).
- Wiki pages may have drifted — verify any path/function/commit a page names before acting on it.

## Commands

Run from the repo root (npm workspaces):

```bash
npm install
npm run build-wasm     # ONE-TIME after clone is NOT required — wasm artifacts are committed
npm run dev            # Farm Valley in the browser, hot reload (vite, :5173)
npm run build          # production build
npm run typecheck      # tsc --noEmit across all workspaces — run before committing
npm run test           # vitest run across all workspaces
npm run sim            # headless deterministic sim (no browser, no Worker)
```

Single test / single workspace:

```bash
npm run test -w @engine/core                              # one workspace
npm run test -w farm-valley -- src/systems/market.test.ts # one file
npm run test -w farm-valley -- -t "name of test"          # by test name
```

Headless sim knobs (env vars on `npm run sim`): `SEED`, `TICKS_PER_DAY` (default 1200), `MAX_DAYS` (default 100), `EXPORT=csv|json`, `EXPORT_FILE`, and `CHECK_DETERMINISM=1` (or `npm run check-determinism -w run-sim`) to run the same seed twice and assert byte-identical results.

## Locked conventions (do not relitigate — see decisions.md)

- **No `.js` import suffixes.** TypeScript-style extensionless imports throughout.
- **Pinned versions.** No `^`/`~` in any `package.json` — reproducibility wins.
- **TypeScript strict**, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (see [tsconfig.base.json](tsconfig.base.json)). No `any` without a comment.
- **EDG32 palette is enforced.** Every color (sprites, tiles, particles, day/night wash, HTML/canvas UI) must come from `EDG.*` constants in [packages/engine/src/render/palette.ts](packages/engine/src/render/palette.ts). A guard test ([palette.test.ts](packages/engine/src/render/palette.test.ts)) scans the source tree and fails on any off-palette literal.
- **Engine never imports game; game packages never import each other.** `@engine/core` is generic; `farm-valley` is the only consumer.

## Architecture essentials

**Layering** (`@engine/wasm-modules` → `@engine/core` → `farm-valley`). The engine exposes subpath exports (`@engine/core/ecs`, `/render`, `/sim`, …) from TS source directly — no build step for the engine.

**Determinism is load-bearing.** All randomness flows through the seeded mulberry32 [`Rng`](packages/engine/src/runtime/rng.ts) with named `fork(label)` derivation. **Never** use `Math.random()` or `Date.now()` in sim code — the worker's `setInterval` is wall-clock *pacing only*; a tick's output depends solely on the tick count. Prove behavior-preserving refactors with multi-seed `EXPORT=json` diffs, not just a determinism check (which only proves reproducibility).

**ECS** ([packages/engine/src/ecs/world.ts](packages/engine/src/ecs/world.ts)) is in-house (replaced miniplex). `world.spawn/query/despawn`; queries are cached by sorted component-key set and kept live as components are added/removed. Iterating a query takes a pooled private copy, so despawning mid-loop is safe.

**Sim ↔ render boundary (the big one).** In the browser the ECS world + scheduler live entirely inside a **Web Worker** ([worker/sim-worker.ts](packages/farm-valley/src/worker/sim-worker.ts)). It posts one `RenderSnapshot` per tick over `postMessage` (no SharedArrayBuffer); the main thread ([worker/sim-client.ts](packages/farm-valley/src/worker/sim-client.ts)) renders and interpolates between the latest two snapshots using `alpha`. **Headless [run-sim](tools/run-sim/) and all tests drive the scheduler directly on the main thread — no Worker.** So `bootstrapSim()` must stay Worker-agnostic; anything Worker-only goes in `sim-worker.ts`.

**Scheduler order matters.** [sim-bootstrap.ts](packages/farm-valley/src/sim-bootstrap.ts) registers systems in a deliberate sequence (e.g. EncounterSystem → EncounterTradeSystem → PerceiveSystem, which clears inboxes; EventFeed must snoop messages before PerceiveSystem clears and MarketSystem drains them). Read the inline comments before reordering — the ordering encodes real data dependencies.

**Agents are BDI components + a per-tick FSM.** Each farmer carries `Beliefs`/`Desires`/`Intentions`/`FsmState`/`Personality`. The FSM cycles PERCEIVE → ACT (and WAIT_DAY/night phases). [DeliberateSystem](packages/farm-valley/src/systems/deliberate.ts) dispatches by `personality.kind` through a registry ([agents/registry.ts](packages/farm-valley/src/agents/registry.ts)); each personality file (`agents/conservative.ts`, etc.) self-registers via a side-effecting import in `sim-bootstrap.ts`. Personalities compose shared `deliberate*` helpers (`agents/watering.ts`, `bean-valuation.ts`) into a prioritized intention queue.

**Message bus** ([packages/engine/src/sim/message-bus.ts](packages/engine/src/sim/message-bus.ts)) is generic pub/sub with FIPA-ACL-style `performative` + `ontology` + body (mirrors the Python SPADE prototype). `send` queues inflight; `flush()` (called by InboxDispatchSystem inside the tick) swaps inflight→deliverable; `notifySubscribers()` (called by the worker after each tick) dispatches to ontology subscribers. Protocol definitions live in [packages/farm-valley/src/protocols/](packages/farm-valley/src/protocols/).

**WASM modules** (AssemblyScript in `packages/wasm-modules/`, compiled artifacts committed to `packages/farm-valley/public/wasm/`) provide the pathfinder + noise/rng/floodfill kernels. The worker instantiates the pathfinder from transferred bytes; the headless runner can fall back to the pure-JS [js-pathfinder.ts](packages/farm-valley/src/world/js-pathfinder.ts) (both satisfy `PathfinderLike`). Re-run `npm run build-wasm` and commit the artifacts when you change AssemblyScript sources.

## Tests

Vitest, `node` env for `@engine/core`, `jsdom` env for `farm-valley` (UI/DOM). Tests live beside their source as `*.test.ts`. System and agent tests drive `bootstrapSim()` directly — the canonical way to exercise sim behavior without a browser.
