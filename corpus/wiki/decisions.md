---
summary: Locked tech choices that future briefs must not relitigate — stack, sim, ECS, renderer (WebGL2-only as of 2026-08-18, migration shipped), assets, palette, concurrency, WASM, and the gameplay source-of-truth.
updated: 2026-08-18
---

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

- **In-house ECS** at [engine/core/src/ecs/world.ts](../../engine/core/src/ecs/world.ts). Replaced miniplex in commit `020406d` to drop the external dep.
- **BDI as components.** `Beliefs` / `Desires` / `Intentions` + an `FSMState` component. Deliberation system dispatches by `Personality` tag.

## Renderer

- **WebGL2 is the single render backend.** *(Decided 2026-08-18 by user directive — supersedes "WebGPU-first, with Canvas2D as the fallback backend" (2026-07-09), which itself superseded "Canvas2D, not WebGPU".)* **✅ SHIPPED 2026-08-18.** `render/canvas2d/`, `render/webgpu/` and `render3d/webgpu/` are **deleted**; `@webgpu/types` and `wgsl_reflect` are gone from every package. The only backend is `engine/core/src/render/webgl2/` (2D) + `engine/core/src/render3d/webgl2/` (3D). All four games were verified rendering in a real browser. Build record: [todos/2026-08-18-webgl2-00-BUILD-ORDER.md](../todos/closed/2026-08-18-webgl2-00-BUILD-ORDER.md) · [todos/2026-08-18-webgl2-BUILD-STATE.md](../todos/closed/2026-08-18-webgl2-BUILD-STATE.md).

  **Why.** WebGPU compatibility. As of 2026-08 it ships in Chrome/Edge 113+, Safari 26 (macOS Tahoe 26 / iOS 26), and Firefox 141 (Windows) / 145 (macOS ARM64) — but **Firefox on Linux is still unshipped**, Android is in progress, and the no-hardware-acceleration tail (VMs, remote desktops, headless) has bitten this project twice already. Both 2D clients hard-forced `backend: "webgpu"`, so an unsupported browser got a **blank canvas**. WebGL2 is ~98% supported and universal on desktop since ~2017.

  **Why not keep WebGPU as a fast path with WebGL2 as the fallback.** The "passes come in pairs" rule from the 2026-07-09 entry had *already* drifted with only two backends: `setCloudOptions` existed only on WebGPU, and `OverlayFn` was honoured on Canvas2D and silently ignored on WebGPU. Paying that parity tax across a larger surface, forever, buys a fast path for browsers that mostly already run WebGL2 fine. One backend retires the tax.

  **Why Canvas2D's own justification didn't hold.** It was kept as "a real, tested second backend for the `node` test env" — but both backends were always tested against **stubs** (`canvas2d.test.ts` stubbed `getContext`, `webgpu/renderer.test.ts` stubbed `requestAdapter`). The stub, not the backend, is what makes `node`-env render tests work.

  **What this gives up, stated plainly:** compute shaders and storage buffers (neither was in use — audited 2026-08-18: zero `@compute` across all 7 WGSL files, and exactly one storage buffer, the `scene3d` materials table, which becomes a `std140` UBO), and WebGPU's lower per-draw CPU overhead — acceptable because the engine runs far under frame budget on real hardware (~1.4–2.3 ms of a 16.6 ms render budget, see [performance-measurements.md](performance-measurements.md)).

  **The replacement standing rule:** one backend, and **every colour in GLSL comes from a palette-role uniform** — no literals in shader source, enforced by `glsl-lint.test.ts` (one copy per shader directory: the lint globs from its own folder, so `render/webgl2/shaders/` and `render3d/webgl2/shaders/` each need their own).

  **Two non-obvious constraints this migration established — do not "tidy" either away:**
  1. **The renderer must be imported DYNAMICALLY.** `createRenderer` uses `await import("./webgl2/renderer")`, and `render/index.ts` exports `WebGl2Renderer` as a **type only**. The WebGL2 passes `import … from "*.glsl?raw"`, which only a bundler resolves — a static import or a value export crashes every Node consumer (both game servers, `run-sim`, `world-preview`, `citadel-sim`, `hollow-sim`) with `ERR_UNKNOWN_FILE_EXTENSION`. This happened once during the migration and **typecheck plus 689 passing tests did not catch it.**
  2. **Verification must include running things.** A green typecheck and a green suite say nothing about whether the app or the headless tools still start. `npm run build`, `sim`, `sim:citadel`, `sim:hollow` and `preview` are part of the gate, not ceremony.

## Assets

- **Build-time procedural atlas** via [tools/atlas-builder](../../tools/atlas-builder/). PNG + JSON manifest. No external art pipeline.

## Art / Palette

- **A fixed color palette is mandatory per game — no raw hex anywhere.** Every color drawn anywhere (sprites, tiles, particles, day/night wash, all HTML/canvas UI) must be a named palette-role constant. **Engine + Farm = EDG32** (Endesga-32, <https://lospec.com/palette-list/endesga-32>). **Citadel = Apollo-46** (<https://lospec.com/palette-list/apollo>) as of 2026-07-13 — EDG32's gamut lacked the desaturated earthy midtones a cozy medieval town wants; see [citadel-decisions #28](citadel-decisions.md). The guard is per-scope (below).
  - **Single source of truth:** [engine/core/src/render/palette.ts](../../engine/core/src/render/palette.ts) exports `EDG32` (the 32 hex colors), `EDG` (named constants — use these in code), `EDG32_SET`, and `isEdg32()` / `nearestEdg32()` / `rgbOf()` helpers. Re-exported from `@engine/core/render`.
  - **No raw hex literals.** New code references `EDG.<name>`; the atlas `SWATCH` table uses EDG32 RGB tuples. Day/night and particle *gradients* lerp between EDG32 anchors with alpha — the anchors are on-palette; the per-pixel interpolated tint is a deliberate overlay, not a flat fill.
  - **Citadel's palette** lives at [games/citadel/client/src/render/citadel-palette.ts](../../games/citadel/client/src/render/citadel-palette.ts): `APOLLO` (46 hex), `APOLLO_SET`, `nearestApollo()`, and `CITADEL_PAL` — the **same 32 role keys as `EDG`** remapped to Apollo hex (luminance ordering preserved per ramp). Citadel code imports it as `CITADEL_PAL as EDG`, so role-named call sites are unchanged. Shared `@engine/ui` chrome is re-skinned by injecting a Citadel Apollo `Theme` ([ui/citadel-theme.ts](../../games/citadel/client/src/ui/citadel-theme.ts)) — the engine defaults stay EDG32, so Farm is unaffected.
  - **Enforced by test (per-scope):** [engine/core/src/render/palette.test.ts](../../engine/core/src/render/palette.test.ts) scans every `engine/` + `games/` + `tools/` source file and fails on any off-palette `#rgb`/`#rrggbb` literal — validating files under `games/citadel/` against **Apollo** and everything else against **EDG32**. It asserts the atlas `SWATCH` tuples are all EDG32 (Farm), checks `EDG` ⊆ `EDG32` and `CITADEL_PAL` ⊆ `APOLLO`, and keeps a tiny documented allowlist (currently empty). Since the engine never imports a game, the Apollo swatches are inlined in the engine-side scan and pinned to the Citadel module by a colocated Citadel test so they cannot drift.

## Concurrency

- **Sim runs in a Web Worker** (moved 2026-05-29) — ***superseded for Farm by the client/server split
  below; still how Citadel, Hollow and MateQuest run.*** Read the next bullet before acting on this one. The Worker owns the ECS `world` and the fixed-step clock; each tick it posts a `RenderSnapshot` (plain, structured-clone-friendly) to the main thread. The main thread keeps the latest two snapshots and **interpolates sprite positions between them** (the prevX/prevY interpolation that used to live on the entity Transform). Transport is `postMessage` only — **no SharedArrayBuffer**, so no COOP/COEP cross-origin-isolation headers are required. See `games/farm/client/src/worker/` (`sim-worker`, `sim-client`, `snapshot`, `snapshot-builder`) — *that
  directory is gone: the Worker was deleted by brief 58 and what remained was renamed `worker/` → `net/`
  by brief 115, so the live path is [games/farm/client/src/net/](../../games/farm/client/src/net/).*
  - Determinism is preserved: the sim only depends on the tick *count*, never wall-clock, so driving ticks from the Worker's `setInterval` changes nothing. `npm run sim` (headless, no Worker) and the in-browser Worker run produce identical sim outcomes for a seed.
  - The headless `run-sim` tool and all unit tests still drive `bootstrapSim` + `scheduler.tick` directly on the main thread (no Worker) — the Worker is a rendering/UX boundary, not a sim dependency.
- **Client/server split** (briefs 55–58, 2026-06-10) — _done (code; prod deploy unverified — see below)._ The sim was relocated from the in-browser Web Worker into a long-running **Node.js** process; the renderer is now a pure client over a **WebSocket** carrying the *same* `WorkerInbound`/`WorkerOutbound` protocol (`@farm/sim-core/protocol`). Brief 56 extracted `@farm/sim-core`; brief 57 added `games/farm/server` (`@farm/server`): a `ws` `WebSocketServer` (`ws` 8.21.0 — the repo's one runtime dep beyond the engine; Node has a WS client but no server), **one sim per connection**, the worker tick-loop ported verbatim into `SimHost` (`send` callback + `handleInbound` instead of `postMessage`/`onmessage`), **drop-stale backpressure** (skip per-tick snapshots when `ws.bufferedAmount` is high; never drop static-layer/profile), and the **WASM** pathfinder read from `engine/wasm-modules/dist/` to match the browser. `npm run server` starts it.
  - **Brief 58** reskinned `SimClient` to a WebSocket transport (public API unchanged → `main/*` untouched), **deleted the in-browser Worker** (`sim-worker.ts`), and made `npm run dev` start both server + Vite (Vite proxies `/sim` → `ws://localhost:8787`). Verified live in-browser via Playwright: connects, renders the full game off the server, pause freezes the tick, resume advances it. The WASM-bytes fetch on the client is gone (the server owns the pathfinder).
  - **Prod hosting:** the static client is served by Caddy as before; the server runs under **pm2** (`farm-valley-sim`), and the per-project Caddy snippet reverse-proxies `/farm-valley/sim` → `localhost:8787` (placed before the static `handle_path`). `deploy.ts` gained a `server` phase (rsync monorepo source minus node_modules → `npm ci` on the box → `pm2 reload`-or-`start`), wired into `all` and `npm run deploy:server`. **The deploy automation is dry-run-verified only** — actual VPS execution (npm ci on the box, pm2, Caddy reload, WS through the proxy) is unverified until run against the real server.
  - **Pathfinder choice is load-bearing:** the JS (`run-sim`) and WASM (browser/server) pathfinders are **not route-equivalent** — same seed, different equal-cost paths, different outcomes. The server uses WASM to preserve what players see; the determinism baseline for the split is captured with `PATHFINDER=wasm` on `run-sim` (a new env knob), not the default JS.
  - **Per-run render memo:** `snapshot-builder/sprites.ts` moved its `lastIntention`/`lastFacing` memos from module globals into a per-run `SnapshotSpriteState` (the server passes one per connection), so multiple sims in one process don't cross-contaminate cosmetic facing. Callers that omit it fall back to a shared default (browser worker, tests) — byte-identical to before.
- **Scale target:** 50–100 agents. Engine APIs should not assume that ceiling.

## WASM

- **AssemblyScript** for native-speed kernels — TypeScript-shaped, no native toolchain, ships as an npm package. See [engine/wasm-modules/README.md](../../engine/wasm-modules/README.md).
- **Built artifacts committed** under `games/farm/client/public/wasm/` so fresh clones don't need to build wasm first.

## Source-of-truth for gameplay

The Python SPADE prototype (XMPP + FIPA-ACL + BDI + FSM) is the gameplay spec. The TS rewrite ports the agent semantics — performative + ontology + body, BDI components, FSM states, day-clock — onto the ECS engine. When the Python design and the TS implementation disagree, the Python design wins unless explicitly overridden here.
