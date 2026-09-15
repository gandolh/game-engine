---
summary: Locked tech choices that future briefs must not relitigate — stack, sim, ECS, renderer (WebGL2-only as of 2026-08-18, migration shipped), assets, palette, concurrency, tick-pump/speed semantics, build & verify gates (the turbo cache-key rule, the Node-importable barrel rule), WASM, and the gameplay source-of-truth.
updated: 2026-09-15
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

## Tick pump & speed semantics (Citadel + Hollow)

**Fixed period, variable batch — Hollow's model wins over Citadel's prior one.** (audit-26,
2026-09-15.) All three Worker-hosted continuous sims (Citadel, Hollow; MateQuest has no pump — it's
turn-based, deliberately removed by audit-03) used to hand-roll their own `setInterval` lifecycle and
had silently drifted onto two different meanings of "speed": Hollow held the fire period fixed at a
base ms-per-tick and ran `speedMultiplier` ticks per fire; Citadel instead re-periodized the interval
itself (`1000 / (20 * speed)`) and tore down/recreated it on every speed change, producing a one-off
timing hitch exactly when the player worked the speed control. Alternatives considered: keep Citadel's
re-periodization (rejected — the hitch is user-visible and gets worse the more often speed changes);
let each game keep its own model (rejected — this is a duplicated concern with only one game-agnostic
answer, and the divergence itself was unintentional drift, not a considered choice per game).

Both workers now share one engine primitive, `createTickPump` in
[engine/core/src/runtime/tick-pump.ts](../../engine/core/src/runtime/tick-pump.ts) (`/runtime` barrel
export): a fixed-Hz `setInterval` whose period never changes for the life of the pump, plus a
per-fire `getBatchSize()` read fresh on every fire — so a caller changes how many logical ticks run
per fire (its own "speed") without ever touching the timer.

**Batch overrun: cap the batch and drop the debt — never accumulate.** A fire runs at most
`getBatchSize()` logical ticks and then returns, whatever the wall clock says. There is no catch-up
queue, no delta-time accumulator, and no computing "how many ticks should have run by now" from
elapsed wall-clock time. On weak hardware the sim simply advances slower in wall-clock terms; it must
never enter a death spiral trying to catch up. Determinism is unaffected either way — sim output
depends only on tick *count*, and `setInterval` is pacing only (see Concurrency, above).

Farm's client is intentionally NOT on this primitive — it's WebSocket-driven and the server
([@farm/server](../../games/farm/server/)) owns its own clock; forcing a client-side pump onto it
would fight that ownership rather than fit it.

## Build & verify gates

**`typecheck`/`test` use topological (`^task`) deps, not `dependsOn: []`.** (audit-01, 2026-09-13.)
The original `dependsOn: []` was a *deliberate* choice with a sound-sounding rationale written into
[turbo.json](../../turbo.json) — maximum parallelism, and each package reporting its own failure
independently rather than being skipped when an upstream one fails. **Do not restore it.** What that
rationale missed is that `^task` is also what folds an upstream package's source hash into the
downstream cache key. Every internal package exports raw TS source, so with `dependsOn: []` a
dependency could change and its dependents would still report a *cached success they never re-ran*.
Proven by experiment: adding a required field to `Personality` printed `18 successful, 1 failed`,
while `--force` showed **8 packages genuinely broken** — including two that reported cached success
while broken. Because [routing.md](../routing.md) makes `npm run typecheck` the verify gate between
dispatch waves, this silently weakened **every** "verified" claim made through a warm cache for as
long as turbo had been adopted. The parallelism concern is preserved instead by
`--continue=always` on the root scripts. `@engine/core`'s own `#test` override keeps `dependsOn: []`
legitimately — it has no workspace dependencies for `^` to resolve.

**A warm-cache green is only trustworthy because of the above.** When a run's conclusion depends on
it (a release, a behaviour-preservation claim), still force a cold pass — `turbo run typecheck
--force` — rather than reasoning about whether the key was right.

**The engine's public barrels must stay Node-importable.** (audit-19, 2026-09-15; enforced by
`engine/core/src/node-import.test.ts`.) `@engine/core`'s WebGL2 render passes import `*.glsl?raw`,
which is a Vite-only specifier — a plain Node consumer (`@farm/server`, the headless sim tools, any
Node test) crashes with `ERR_UNKNOWN_FILE_EXTENSION` the moment a barrel pulls that reach in as a
**value** import. Type-only reaches are fine, because they erase. This is invisible in the code: the
offending line looks like an ordinary export and typechecks perfectly. Before adding a value export
to a barrel, check the gate — and note that a green `npm run typecheck` plus a full green test suite
did **not** catch this class of break when it last happened (see Renderer), which is why CI has
startup-smoke steps that merely prove the entry points *start*.

**The publish fixture carries no lockfile.** (audit-35, 2026-09-15.)
`examples/library-consumer/` installs `@engine/core`, `@engine/ui` and `@engine/wasm-modules` from
tarballs packed out of the working tree, so a committed `package-lock.json` pins integrity hashes
that **any** engine source change invalidates — a plain `npm install` there fails `EINTEGRITY` by
construction. The lockfile is deleted rather than regenerated: a lock whose hashes are disposable
documents nothing, and regenerating it inside `pack-smoke` would commit churn on every engine edit.
The fixture is also outside the root `workspaces` on purpose, which is why it packs with
`npm pack -w <pkg>` — `npm pack --prefix <dir>` from the repo root packs the **whole monorepo**.
If a lockfile reappears in that directory, it is a mistake.

**A verify gate that does not re-read its input is not a gate.** (audit-36, 2026-09-15.)
`pack-smoke` ran green through an entire audit while the `@engine/core` tarball it validates
contained three files and no code. The fixture's dependencies are `file:` tarballs with **fixed
filenames**, and once audit-35 correctly deleted the lockfile there was no integrity hash left to
compare — so npm treated the already-unpacked copy in `node_modules` as satisfying the spec and never
re-extracted. The assertions passed against a *previous good install*. `pack-smoke` therefore removes
the fixture's `node_modules` before installing, and that step is load-bearing: without it the gate
reports on whatever it unpacked last, not on what was just built. The same caution generalises — when
a gate's input is an artifact rather than source, prove the gate can still go red by corrupting the
artifact, not by reasoning about the script.

**Stale-`dist/` cleanup belongs at the front of `build`, never in `prepack`'s second half.**
(audit-36, 2026-09-15.) `prepack` is `npm run build && pack-swap --to-dist`, so anything that removes
`dist/` inside `--to-dist` deletes what the build just produced and npm packs an empty tarball. The
cleanup exists because `noEmitOnError` is unset — a failing `tsc` still **emits** into `dist/` then
exits 1, aborting the pack before `postpack`/`--restore` can run — so it has to happen before `tsc`
does, in a `--clean-dist` mode wired ahead of the build. `postpack` still removes `dist/` on the
success path.

## WASM

- **AssemblyScript** for native-speed kernels — TypeScript-shaped, no native toolchain, ships as an npm package. See [engine/wasm-modules/README.md](../../engine/wasm-modules/README.md).
- **Built artifacts are committed in BOTH locations, and `engine/wasm-modules/dist/` is the
  canonical one.** (audit-34, ruled 2026-09-15; supersedes the earlier "only the browser copy is
  tracked" state.) `dist/` is what the package's own `exports` map resolves
  (`"./pathfinding.wasm": "./dist/pathfinding.wasm"`) and what **seven Node-side consumers** read —
  the Farm server, `@tool/run-sim`, and four test files. `games/farm/client/public/wasm/` stays
  tracked as well because it is a **Vite public-dir URL contract**: the client loads
  `${import.meta.env.BASE_URL}wasm/noise.wasm` at runtime, so that copy cannot move.

  **The rejected alternative matters.** Pointing the Node consumers at `public/wasm/` instead (so
  there is only one tracked location) was considered and refused: it would make the repo exercise a
  path the published package does not ship, so a broken `exports` map would pass every local test.
  The repo must read what consumers read. Keeping `build-wasm` as a required bootstrap step and
  fixing the docs instead was also refused — it leaves audit-29's drift guard permanently CI-blind.

  The cost that made this easy: the four `.wasm` files total **3.8 KB**. The generated `.wat` text
  dumps (~31 KB) are debug output and stay gitignored — `dist/` tracks `*.wasm` + `manifest.json`
  only.

- **Wasm drift is a hard CI failure, not a warning.** (audit-34, 2026-09-15.) With `dist/` tracked,
  CI no longer runs `build-wasm`, so audit-29's drift guard finally compares committed artifacts
  against committed source and **can** fail. It must. Editing an AssemblyScript kernel is therefore a
  two-step commit: change the source, run `npm run build-wasm`, commit both. That friction is
  deliberate and cheap — those kernels change roughly never, and a silent divergence between a
  committed binary and its source is precisely what audit-29 exists to catch.

## Hollow chronicle & headless export

**The chronicle is capped; the export is never silently short.** (audit-12, extended by audit-32,
2026-09-15.) The chronicle is a ring buffer, so a long run drops its oldest events rather than
growing without bound. Both surfaces that read it — the client store and `@tool/hollow-sim` — must
report the exact dropped count, in the printed run summary *and* in the exported artifact. Hollow is
a research instrument: an export that quietly truncates invalidates an analysis months later, when
nobody remembers the run.

**The headless cap is higher than the browser's, and still finite.** A CLI run has no DOM and a
different memory budget, so it gets its own explicit larger constant. It does **not** get an
unbounded chronicle: trading a truncated export for an OOM-killed run is a worse failure, and this
project runs on constrained hardware.

**Dropping events does not fail the run** — it warns and records, exit 0. Refusing to hand over the
data a run *did* collect helps nobody; the honesty requirement is satisfied by making it impossible
to analyse a truncated export unaware, which a summary line plus an export field does.

## Farm sim-host tick-fault policy

**On a mid-tick fault, the run halts and the client is told — it does not log-and-continue.**
(audit-17, 2026-09-13.) [`SimHost.runOneTick`](../../games/farm/server/src/sim-host.ts) used to wrap
the whole tick body — `scheduler.tick(...)` included — in a `try` whose `catch` only logged and nulled
`pendingShock`, after which `tick += 1` ran unconditionally. Systems run in a fixed, dependency-ordered
sequence ([system-ordering.md](system-ordering.md)); if system N throws, systems `1..N-1` already wrote
their mutations for that tick and `N..last` never ran — a world state no clean tick could ever produce
(e.g. inboxes written but never drained, since `PerceiveSystem` clears them and `MarketSystem` drains
them, both late in the order). The old code fed that corrupted state into the next tick forever, with one
console line as the only signal, on the one game whose sim runs unattended server-side (one per WebSocket
connection, under pm2, for 100 in-game days). `this.stop()` also lived inside that same `try`, above the
catch, so a throw before the `gameOver` check meant a *finished* run failed to stop too.

Two policies were rejected: **keep going** (a corrupted world is never better than a stopped one for an
unattended spectator sim — nothing downstream can tell a valid trajectory from a post-fault one, and
`CHECK_DETERMINISM` can't catch this class of bug since it compares two runs of the *same* seed that
would fault identically), and **halt silently** (a dead run with no client-visible signal is
indistinguishable from a frozen/stalled connection — worse than either working or loudly broken).

**What shipped:** the catch now mirrors what `start()` already does on a startup fault — it logs, calls
`this.stop()` (clears the interval, sets `stopped`), and returns without incrementing `tick`, so the
faulted tick's partial mutations are never turned into a snapshot and no further tick runs. It also sends
a new terminal `SimFaultMsg` (`{ type: "fault", tick, message }`, in `@farm/sim-core/protocol`) so a
connected client knows the run crashed rather than seeing a screen that has merely stopped moving.
`SimClient` ([net/sim-client/client.ts](../../games/farm/client/src/net/sim-client/client.ts)) exposes
this as `faulted` / `faultMessage` / `onFault(cb)` (same shape as `owner`/`onAttach`) and shows a small
self-contained banner ([fault-banner.ts](../../games/farm/client/src/net/sim-client/fault-banner.ts)) —
deliberately *not* wired into `main/render-loop.ts`'s canvas UI panels, so the signal doesn't depend on
the render loop still running.

A test seam, `SimHostOptions.onSchedulerReady` (test-only; never set in production), lets tests
`scheduler.add(...)` a throwing system without touching any real `@farm/sim-core` system — this is a
policy fix, not a claim that any real system throws today.

## Source-of-truth for gameplay

The Python SPADE prototype (XMPP + FIPA-ACL + BDI + FSM) is the gameplay spec. The TS rewrite ports the agent semantics — performative + ontology + body, BDI components, FSM states, day-clock — onto the ECS engine. When the Python design and the TS implementation disagree, the Python design wins unless explicitly overridden here.
