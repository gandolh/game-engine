# Brief 72 — Shared-run server: one sim per run, broadcast to N spectators (lobby-ready)

**Status:** todo · **Area:** `@farm/server` (run registry + broadcast) + `@farm/sim-core` (protocol) + `packages/farm-valley` (client attach) · **Drafted:** 2026-06-10

## Why

Today the server spawns **one full `SimHost` per WebSocket connection** ([server/src/index.ts](../../../../packages/server/src/index.ts) — `new SimHost(send, …)` inside `wss.on("connection")`). The brief-09 close-out ramp ([probe-perf.ts](../../../../tools/run-sim/src/probe-perf.ts), numbers in [wiki/performance.md](../../../wiki/performance.md) → "Measured results (2026-06-10)") measured what that costs:

- **~8% of a dev core + ~25 MB RSS per viewer**; ~80% of one core + 528 MB at 10 viewers — on a **single Node thread**, so the hard ceiling is ~12–15 viewers before ticks starve. On the prod target (small ~2 vCPU VPS) 10 viewers ≈ 1–1.6 cores: it fits, with no headroom.
- Each viewer gets a **private world** — two people opening the same link watch *different* runs, which contradicts the spectator pitch outright.
- Wire bandwidth is a non-issue (~150 KB/s/viewer after 14× deflate); the waste is sim CPU and N× `JSON.stringify` of ~100–126 KB snapshots.

**Direction lock (user, 2026-06-10):** the future is **multiplayer lobbies — max 5–10 human players per lobby, each replacing an agent (reusing an agent island)**. Per-connection private sims are a dead end for that; one-shared-run-per-lobby with broadcast is the skeleton it needs. This brief builds the skeleton only — no lobby/membership/Pip-multiplayer mechanics yet.

## Read first

- [wiki/performance.md](../../../wiki/performance.md) — Measured results (2026-06-10) + T1.1 ranked snapshot fixes (items 1–2 may already be landed by the time this runs; items 3–4 belong HERE).
- [server/src/index.ts](../../../../packages/server/src/index.ts) + [sim-host.ts](../../../../packages/server/src/sim-host.ts) — per-connection lifecycle, drop-stale send, profiler plumbing.
- [sim-client/client.ts](../../../../packages/farm-valley/src/worker/sim-client/client.ts) — init/pause/speed/step/skip/input messages a run would now share; client-side caches (e.g. `wealthSeries` if T1.1 #1 landed) that late joiners must be seeded with.
- [protocols](../../../../packages/sim-core/src/protocol/messages.ts) — `WorkerInbound`/`WorkerOutbound`.

## Tasks

- [ ] **1. Run registry.** Server-side `Map<runKey, Run>` where `Run = { host: SimHost, sockets: Set<WebSocket> }` and `runKey` derives from the init params (seed/ticksPerDay/maxDays). First `init` for a key creates the run; later `init`s with the same key **attach** instead of spawning. A run with zero sockets stops after a grace period (don't tick empty worlds forever).
- [ ] **2. Encode-once broadcast.** `SimHost`'s `send` callback becomes a run-level fan-out: stringify each outbound message **once**, send the same payload to every attached socket. Keep the per-socket drop-stale check (`bufferedAmount > 1 MB`) — one slow client must not stall the others. Note: `permessage-deflate` still compresses per-socket; if 10-viewer CPU stays material, measure disabling it vs. pre-deflating once (server CPU vs. wire size trade — decide on numbers, not vibes).
- [ ] **3. Late-joiner attach.** A socket attaching to a live run needs: the static-layer message (cache the last one on the run), the latest snapshot, and any client-cached incremental state the protocol has grown (e.g. the full `wealthSeries` if it's day-boundary-only by then). Define an `attach` reply that replays these before normal snapshot flow.
- [ ] **4. Run-scoped playback semantics.** pause/speed/step/skip/Pip-input currently assume a private sim. Simplest correct policy for this brief: **the first-attached socket is the run owner** — control + Pip input accepted only from it; spectators get state but their control messages are ignored (client hides controls when not owner, via an `owner: boolean` field in the attach reply). Lobby-grade control negotiation is future work.
- [ ] **5. Fold in the T1.1 protocol slimming (items 3–4)** while the protocol is open: coarse static/dynamic sprite split (≈70% of snapshot bytes — 358 of ~400 sprites change ~daily) and default-field omission on sprites. Tooltip `label`/`description` move to the on-change table if T1.1 #2's "bigger fix" hasn't landed.
- [ ] **6. Re-run [probe-perf.ts](../../../../tools/run-sim/src/probe-perf.ts)** (needs user sign-off — loads the box) with all clients hitting the SAME runKey: server CPU should be ~flat in viewer count (one sim + N cheap sends), vs. today's ~8%/viewer slope. Record before/after in performance.md.

## Constraints

- **Determinism untouched.** This is transport/host topology only; `bootstrapSim()`, the scheduler, and headless run-sim/tests must not change. Same seed + params → byte-identical run regardless of viewer count. Gate: typecheck + tests + the fast 3-seed × 3-day × ticks=20 `EXPORT=json` diff (WASM pathfinder).
- Headless tests for the server (`packages/server`) should cover: two sockets/same key share one world (same tick stream), owner-only control, late-join replay, zero-socket reaping.
- Keep `SimHost` unaware of sockets (it already takes a `send` callback) — the registry owns fan-out.

## Acceptance

- Two browser tabs on the default URL watch the **same** farmers at the same tick; pausing in the owner tab pauses both.
- 10 synthetic viewers on one run cost ≈ one sim (probe-perf re-run shows near-flat CPU vs. viewer count).
- A tab opened mid-run renders immediately and correctly (static layer + caches replayed).
- Fast determinism gate passes; all workspace tests green.

## Risks / notes

- **Playback-control UX changes meaning** (run-wide, owner-only). That's inherent to a shared world — surface it in the UI rather than pretending controls are private.
- Pip: exactly one Pip per run (the owner's). Multiple player characters = the lobby brief, not this one.
- The seed-picker flow currently implies "my own run"; sharing a seed now means sharing a world. If private runs stay desirable for tinkering, a `?private` escape hatch is cheap (registry just never shares that key) — decide during implementation.
