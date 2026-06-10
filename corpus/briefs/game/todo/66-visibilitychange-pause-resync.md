# Brief 66 — `visibilitychange` pause + resync in the WS sim client

**Status:** todo (returned 2026-06-10 — was moved to done/ prematurely by a bulk save; no implementation exists on any branch) · **Area:** `packages/farm-valley` (worker/sim-client + main render loop) · **Drafted:** 2026-06-10

While the tab is hidden the browser throttles/stops `requestAnimationFrame`, but WebSocket snapshots keep arriving from `@farm/server`. On return, the wall-clock `alpha` math spikes and the just-arrived snapshot pair can be seconds apart → a visible stutter or a burst of sprites lerping across the map. Render/transport-only; **zero sim/determinism impact**. Chosen direction (open-questions round 2026-06-10): **pause + full resync**, not just a clock reset.

## Read first

- [corpus/wiki/performance.md](../../../wiki/performance.md) Tier 1.3 — WS transport notes (this item is listed there).
- [packages/farm-valley/src/worker/sim-client/client.ts](../../../../packages/farm-valley/src/worker/sim-client/client.ts) — the whole interpolation story lives here.

## Current state (verified against code 2026-06-10)

- No `visibilitychange` / `document.hidden` handling exists anywhere in `worker/sim-client/` or `main/`.
- `client.ts` keeps `prevSnapshot` + `currentSnapshot`; `onmessage` stamps `lastSnapshotArrivalMs = performance.now()`; `getInterpolatedSprites()` computes `alpha = clamp((now - lastSnapshotArrivalMs - renderDelayMs) / msPerTick, 0, 1)` (smoothstepped).
- `renderDelayMs` is now **2 ticks** (changed 2026-06-10 in the same open-questions round) — the resync logic must respect that constant, not hardcode a margin.
- The render loop is [main/render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts).

## Tasks

- [ ] **1. Hidden path.** On `document.visibilitychange` → hidden: set an internal `hiddenResyncPending` flag in `SimClient`. While hidden, `onmessage` keeps only the latest snapshot and **does not** retain a `prevSnapshot` pair that straddles the hidden gap (set `prevSnapshot = null` / clear `prevById`) so nothing lerps across it.
- [ ] **2. Visible path.** On visible: reset `lastSnapshotArrivalMs = performance.now()`, leave `prevSnapshot` null until the next snapshot arrives (sprites snap to current positions for one tick, then interpolation resumes naturally).
- [ ] **3. Wire-up.** Register the listener where the client is constructed (main side), or inside `SimClient` guarded by `typeof document !== "undefined"` so headless/tests are unaffected. Prefer the latter (keeps the public API unchanged).
- [ ] **4. Unit test** (jsdom): simulate hidden → deliver 3 snapshots → visible → assert `getInterpolatedSprites()` returns current positions (alpha pinned, no lerp from a pre-hidden snapshot) and that the next normal snapshot resumes interpolation.
- [ ] **5.** `npm run typecheck` + `npm run test -w farm-valley`. Manual check in `npm run dev`: hide the tab ~30 s, return — no avalanche of fast-forwarding sprites, no freeze.

## Acceptance

- Returning to a hidden tab shows the *current* world state immediately (one snap), then smooth interpolation — no burst, no spike.
- Headless run-sim and all existing tests untouched (no `document` dependency leaks into shared code paths).

## Risks / notes

- **Low.** Purely client-side display logic. Don't touch the server pacing — the sim keeps running while hidden by design (it's a spectator sim, the world should advance).
- Pause/`setPaused` UI semantics are separate — do not auto-pause the sim on hide.
