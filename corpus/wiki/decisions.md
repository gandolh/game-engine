# Locked Decisions

Tech choices that are settled. Listed here so future briefs and reviews don't relitigate them. Change requires an explicit revisit + note in [log.md](../log.md).

## Stack

- **TypeScript strict.** No `any` escape hatches without a comment.
- **npm workspaces.** Not pnpm/yarn.
- **Vite** for dev/build.
- **Vitest** for tests; `node` env for engine, `jsdom` env for farm-valley UI.
- **Pinned versions.** No `^` or `~` in any `package.json`. Reproducibility wins.
- **No `.js` import suffixes.** TypeScript-style imports throughout.

## Sim

- **Fixed step at 20 Hz.** Render interpolates with `alpha`.
- **Fully deterministic.** Seeded `Rng` (mulberry32). No `Math.random` or `Date.now` in sim code.
- **Save model:** seed + event-sourced input log. Not snapshots.

## ECS

- **In-house ECS** at [packages/engine/src/ecs/world.ts](../../packages/engine/src/ecs/world.ts). Replaced miniplex in commit `020406d` to drop the external dep.
- **BDI as components.** `Beliefs` / `Desires` / `Intentions` + an `FSMState` component. Deliberation system dispatches by `Personality` tag.

## Renderer

- **Canvas2D**, not WebGPU. WebGPU was removed in commit `5ac7f8d` after it added complexity disproportionate to what the game needed. If perf demands push the renderer again, the next step is profiling Canvas2D first, not reaching for WebGPU.

## Assets

- **Build-time procedural atlas** via [tools/atlas-builder](../../tools/atlas-builder/). PNG + JSON manifest. No external art pipeline.

## Art / Palette

- **EDG32 (Endesga-32) is the single, mandatory color palette.** Every color drawn anywhere — sprites, tiles, particles, day/night wash, and all HTML/canvas UI — must be one of the 32 EDG32 swatches (<https://lospec.com/palette-list/endesga-32>).
  - **Single source of truth:** [packages/engine/src/render/palette.ts](../../packages/engine/src/render/palette.ts) exports `EDG32` (the 32 hex colors), `EDG` (named constants — use these in code), `EDG32_SET`, and `isEdg32()` / `nearestEdg32()` / `rgbOf()` helpers. Re-exported from `@engine/core/render`.
  - **No raw hex literals.** New code references `EDG.<name>`; the atlas `SWATCH` table uses EDG32 RGB tuples. Day/night and particle *gradients* lerp between EDG32 anchors with alpha — the anchors are on-palette; the per-pixel interpolated tint is a deliberate overlay, not a flat fill.
  - **Enforced by test:** [packages/engine/src/render/palette.test.ts](../../packages/engine/src/render/palette.test.ts) scans every `packages/` + `tools/` source file and fails on any off-palette `#rgb`/`#rrggbb` literal, asserts the atlas `SWATCH` tuples are all EDG32, and checks `EDG` ⊆ `EDG32`. A tiny documented allowlist exists for legitimate non-palette literals (currently empty).

## Concurrency

- **Sim runs in a Web Worker** (moved 2026-05-29). The Worker owns the ECS `world` and the fixed-step clock; each tick it posts a `RenderSnapshot` (plain, structured-clone-friendly) to the main thread. The main thread keeps the latest two snapshots and **interpolates sprite positions between them** (the prevX/prevY interpolation that used to live on the entity Transform). Transport is `postMessage` only — **no SharedArrayBuffer**, so no COOP/COEP cross-origin-isolation headers are required. See `packages/farm-valley/src/worker/` (`sim-worker`, `sim-client`, `snapshot`, `snapshot-builder`).
  - Determinism is preserved: the sim only depends on the tick *count*, never wall-clock, so driving ticks from the Worker's `setInterval` changes nothing. `npm run sim` (headless, no Worker) and the in-browser Worker run produce identical sim outcomes for a seed.
  - The headless `run-sim` tool and all unit tests still drive `bootstrapSim` + `scheduler.tick` directly on the main thread (no Worker) — the Worker is a rendering/UX boundary, not a sim dependency.
- **Client/server split** (briefs 55–58, 2026-06-10) — _done (code; prod deploy unverified — see below)._ The sim was relocated from the in-browser Web Worker into a long-running **Node.js** process; the renderer is now a pure client over a **WebSocket** carrying the *same* `WorkerInbound`/`WorkerOutbound` protocol (`@farm/sim-core/protocol`). Brief 56 extracted `@farm/sim-core`; brief 57 added `packages/server` (`@farm/server`): a `ws` `WebSocketServer` (`ws` 8.21.0 — the repo's one runtime dep beyond the engine; Node has a WS client but no server), **one sim per connection**, the worker tick-loop ported verbatim into `SimHost` (`send` callback + `handleInbound` instead of `postMessage`/`onmessage`), **drop-stale backpressure** (skip per-tick snapshots when `ws.bufferedAmount` is high; never drop static-layer/profile), and the **WASM** pathfinder read from `packages/wasm-modules/dist/` to match the browser. `npm run server` starts it.
  - **Brief 58** reskinned `SimClient` to a WebSocket transport (public API unchanged → `main/*` untouched), **deleted the in-browser Worker** (`sim-worker.ts`), and made `npm run dev` start both server + Vite (Vite proxies `/sim` → `ws://localhost:8787`). Verified live in-browser via Playwright: connects, renders the full game off the server, pause freezes the tick, resume advances it. The WASM-bytes fetch on the client is gone (the server owns the pathfinder).
  - **Prod hosting:** the static client is served by Caddy as before; the server runs under **pm2** (`farm-valley-sim`), and the per-project Caddy snippet reverse-proxies `/farm-valley/sim` → `localhost:8787` (placed before the static `handle_path`). `deploy.ts` gained a `server` phase (rsync monorepo source minus node_modules → `npm ci` on the box → `pm2 reload`-or-`start`), wired into `all` and `npm run deploy:server`. **The deploy automation is dry-run-verified only** — actual VPS execution (npm ci on the box, pm2, Caddy reload, WS through the proxy) is unverified until run against the real server.
  - **Pathfinder choice is load-bearing:** the JS (`run-sim`) and WASM (browser/server) pathfinders are **not route-equivalent** — same seed, different equal-cost paths, different outcomes. The server uses WASM to preserve what players see; the determinism baseline for the split is captured with `PATHFINDER=wasm` on `run-sim` (a new env knob), not the default JS.
  - **Per-run render memo:** `snapshot-builder/sprites.ts` moved its `lastIntention`/`lastFacing` memos from module globals into a per-run `SnapshotSpriteState` (the server passes one per connection), so multiple sims in one process don't cross-contaminate cosmetic facing. Callers that omit it fall back to a shared default (browser worker, tests) — byte-identical to before.
- **Scale target:** 50–100 agents. Engine APIs should not assume that ceiling.

## WASM

- **AssemblyScript** for native-speed kernels — TypeScript-shaped, no native toolchain, ships as an npm package. See [packages/wasm-modules/README.md](../../packages/wasm-modules/README.md).
- **Built artifacts committed** under `packages/farm-valley/public/wasm/` so fresh clones don't need to build wasm first.

## Source-of-truth for gameplay

The Python SPADE prototype (XMPP + FIPA-ACL + BDI + FSM) is the gameplay spec. The TS rewrite ports the agent semantics — performative + ontology + body, BDI components, FSM states, day-clock — onto the ECS engine. When the Python design and the TS implementation disagree, the Python design wins unless explicitly overridden here.
