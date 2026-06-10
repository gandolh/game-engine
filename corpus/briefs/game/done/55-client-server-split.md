# Brief 55 — Client/Server Split (umbrella + plan)

**Status:** todo. **Type:** architecture. **Batch:** 55–58 (this is the index; do not implement here).

## Goal

Break Farm Valley into two deployable parts:

1. **Backend** — a long-running **Node.js** process that owns the ECS world + scheduler and runs the deterministic sim. It is the authority over all game logic.
2. **Renderer** — the existing **Vite** app, which becomes a pure client: it renders `RenderSnapshot`s it receives over the wire and sends control/input messages back. No sim logic in the browser.

The transport between them is a **WebSocket** carrying the *exact same protocol* the sim Web Worker uses today (`WorkerInbound` main→sim, `WorkerOutbound` sim→main). We are not redesigning the boundary — we are relocating one side of it from a Worker to a Node process and swapping `postMessage` for a socket.

## Why this is tractable (read before scoping)

The sim↔render boundary already exists and is clean:

- The sim runs entirely inside [`worker/sim-worker.ts`](../../../packages/farm-valley/src/worker/sim-worker.ts) — it owns the `world`, the `scheduler`, the `dayClock`, and ticks via `setInterval` (wall-clock *pacing only*; see [decisions.md](../../wiki/decisions.md) — determinism depends on the tick count, never wall-clock).
- The protocol is already a typed message contract: [`worker/snapshot/messages.ts`](../../../packages/farm-valley/src/worker/snapshot/messages.ts) (`WorkerInbound`/`WorkerOutbound`, `WorkerInitMsg`, `WorkerSnapshotMsg`, `WorkerStaticLayerMsg`, …).
- The renderer already consumes the sim only through one facade: [`worker/sim-client/client.ts`](../../../packages/farm-valley/src/worker/sim-client/client.ts) (`SimClient`). Every `main/*` module (`render-loop`, `camera`, `playback`, `particles`, `static-layer`) depends on `SimClient`'s **public API**, not on the worker. **If `SimClient`'s public surface is preserved and only its internal transport changes, the renderer barely changes.**
- The **sim core is browser-API-free.** `sim-bootstrap.ts` + `systems/**` + `agents/**` + `world/**` + `economy/**` + `protocols/**` + `components/**` use no `document`/`window`/`fetch`/`self`. Only `sim-worker.ts` uses worker/browser APIs. So the sim moves to Node unchanged.
- Headless [`tools/run-sim`](../../../tools/run-sim/) **already** drives `bootstrapSim()` on the main thread in Node with a JS pathfinder fallback — i.e. running the sim outside a browser is a solved problem. The backend is essentially "run-sim, but stream snapshots over a socket and accept control messages."

So the work is: (A) extract the shared sim into its own package, (B) stand up the Node WS server around it, (C) reskin `SimClient` to speak WS instead of `postMessage`, (D) update deploy/hosting.

## Determinism is the non-negotiable acceptance gate

Determinism is load-bearing ([CLAUDE.md](../../../CLAUDE.md), [decisions.md](../../wiki/decisions.md)). **Every brief in this batch that moves or wraps sim code must end with a fast JSON diff against the pre-split baseline** — the contract here is *no behavior change at all* (this is a relocation, not a gameplay brief). Unlike the 41–48 wave, **the numbers must NOT move.** A JSON diff that differs is a regression, not a re-baseline.

**Gate = fast version only** (user directive 2026-06-10): `SEED={0xc0ffee,1,42} TICKS_PER_DAY=20 MAX_DAYS=3 EXPORT=json`, byte-diffed against a baseline captured before the batch (`/tmp/split-baseline/`, helper `check-fast.sh`). Do **not** run full 100-day runs or `CHECK_DETERMINISM=1` MATCH ×3 for this batch — the user chose fast iteration over full coverage. Accepted blind spot: 3 days doesn't reach festivals (day 13+), the mid-game shock (~day 50), orchard maturation, or the end-run recap.

WASM note: today the browser fetches `pathfinding.wasm` and transfers bytes into the worker; headless run-sim uses `JsPathfinder`. The backend should instantiate the **WASM** pathfinder from disk (Node `fs.readFile` + `createPathfinderFromBytes`) to match browser behavior byte-for-byte, falling back to `JsPathfinder` only if absent. Confirm the WASM and JS pathfinders produce identical routes (run-sim already supports both) so the choice doesn't move outcomes.

## The four execution briefs

Do them in order; each is independently shippable and determinism-verified.

| # | Brief | One-line |
|---|---|---|
| 56 | [Extract `@farm/sim-core` package](56-extract-sim-core-package.md) | Move sim systems/agents/world/economy/protocols/components + `bootstrapSim` + the snapshot **types & builder** out of `farm-valley` into a new Node-safe `packages/sim-core`. Behavior-preserving. |
| 57 | [Node WebSocket sim server](57-node-ws-sim-server.md) | New `packages/server` — a long-running Node process that imports `sim-core`, runs the tick loop, and bridges the `WorkerInbound`/`WorkerOutbound` protocol over WS. |
| 58 | [Renderer talks WebSocket; deploy both](58-renderer-ws-and-deploy.md) | Reskin `SimClient` to use a WS transport (public API unchanged); drop the in-browser Worker; update the deploy script + Caddy to host a static client **and** a pm2-managed Node service behind a WS reverse-proxy. |

> 56 is the heavy mechanical move (touches every sim import) and carries the most determinism risk — gate it hardest. 57 and 58 are additive/transport and lower-risk.

## Out of scope (deliberately)

- **No multiplayer / multi-client authority changes.** One server runs one sim; multiple browsers may *watch* the same stream (nice-to-have, note it but don't build it unless trivial). Player input (Pip) stays single-source as today.
- **No gameplay/balance changes.** This batch must not touch agent deliberation or the tick body's logic. (The standing balance/peer-interaction gap in [open-questions.md](../../wiki/open-questions.md) is a separate, higher-leverage track — not this batch.)
- **No new save model.** Replay/seed semantics are unchanged.
- **Web Worker stays available as a fallback?** Decide in 58: simplest is to remove the Worker path entirely (server is now the only sim host). If keeping a "local solo" Worker mode is cheap behind the same `SimClient` API, note it but default to removing it.

## Open questions to resolve during execution

- **Package naming/scoping.** `@farm/sim-core` vs `farm-valley-sim` — pick one consistent with the existing `@engine/*` convention; record in 56.
- **Snapshot size over the wire.** `postMessage` uses structured clone; WS needs serialization. JSON is simplest and the profiler already measures `snapshot.bytes`. If JSON is too heavy at 20 Hz, consider a binary codec — but **measure first** (57), don't pre-optimize.
- **Tick pacing ownership.** Today the worker's `setInterval` paces ticks and pause/speed/step/skip-to-highlight all live worker-side. All of that moves to the server (57) unchanged in logic.
- **Dev ergonomics.** `npm run dev` must bring up both the Vite client and the Node server (Vite proxy for the WS, or a concurrent runner). Define in 58.

## Acceptance (umbrella)

- All four briefs done; `npm run typecheck` + `npm run test` green; fast JSON diff clean vs pre-split baseline (3-day/3-seed, per the gate above).
- `npm run dev` launches client + server; the browser renders a live run identical to today's behavior, with working pause/speed/step/skip-to-highlight and Pip input.
- Deploy provisions a static client + a long-running Node service; the public URL serves a live sim.
- Corpus updated: `architecture.md` (new layering diagram), `decisions.md` (the split + transport decision), `status.md`, and this batch moved to `done/`.
