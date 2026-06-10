# Brief 09 — Performance optimization pass

**Status:** done (closed 2026-06-10) · **Area:** engine + farm-valley render/worker · **Drafted:** 2026-06-05

> **Close-out (2026-06-10).** All actionable items shipped 2026-06-05 (P0, P1, #6); #7 and P3 were deferred behind explicit profiling gates. The 2026-06-10 client/server split (briefs 55–58) then changed the boundary this brief was written against, so the gates were **re-evaluated under the real current architecture** (Node server, one SimHost per WebSocket, 21-farmer world) with [probe-perf.ts](../../../../tools/run-sim/src/probe-perf.ts) ramping 1→5→10 concurrent viewers. Result: #7 stays dead in its original form — snapshot raw size did cross the byte threshold (~100–126 KB/tick vs the 36 KB recorded here) but no budget is pressured (snapshot.build 0.3 ms, client frame 6 ms, permessage-deflate 14× → ~7 KB/snap on the wire). The cost that actually scales is **one full sim per connection** (~8% of a dev core + ~25 MB RSS per viewer), which no snapshot codec fixes — that work moved to the shared-run brief ([game/todo/72](../../../game/todo/72-shared-run-lobby-server.md)) and the snapshot-payload items to [wiki/performance.md](../../../wiki/performance.md) T1.1. Full numbers in performance.md → "Measured results (2026-06-10)".

Source analysis: [wiki/performance.md](../../../wiki/performance.md). Per-tick/per-frame hot spots were mapped against actual code; this brief turns the findings into ordered, shippable tasks.

## Guardrails (apply to every task)

- **Determinism is load-bearing.** Each task is a refactor of *how* state moves, never *what* is computed. Prove behavior-preservation with **multi-seed `EXPORT=json` diffs**, not just `CHECK_DETERMINISM=1`. See root [CLAUDE.md](../../../../CLAUDE.md).
- Run `npm run typecheck` + `npm run test` before each task is considered done.
- EDG32 palette guard still applies to any new render code.
- One task = one focused commit where practical.

## Priority order

Ordered by **(impact ÷ effort) × safety**. P0 first — it makes every later task measurable. P1 = mechanical, low-risk, high-value. P2 = bigger or riskier, do after P1 lands and profiling justifies it. P3 = explicitly deferred.

---

### P0 — Profile before optimizing

- [x] **0. Instrument the worker tick + render frame.** ✅ **Done 2026-06-05.** Added a dependency-free `Profiler` ([packages/engine/src/debug/profiler.ts](../../../../packages/engine/src/debug/profiler.ts), exported from `@engine/core`): rolling ring of samples per named metric → count/mean/min/max/p50/p95/last, with a no-op fast path when disabled. Wired:
  - **Worker** ([sim-worker.ts](../../../../packages/farm-valley/src/worker/sim-worker.ts)) times `"tick"` (scheduler.tick) and `"snapshot.build"`, and records `"snapshot.bytes"` (JSON length, only when profiling on). Posts a `WorkerProfileMsg` every 60 ticks.
  - **Main** ([main.ts](../../../../packages/farm-valley/src/main.ts)) times `"interp"` (getInterpolatedSprites — the T1.2 target) and `"frame"` (whole frame body).
  - **Overlay** ([overlay.ts](../../../../packages/engine/src/debug/overlay.ts)) shows a mean/p95 block for all five metrics.
  - **Toggle:** opt-in via `?profile` on the URL (off by default → zero overhead). New protocol msgs `WorkerProfileToggleMsg` (main→worker) + `WorkerProfileMsg` (worker→main).
  - *Verified:* typecheck + 473 tests pass (incl. new [profiler.test.ts](../../../../packages/engine/src/debug/profiler.test.ts), 7 tests); `check-determinism` MATCH; production build OK.
  - *Why first:* prevents optimizing cold paths; T2.x (SharedArrayBuffer) should only proceed if this shows snapshot copy time is real.

---

### P1 — Mechanical, low-risk, high-value · ✅ **Done 2026-06-05**

Done together; all `EXPORT=json`-verified (before/after byte-identical, seeds 1/42/1337 over 100 days) + 473 tests + check-determinism MATCH + production build OK. Each item below is checked off with what shipped; item 5 was partially deferred (noted, not silently dropped).

- [x] **1. Pool per-frame interpolation.** ✅ Done — `getInterpolatedSprites()` reuses a pooled output array + records mutated via `copySprite`; `prevById` index rebuilt once per snapshot (in onmessage), not per frame. Map/`.map()`/spread gone from the hot path. Return is now pooled (documented): consume within the frame. `getInterpolatedSprites()` allocates a `Map` + array + per-sprite `{...s}` spread **every frame** ([sim-client.ts](../../../../packages/farm-valley/src/worker/sim-client.ts), [main.ts:500](../../../../packages/farm-valley/src/main.ts#L500)). Reuse a pooled array + sprite objects mutated in place; index prev-sprites by id **once** when the snapshot arrives (or use a dense indexed array if ids are dense). *Highest steady-state allocation source on the render thread.*

- [x] **2. Viewport-cull dynamic sprites + shadows.** ✅ Done — culling moved **into the renderer**: `beginFrame` computes the visible world rect (viewport + 32px margin); `push`/`pushShadow` reject off-screen centers. Every push site (snapshot sprites, foam, forge fire, meets, halo) culled for free, no call-site changes.

- [x] **3. Clip the static-layer blit to the visible source rect.** ✅ Done — `endFrame` intersects the camera rect with world bounds and blits only that region via 9-arg `drawImage`; the water `fillRect` is clipped to the same rect (pattern stays world-anchored so tiles don't shift).

- [x] **4. Kill loose per-tick/per-frame allocations.** ✅ Done:
  - crop-growth — `[...query("plot")]` spread → reused `plotScratch` member (typed `With<GameEntity,"plot">[]`), filled + sorted in place. (Runs once per **day boundary**, not per tick — small real gain; applied for consistency.)
  - event-feed — `const fresh = []` each tick → reused `this.fresh` member (`length = 0`).
  - canvas2d — `this.queue`/`shadowQueue = []` each frame → length-reset + index-append; sprite queue trimmed to live length before sort; shadow records pooled.

- [~] **5. Sort the render queue only when it changes.** ⚠️ **Partial / deferred.** The queue is now trimmed to its live length before `sort()` (no stale entries sorted), but a true sort-on-dirty was **not** added: with viewport culling the live set is tens of sprites, so the per-frame sort is negligible and dirty-tracking adds complexity for ~no gain at this scale. Revisit if the on-screen sprite count grows substantially.

---

### P2 — Snapshot boundary (bigger, do after P1 + profiling)

- [x] **6. Snapshot interim win (cheap half of T1.1).** ✅ **Done 2026-06-05**, but **scope corrected**: only the events double-alloc was fixed. `buildEvents` ([snapshot-builder.ts](../../../../packages/farm-valley/src/worker/snapshot-builder.ts)) replaced its `.slice().map()` with a pooled `eventsScratch` buffer mutated in place (records reused, trimmed to live count); aliasing contract documented (safe in prod via the postMessage clone).
  - ⚠️ **The brief's "rebuild observer/leaderboard only on day boundaries" idea was WRONG and was dropped.** Verified against code: observer `fsm`/`apCurrent`/`currentIntention`/`reasons` and leaderboard `gold`/`totalValue` all change **intra-day** (sell/buy/fish/mill credit gold on arbitrary ticks — [act.ts](../../../../packages/farm-valley/src/systems/act.ts)). Per-day caching would freeze the live observer/leaderboard — a visible regression. This is wiki/brief drift; the source-of-truth is the code.
  - *Verified:* typecheck clean, 473 tests pass, check-determinism MATCH. Behavior-preserving (same event contents, only allocation changed).

- [ ] **7. Packed numeric snapshot over transfer / SharedArrayBuffer (the big one).** **DEFERRED 2026-06-05 — profiling answered the gate: NOT worth building.**
  - **Profiling result (seed 0xc0ffee, ~300 entities):** `snapshot.build` = 0.08–0.09ms, `snapshot.bytes` ≈ 36KB/tick (~720KB/s), worker `tick` = 0.33ms total (incl. postMessage). The structured-clone cost is sub-millisecond and invisible in the tick/frame budget. Building #7 would add a packed binary layout + buffer ring + COOP/COEP risk for an unmeasurable gain.
  - **Re-trigger:** revisit ONLY if `?profile` later shows `snapshot.bytes` ≫ tens of KB/tick AND the worker `tick`/`frame` budget is actually pressured (e.g. a 10× entity-count increase).
  - **When triggered:** pack mutable sprite data (id/x/y/frame-index/layer/alpha) into a `Float32Array`/`Int32Array` ring of 2–3 buffers; `postMessage(buf, [buf])` (transfer) or `SharedArrayBuffer` (zero-copy read). Keep rare/variable payload (events, leaderboard, observer rows) on the structured-clone path. Prefer **transfer over SAB** to avoid the cross-origin-isolation requirement.
  - ⚠️ `SharedArrayBuffer` needs cross-origin isolation (COOP/COEP headers) — trivial in Vite dev, **must be verified for production hosting** before committing to SAB. If hosting can't guarantee it, use transferable buffers instead.

---

### P3 — Explicitly deferred — **profiling confirmed not worth doing (2026-06-05)**

Recorded so they stay conscious decisions, not oversights. The `?profile` run (see Measured results in [wiki/performance.md](../../../wiki/performance.md)) settled both: the full sim tick over ~300 entities is **0.33ms (~0.7% of the 50ms budget)**, so there is no per-tick or cache-locality cost for either item to recover.

- [ ] **Archetype / SoA ECS rewrite** — 5–10× cache wins need thousands+ entities; Farm Valley has ~4 farmers + tens of entities. Tick is already 0.33ms. High-effort, near-zero payoff, fights determinism. Revisit only if entity counts grow by orders of magnitude.
- [ ] **Extra path caching** — pathfinder is only called on a *new* travel intent with no active path ([travel.ts:57](../../../../packages/farm-valley/src/systems/travel.ts#L57)); not a per-tick cost. Profiled tick (pathfinder included) is sub-ms. Defer.

## On completion

When tasks ship: move this brief to `done/`, update [wiki/performance.md](../../../wiki/performance.md) (mark items done, record measured before/after numbers), update [wiki/status.md](../../../wiki/status.md), and append a `log.md` entry.
