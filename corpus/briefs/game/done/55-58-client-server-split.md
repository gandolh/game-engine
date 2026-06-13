# Game Briefs 55–58 — Client/server split

**Status:** Done (2026-06-10).
> Merged on 2026-06-13; original specs in git history.

Relocated the sim from a browser Web Worker into a long-running Node WS server; the Vite app became a pure WebSocket client. The wire protocol stayed the same (`WorkerInbound`/`WorkerOutbound`, postMessage→socket).

---

## 55 Umbrella/plan

- Defined the two-part architecture: Node backend owns ECS world + scheduler; Vite renderer is a pure client.
- Identified the existing sim↔render boundary (`SimClient` public API, `WorkerInbound`/`WorkerOutbound` message contract) as the stable seam to preserve.
- Established the fast determinism gate: `SEED={0xc0ffee,1,42} TICKS_PER_DAY=20 MAX_DAYS=3 EXPORT=json`, byte-diffed against a pre-split baseline — no behavior change permitted anywhere in the batch.
- Flagged that the JS and WASM pathfinders are not route-equivalent; the server must use WASM to match browser behavior.

## 56 Extract `@farm/sim-core`

- New workspace `packages/sim-core` (`@farm/sim-core`): houses `systems/`, `agents/`, `world/`, `economy/`, `protocols/`, `components/`, `sim-bootstrap.ts`, `run-descriptor.ts`, `run-recap/`, snapshot types + builder, and `sim-worker-skip.ts` logic.
- Message types (`WorkerInbound`/`WorkerOutbound`) moved to `@farm/sim-core/protocol`; both server and renderer import from there.
- Package is Node-safe and browser-safe — no `document`/`window`/`self`/`fetch`/`import.meta.env`; TS strictness (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) preserved.
- Snapshot builder sits at the top of the dep order (reads world, imports nothing from render); no circular-import issues arose.
- Determinism confirmed clean against pre-split baseline (fast gate).

## 57 Node WS sim server

- New package `packages/server` (`@farm/server`): a long-running Node process that runs `bootstrapSim()`, paces ticks via `setInterval` (pacing-only, determinism unaffected), and bridges the `WorkerInbound`/`WorkerOutbound` protocol over `ws` (pinned).
- Server reads `pathfinding.wasm` from disk via `fs.readFile` + `createPathfinderFromBytes`; falls back to `JsPathfinder` only if absent. Using WASM confirmed route-identical to browser path.
- Notable fix: `lastFacing` carried into `SnapshotSpriteState` — a per-run field that was silently dropped during the move; restored to maintain render fidelity.
- Snapshots sent as JSON at 20 Hz; profiler instruments bytes/sec; no binary codec needed at this scale.
- Backpressure policy: intermediate snapshots may be dropped for a slow client (renderer interpolates); send buffer is bounded.
- Headless WS integration test: opens in-process server, asserts static-layer → snapshot stream → pause → step → `gameOver`; determinism confirmed wire-transparent (fast gate).

## 58 Renderer over WS + deploy

- `SimClient` internal transport swapped from `new Worker(...)` / `postMessage` to `WebSocket`; public API (`init`, `stop`, `setPaused`, `setSpeed`, `step`, `skipToHighlight`, `sendInput`, `onSnapshot`, `onStaticLayer`, `getInterpolatedSprites`, `getFarmerInterpolatedPos`, …) unchanged — zero changes to `main/*` consumers.
- Client no longer fetches or transfers `pathfinding.wasm`; `init` message sent over socket once `onopen` fires (buffered if needed).
- `worker/sim-worker.ts` deleted; the Worker path is gone — server is the only sim host.
- WS URL from `VITE_SIM_WS_URL` env var (dev: Vite-proxied `/sim`; prod: same-origin `wss://…/sim` via Caddy).
- Deploy: static Vite `dist/` rsynced as before; `packages/server` rsynced + started/reloaded under **pm2**; Caddy per-project snippet extended with a `reverse_proxy /farm-valley/sim` WS-upgrade block ahead of the static `handle_path`. Main Caddyfile and sibling projects untouched.
- `npm run dev` launches both Vite client and Node server concurrently.
- End-to-end determinism confirmed: fast 3-day/3-seed JSON diff clean; pause/speed/step/skip-to-highlight + Pip input all work in the browser against the remote server.
