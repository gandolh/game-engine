# Brief 78 — Pip movement doesn't work (diagnose + fix the input→move chain)

> **CLOSED 2026-06-11 — NOT REPRODUCIBLE (no code fix needed).** Live instrumentation of every hop proved the chain healthy in a clean single-player `npm run dev`: client (`owner:true`) → registry (forwarded, `sockets:1`) → host (`applyWired:true`) → `PlayerControlSystem` moved Pip tile-by-tile with correct wall-collision. The reported symptom traced to **duplicate dev processes** from overlapping sessions (extra Vite/server instances) → a second socket attached as a **spectator** (`owner:false`) → `render-loop` swallowed its input (the brief's suspect #2, triggered environmentally — not a single-player code defect). Resolution: added a headless regression guard in `run-registry.test.ts` (owner input forwarded / spectator input dropped) and corrected the input-path section of `player-and-interaction.md`. No transport/sim code changed. The diagnostic tasks below are retained for the record.

**Status:** Done (closed not-reproducible) · **Area:** `packages/farm-valley` (input) + `packages/server` (sim-host) + `packages/sim-core` (PlayerControlSystem) · **Drafted:** 2026-06-11

The keyboard-controlled farmer **Pip** does not move in response to WASD / arrow keys. The symptom is reported live and not yet root-caused; this brief is a **diagnostic-first** task — bisect the input→sim chain, find where the signal dies, then fix it. Strong suspicion points at the **brief 72 worker→server (websocket) migration**, which inserted a server hop and an `owner` gate between the keyboard and the sim that previously did not exist.

## Read first

- [packages/farm-valley/src/main/render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts) (~L355–395) — reads the held axes from `keyboard`, then **gates the send on `client.owner`** and only calls `client.sendInput(...)` when the held axis **changes** (`moveChanged`). This is suspect #1 and #2 (see below).
- [packages/farm-valley/src/worker/sim-client/client.ts](../../../../packages/farm-valley/src/worker/sim-client/client.ts) — `sendInput()` (~L275) posts `{ type: "input", moveX, moveY, action, selectSlot }` over `this.ws` (a **websocket**, post-brief-72 — no longer a Worker `postMessage`). `owner` getter (~L336) returns `isOwner`, which **defaults `true`** (L99) and is only set `false` by an `{ type: "attach", owner: false }` server reply (~L162).
- [packages/server/src/sim-host.ts](../../../../packages/server/src/sim-host.ts) — `case "input"` (~L99) → `applyInput(...)`; `applyInput` (~L154) writes `pendingMoveX/Y`, `pendingAction`, `selectedSlot` onto the single `player` entity.
- [packages/server/src/run-registry.ts](../../../../packages/server/src/run-registry.ts) — fan-out + ownership: first socket gets `attach owner:true`; only `socket === run.owner` may send control messages (~L169). Confirm `input` is treated as owner-gated control or passed through.
- [packages/sim-core/src/systems/player-control/system.ts](../../../../packages/sim-core/src/systems/player-control/system.ts) — `PlayerControlSystem.run` consumes `pendingMoveX/Y`: velocity move (`PLAYER_SPEED = 1/PLAYER_STEP_TICKS`), per-axis AABB wall-slide, `canStand` = `isWalkable && !featureAt`. Note `pendingMove*` is **read but never cleared** here — held direction persists until a keyup sends `null`.
- [corpus/wiki/player-and-interaction.md](../../wiki/player-and-interaction.md) — the Pip design synthesis (movement is **not** AP-gated; facing is authoritative). Predates the brief-72 server migration — update it if the input path changed.

## Current state / chain

Keyboard → `render-loop` (held axes, `owner` gate, `moveChanged` gate) → `client.sendInput` → websocket → `sim-host` `case "input"` → `applyInput` writes `pendingMove*` → `PlayerControlSystem` moves the transform → snapshot → render. The break is somewhere on this line.

## Prime suspects (verify, don't assume)

1. **Server hop not wired in `npm run dev`.** Brief 72 migrated the local single-player path from an in-process Web Worker to a websocket-backed server (`packages/server`). If `npm run dev` doesn't actually start/connect the server, or `applyInput` is never assigned before the first input (it's set inside the async `start()` in sim-host, ~L154), early inputs are dropped silently. **Check first** — this is the highest-probability cause and would also have broken pause/skip controls if true.
2. **`owner` gate stuck false.** `render-loop` only sends input when `client.owner` is true. `isOwner` defaults true but is flipped by an `attach` reply. If the server sends `attach owner:false` on the single-player path (e.g. a second/duplicate socket attaches, or reconnect logic re-attaches as spectator), input is silently swallowed. Log `client.owner` at send time.
3. **`moveChanged`-only resend races the attach.** Input is sent **only when the held axis changes**. If the very first keypress fires before the socket is attached / `applyInput` is wired, it's lost, and since the axis hasn't *changed* since, it's never re-sent while the key stays held. A held key would then do nothing until released and re-pressed.
4. **`pendingMove*` never cleared.** `PlayerControlSystem` reads but doesn't reset `pendingMoveX/Y`. Confirm this is still intended (held-direction model) and that a missed keyup can't leave Pip drifting — or, conversely, that nothing else zeroes it between the write and the read.

## Tasks

- [ ] **1. Reproduce + instrument** — `npm run dev`, focus the canvas, press WASD. Add temporary logging at each chain hop: (a) `render-loop` — does `moveChanged` fire and is `client.owner` true? (b) `client.sendInput` — is the websocket `OPEN`? (c) `sim-host` `case "input"` — does it arrive, and is `applyInput` non-null? (d) `PlayerControlSystem` — are `pendingMoveX/Y` non-null on the player entity? Identify the **first** hop where the signal is absent.
- [ ] **2. Confirm the server path is live in dev** — verify `npm run dev` starts/connects `packages/server` and that the client websocket reaches `OPEN` before input is sent; confirm `applyInput` is wired before the first input is processed (guard or buffer if there's an async gap). (Suspect #1.)
- [ ] **3. Check ownership** — log/confirm `client.owner` is `true` on the single-player path and that the server isn't sending `attach owner:false` for the lone socket (duplicate-attach or reconnect-as-spectator bug). (Suspect #2.)
- [ ] **4. Fix the identified break** — minimal, targeted. If it's the `moveChanged`-vs-attach race (#3), options: send the current held axes once on attach, or resend held input until the worker acks, or drop the `moveChanged` gate and send every-frame held state (cheap; the worker already paces stepping) — pick the smallest change that doesn't reintroduce per-frame flooding.
- [ ] **5. Regression test** — add/extend a test that drives the full input path to Pip's transform. [player-control.test.ts](../../../../packages/sim-core/src/systems/player-control.test.ts) already covers `PlayerControlSystem` in isolation; add coverage for the **client→host→pendingMove** wiring (e.g. against `run-registry` / `sim-host` with a fake socket — see [run-registry.test.ts](../../../../packages/server/src/run-registry.test.ts)) so an `owner`/attach/async-wiring regression is caught headlessly.
- [ ] **6. Update the wiki** — fold the corrected input path (server hop + `owner` gate) into [player-and-interaction.md](../../wiki/player-and-interaction.md), which still describes the pre-brief-72 in-worker `postMessage` path. Add a `log.md` entry.
- [ ] **7. Verify** — `npm run dev`: WASD/arrows move Pip smoothly (held key = continuous walk, diagonal works, wall-slide intact); `E` action and `1–9` slot select still work. `npm run typecheck` clean, `npm run test` green.

## Acceptance

- Pip moves in response to WASD **and** arrow keys, including held-key continuous walk and diagonals, on a fresh `npm run dev` single-player run.
- The root cause is identified and documented (not just patched around), and a headless test now exercises the client→host→`pendingMove` wiring so the regression can't return silently.
- `player-and-interaction.md` reflects the actual post-brief-72 input path; `log.md` updated.

## Risks / notes

- **Determinism:** the sim consumes `pendingMove*` deterministically; the fix should be confined to the **input transport / wiring** (main thread + server message handling), not the seeded sim. Player movement is intentionally **not** AP-gated and is float/velocity-based — don't change the movement model while fixing transport.
- **Brief 72 is a skeleton.** The shared-run lobby (one sim, N spectators) landed as tasks 1–4 only, and briefs 73/74 deferred follow-ups — the single-player path may have regressed as collateral of the server migration. Treat the whole `client.owner` / attach / websocket boot sequence as in-scope for inspection.
- **Don't break spectators.** Whatever fixes single-player input must keep the brief-72 rule that **only the owner** forwards Pip movement/actions to a shared run (spectators may still read the keyboard for camera/`Space` recentre). Re-verify the spectator path isn't granted control by the fix.
