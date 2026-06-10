# Brief 58 — Renderer over WebSocket + deploy both parts

**Status:** todo. **Type:** transport swap + deploy. **Parent:** [55-client-server-split](55-client-server-split.md). **Depends on:** [56](56-extract-sim-core-package.md), [57](57-node-ws-sim-server.md).

## Goal

Make the Vite renderer a pure client of the Node server (brief 57): swap `SimClient`'s internal transport from the Web Worker (`postMessage`) to a WebSocket, **keeping `SimClient`'s public API identical** so the rest of the renderer is untouched. Then update deploy + hosting to ship a static client **and** a long-running Node service.

## Part A — Reskin `SimClient` to WebSocket

[`worker/sim-client/client.ts`](../../../packages/farm-valley/src/worker/sim-client/client.ts) is the only place the renderer touches the sim transport. Every `main/*` consumer (`render-loop`, `camera`, `playback`, `particles`, `static-layer`) uses its **public methods** (`init`, `stop`, `setPaused`, `setSpeed`, `step`, `skipToHighlight`, `sendInput`, `setProfiling`, `onStaticLayer`, `onSnapshot`, `onProfile`, the data getters, `getInterpolatedSprites`, `getFarmerInterpolatedPos`). **Preserve all of these signatures.**

Internal changes only:
- Constructor: open a `WebSocket(url)` instead of `new Worker(...)`. URL comes from config (dev: Vite-proxied `/sim` or `ws://localhost:8787`; prod: same-origin `wss://…/sim` via the reverse proxy in Part C). Read from `import.meta.env` (e.g. `VITE_SIM_WS_URL`) with a sane default.
- `init()`: today it `fetch`es `pathfinding.wasm` and transfers the bytes to the worker. **The server now owns the pathfinder** (it reads WASM from disk), so the client no longer fetches/transfers WASM — `init` just sends the `init` message (seed/ticksPerDay/maxDays/tickRateHz) over the socket once it's open. Buffer the init until `onopen` if the socket isn't ready yet.
- `onmessage`: parse `JSON` → `WorkerOutbound` and run the existing `static-layer`/`snapshot`/`profile` dispatch unchanged (the prev/current snapshot bookkeeping + `prevById` interpolation index logic stays exactly as-is).
- The send helpers (`setPaused`/`setSpeed`/`step`/`skipToHighlight`/`sendInput`/`setProfiling`/`stop`) become `ws.send(JSON.stringify(msg))` instead of `worker.postMessage(msg)`. Same message objects.
- `terminate()` → close the socket.
- Handle socket close/error: surface a connection-lost state to the UI (a thin overlay is enough — don't over-build). Optional: auto-reconnect; if cheap, add it; otherwise note as follow-up.

Import the message + snapshot **types from `@farm/sim-core/protocol`** (moved in 56), not from a local `worker/snapshot`.

## Part B — Remove the in-browser Worker

- Delete `worker/sim-worker.ts` and `worker/sim-worker-skip.ts`'s re-export shim (the pure `shouldStopSkip` already moved to `sim-core` in 56). The sim no longer runs in the browser at all.
- Drop the Vite `new Worker(new URL("../sim-worker.ts", …))` reference (it was the one module Vite referenced by URL — see the module-directory convention note in architecture.md; that exception goes away).
- Keep `worker/sim-client/` (now a WS client) and `worker/snapshot` type re-exports only if still referenced; otherwise repoint consumers to `@farm/sim-core/protocol`.
- If the user wants a "local solo" offline mode later, it can re-add a Worker behind the same `SimClient` API — but default is **remove**; the server is the only sim host.

## Part C — Deploy both parts

Today [`deploy/deploy.ts`](../../../deploy/deploy.ts) builds the static Vite bundle and rsyncs it; Caddy serves it as static files under `/farm-valley/` (per-project snippet — see brief on deploy hardening). Now we also need the Node service.

- **Client**: unchanged build + rsync of the static `dist/` (now points at the server via `VITE_SIM_WS_URL` baked at build time, or same-origin `/sim` proxied by Caddy).
- **Server**: rsync `packages/server` (+ its `node_modules` or an install step on the server), run it under **pm2** (the box already has pm2 per the deploy comments). Add `pre-deploy` provisioning for the pm2 process + a Caddy reverse-proxy block that upgrades `wss://…/farm-valley/sim` → `localhost:PORT`.
- **Caddy**: extend the per-project snippet (`farm-valley.caddy`) with a `reverse_proxy /farm-valley/sim ...` (WS upgrade) ahead of the static `handle_path`. Still a per-project snippet — never touch the main Caddyfile or sibling projects.
- **deploy script**: add a `deploy:server` phase (or fold into `deploy`) that builds nothing for the server (TS runs via Node type-stripping like the deploy script itself, or a small `tsc` build — pick the simpler), uploads it, and `pm2 reload`s it. Keep the brief-on-deploy-hardening safety (check REMOTE_DIR exists; never auto-create; per-project Caddy snippet).

## Part D — Dev ergonomics

- `npm run dev` must launch **both** the Vite client and the Node server. Either a concurrent runner (e.g. a tiny root script running both) or Vite's `server.proxy` to forward `/sim` WS → `localhost:PORT` while a separate `npm run server` runs. Define one approach; document in README + architecture.md.

## Acceptance

- Browser renders a **live run identical to today's behavior**: farmers move (interpolated), observer/leaderboard/feed/wealth-graph/relationship panels populate, day/night + seasonal tiles + particles render, pause/speed/step/skip-to-highlight + Pip input all work — all driven by the remote server.
- **Determinism unchanged end-to-end (fast version)**: a given seed renders the same run as before the split (and as headless `npm run sim`). The fast 3-day/3-seed JSON diff stays clean (the client is render-only, so this is really 57's guarantee surfaced in the browser — confirm by eye in the running app + via the fast diff). No full 100-day / `CHECK_DETERMINISM` runs.
- `npm run dev` brings up client + server with hot reload on the client.
- Deploy ships a static client + a pm2 Node service behind a Caddy WS reverse-proxy; the public URL serves a live, interactive sim. Sibling VPS projects untouched.
- `npm run typecheck` + `npm run test` green; no dead Worker code left.
- Corpus: `architecture.md` (final layering: `wasm-modules → @engine/core → @farm/sim-core → {@farm/server, farm-valley(renderer)}`, new data-flow diagram replacing the Worker boundary with the WS boundary), `decisions.md` (Concurrency section updated: sim moved Worker→Node service, transport postMessage→WS), `status.md`, `player-and-interaction.md` if the input path description changes; move briefs 55–58 to `done/`; `log.md` entry; `README.md` run instructions.

## Risks / watch-fors

- **`SimClient` API drift**: if any signature changes, every `main/*` consumer breaks. Keep them identical; the diff in `client.ts` should be transport-internal only.
- **Interpolation timing**: the client interpolates using `performance.now()` and arrival timestamps — over a network, jitter is higher than `postMessage`. The existing one-tick render-delay margin should absorb normal jitter; if not, widen `renderDelayMs` (render-only, no determinism impact). Test on a throttled connection.
- **Asset base path**: the static client still ships under the `/farm-valley/` sub-path (Vite `base`); the WS URL must resolve correctly under that sub-path behind the reverse proxy. Verify the `verifyBuild` base-path check still passes and the WS connects in prod, not just dev.
- **WASM no longer fetched by the client** — make sure removing the client-side WASM fetch doesn't break anything that assumed those bytes (only the worker used them; the renderer's static-layer noise bake uses `@engine/core`'s noise WASM separately — confirm that path is untouched).
