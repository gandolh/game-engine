# Brief 57 — Node WebSocket sim server

**Status:** todo. **Type:** new package (additive). **Parent:** [55-client-server-split](55-client-server-split.md). **Depends on:** [56](56-extract-sim-core-package.md).

## Goal

Stand up `packages/server` — a long-running **Node.js** process that owns the running sim and bridges its protocol over a **WebSocket**. It is the relocation of `sim-worker.ts`'s *host loop* (pacing, pause/speed/step/skip-to-highlight, snapshot emission) from the Web Worker into Node, plus a WS transport in place of `postMessage`.

This brief stops at "the server runs and streams correctly, proven by a headless test client." Wiring the *browser* renderer to it is brief 58.

## Package

- `packages/server`, name `@farm/server` (or `farm-valley-server`). Node-only.
- Depends on `@farm/sim-core` (the world + bootstrap + snapshot builder + protocol types) and `@engine/core` (`createPathfinderFromBytes`, `Profiler`). Pinned versions, no `^`/`~`.
- One small runtime dep is acceptable here (the repo is otherwise zero-dep, but a WS server in raw Node `http` + the `ws` library is the standard; if the user prefers zero-dep, Node ≥22 has no stable built-in WS *server*, so use `ws` — pin it). Confirm in execution.

## What it does (port of `sim-worker.ts`)

The server's per-connection (or per-run) handler is a near-copy of [`sim-worker.ts`](../../../packages/farm-valley/src/worker/sim-worker.ts)'s `init` path, with these substitutions:

| Worker today | Server |
|---|---|
| `self.onmessage` receives `WorkerInbound` | WS `message` event parses `WorkerInbound` (JSON) |
| `self.postMessage(msg)` | `ws.send(JSON.stringify(msg))` |
| `msg.pathfinderWasm` transferred from main thread | server reads `pathfinding.wasm` from disk (`fs.readFile`) → `createPathfinderFromBytes`; fall back to `JsPathfinder` if absent |
| `setInterval(..., 1000/tickRateHz)` | identical `setInterval` (still pacing-only — determinism unaffected) |
| static-layer + snapshot + profile messages posted | same messages sent over WS |

**Everything else stays byte-identical**: the `runOneTick` body (copy prevX/prevY → `scheduler.tick` → `bus.notifySubscribers()` → `buildRenderSnapshot` → emit), the season re-bake, the shock subscription, pause/speed/step, skip-to-highlight (`shouldStopSkip` + `SKIP_MAX_DAYS`), the fault backstop. Reuse the moved code from `sim-core` — do **not** re-implement the tick logic; only the I/O changes.

## Serialization

- Snapshots are sent as JSON over the socket. `messages.ts` types already describe the payloads; `JSON.stringify(snapshot)` is what the profiler measures today (`snapshot.bytes`), so the size is a known quantity.
- **Measure before optimizing.** Instrument bytes/sec at 20 Hz with the existing `Profiler`. If JSON proves too heavy for the target connection, a binary codec is a follow-up — note the number, don't pre-build it.
- The static-layer message carries full `Canvas2dSprite[]` (with width/height) — sent once at start + on season change (4×/run). Fine as JSON.

## Lifecycle / topology

- One server process. On a new WS connection: start a run (or attach to the single running run — decide based on the multi-watcher note in 55; default simplest: **one run per connection** unless multi-watch is trivial).
- `init` message starts the loop; `stop` clears the interval; socket close = stop + cleanup (clear interval, drop world references) so a disconnect can't leak a ticking sim.
- Configurable port via env (`PORT`, default e.g. 8787). No secrets.

## Testing (no browser)

- A Node integration test (vitest, node env) that: opens a WS to an in-process server, sends `init`, asserts a `static-layer` message then a stream of `snapshot` messages arrive with monotonically increasing `tick`, sends `pause` and asserts snapshots stop, `step` advances exactly one, `gameOver` eventually arrives at end-of-run (use a small `maxDays`/`ticksPerDay` for speed).
- **Determinism across the wire**: run the server to completion for a seed, collect the final-standing snapshot, and assert it equals `npm run sim`'s headless result for the same seed/params. The socket must not change outcomes.

## Acceptance

- `npm run server` (new root script) starts the Node process; it serves WS and streams a live run.
- Headless WS integration test green; pause/speed/step/skip-to-highlight all work over the socket.
- **Determinism (fast version only): the server's run for seeds `0xc0ffee/1/42` produces output byte-identical to headless `npm run sim`** at `TICKS_PER_DAY=20 MAX_DAYS=3` — i.e. the transport is transparent. (No full 100-day / `CHECK_DETERMINISM` runs — see the umbrella gate.)
- `npm run typecheck` + `npm run test` green.
- Corpus: `architecture.md` gains the server in the layering + data-flow; `decisions.md` notes the WS transport + `ws` dep; `log.md` entry.

## Risks / watch-fors

- **WASM in Node**: `createPathfinderFromBytes` already works headlessly via run-sim — confirm the server uses the WASM pathfinder (not JS) so it matches the browser path exactly, and that both produce identical routes.
- **Backpressure**: at 20 Hz × speed-multiplier the server emits fast. If a slow client can't keep up, snapshots queue. For a watch-only sim, dropping intermediate snapshots is acceptable (the client interpolates) — but don't let an unbounded send buffer grow. Note the policy.
- **Don't reintroduce nondeterminism**: the server must not use `Date.now()`/`Math.random()` anywhere in the tick path (same rule as the worker). `setInterval` timing is pacing-only.
