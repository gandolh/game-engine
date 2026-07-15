---
summary: The Farm Valley profiling record — how to measure (Profiler + ?profile + DebugOverlay), plus the 2026-06-05/06-10/07-15 measured tick/frame results that every optimization claim is scored against.
updated: 2026-07-15
---

# Performance — measurement harness & measured results

The **backlog** these numbers justify lives in [performance.md](performance.md).
This page is the evidence: never promote an optimization here without a before/after number.

## Measured results (2026-07-15, brief 118 — UI glyph-tint regression, before/after)

Machine: the affected Windows 11 box (AMD Radeon iGPU via ANGLE/D3D11, real GPU — not
SwiftShader), Playwright Chromium, canvas 1600×900 @ DPR 1, seed `0xc0ffee`, day 0–1, **all
panels open** (pre-117 default), default whole-world zoom. New `PROFILE_ENABLED`-gated
sub-timers: `ui.flush` (wall-clock of the Overlay2D UI-quad flush inside
`WebGpuRenderer.endFrame`) + `ui.quads` (count). Baseline = the uncached per-draw tint
composite; after = the per-(atlas, frame, rgb) tint cache (`4fd48dc`).

| metric (mean / p50 / p95) | baseline (uncached) | after tint cache |
|---|---|---|
| overlay fps | **3.36** | **57.06** |
| `frame` | 116.6 / 64.8 / 320.1 ms | 9.4 / 9.7 / 11.8 ms |
| `render.endFrame` | 107.4 / 59.5 / 308.1 ms | 6.1 / 6.5 / 7.4 ms |
| ↳ `ui.flush` | **106.0** / 58.1 / 305.8 ms | **5.2** / 5.6 / 6.4 ms |
| `ui.quads` (per frame) | ~1,950 | ~1,936 |
| `panels` (tree refresh/layout) | 2.9 ms | 1.3 ms |
| `pushSprites` | 5.6 ms | 1.4 ms |
| entityCount at capture | 693 | 917 |

**Attribution was unambiguous**: `ui.flush` was ~91% of the whole frame — every tinted glyph
quad paid a 5-op Canvas2D composite per draw. One cached composite per distinct
(atlas, frame, colour) later, the flush is ~20× faster at the same quad count and the frame is
back under the 16.6 ms budget with every panel open. `panels`/`pushSprites` improvements are
secondary (less timer interference at 280 ms frames). Baseline/post-fix exports:
`farm-valley-profile-seed-c0ffee-2026-07-15T17-09-02` / `…17-11-06` (session scratchpad;
schema `farm-valley-profile/1`).

## Measuring (P0 — shipped 2026-06-05)

A `Profiler` ([profiler.ts](../../engine/core/src/debug/profiler.ts), exported from `@engine/core`) is wired into the worker and render loop. Append `?profile` to the URL to turn it on; the [DebugOverlay](../../engine/core/src/debug/overlay.ts) then shows mean/p95 for:
- `tick` — `scheduler.tick` (worker)
- `snapshot.build` / `snapshot.bytes` — snapshot construction + payload size (worker; the T1.1 baseline)
- `interp` — `getInterpolatedSprites` (main; the T1.2 baseline)
- `frame` — whole render-frame body (main)

Off by default (zero overhead). Diagnostic only — measures host timing, never sim state. Use these numbers as the before/after baseline for every task below. Tracked in [briefs/engine/done/09-perf-optimization.md](../briefs/engine/done/09-perf-optimization.md) (closed 2026-06-10). Post-split the "worker" side lives in [sim-host.ts](../../games/farm/server/src/sim-host.ts) (server) and the toggle rides the WS protocol.

### Measured results (2026-06-05, seed 0xc0ffee, post-P1/P2, ~250–300 entities)

| Metric | mean | p95 | budget | utilization |
|---|---|---|---|---|
| `tick` (sim) | 0.33–0.37 ms | 0.50–0.70 ms | 50 ms (20Hz) | **~0.7%** |
| `snapshot.build` | 0.08–0.09 ms | 0.20 ms | — | negligible |
| `snapshot.bytes` | ~36 KB/tick (~720 KB/s) | — | — | sub-ms clone |
| `frame` (render) | 1.36–1.69 ms | 2.0–2.3 ms | 16.6 ms (60fps) | **~10%** |
| `interp` | 0.03–0.04 ms | 0.10 ms | — | negligible |
| fps | ~60 | — | vsync | not a self-imposed cap |

**Conclusion: the engine is far under budget everywhere.** 60fps is browser vsync (rAF), not a limiter we set — the render frame uses only ~10% of its 16.6ms budget and the sim tick ~0.7% of its 50ms. These numbers **settle the two gated items**: #7 (packed/SAB snapshot) and P3 (archetype ECS) both chase costs that don't exist at this scale — see "Explicitly NOT worth doing" below.

### Measured results (2026-06-10, post-split: Node server, one SimHost per WS connection, 21-farmer world)

Brief-09 close-out re-profile under the real serving architecture. Server side: [probe-perf.ts](../../tools/run-sim/src/probes/probe-perf.ts) (user-approved ramp, 1→5→10 synthetic drain-clients, real browser init: seed `0xc0ffee`, ticksPerDay 1200, 20 Hz, ~45 s sample/phase, WSL2 dev box). Client side: Playwright Chromium on `npm run dev` + `?profile`.

| Concurrent sims | Server CPU (of one core) | RSS | Achieved snapshot rate | Raw payload/snap | Wire/client | Deflate |
|---|---|---|---|---|---|---|
| 1 | 10.5% | 307 MB | 19.9/s | 99 KB | 141 KB/s | 14.1× |
| 5 | 44.7% | 412 MB | 19.9/s | 103 KB | 144 KB/s | 14.2× |
| 10 | **79.8%** | 528 MB | 19.9/s (no starvation) | 108 KB | 149 KB/s | 14.4× |

Sim-0 profiler across the run: `tick` mean 0.88 → 3.05 ms (grows with sim progression + event-loop contention; still ≤9% of the 50 ms budget), `snapshot.build` ~0.30–0.35 ms flat, `snapshot.bytes` 100 → 126 KB (grows intra-run — wealthSeries + crops). Client: `frame` 6.0 ms mean / 8.1 ms p95, `interp` 0.11 ms (T1.2 pooling holds), parsing 100 KB JSON at 20/s is comfortably absorbed.

One-snapshot composition (101.8 KB total): `sprites` 80.2 KB (302 sprites × ~266 B — each carrying hover `label`/`description` strings + serialized defaults `rotation:0`/`alpha:1`/`tintRgba`/`action:null`/`id:null`/`interpolate:false` every tick), `observer` 10.7 KB, `relationships` 5.0 KB, `wealthSeries` 2.4 KB (early-run; grows unbounded), `leaderboard` 2.2 KB. Confirms the T1.1 ranked-fix analysis.

**Verdicts.** (a) **~10 viewers fits a small 2-vCPU VPS, barely** — ~0.8 dev-core ≈ 1–1.6 small-VPS cores + ~530 MB RSS; all sims share one Node thread, so the hard ceiling is ~12–15 viewers before tick starvation. (b) **Brief-09 #7 (packed snapshot) stays dead in its successor form too**: bytes crossed the old re-trigger threshold (100–126 KB ≫ "tens of KB") but no budget is pressured — the scaling cost is whole sims per connection, which no codec fixes. (c) The real lever is **one shared run broadcast to N viewers** (~10× across the board) → [briefs/game/done/72](../briefs/game/done/72-shared-run-lobby-server.md); T1.1 items 3–4 fold into its protocol rework. (d) Wire bandwidth is a non-issue (10 viewers ≈ 1.5 MB/s ≈ 12 Mbps total).

⚠️ Probe side-finding: the 10-sim run loudly reproduced the open-questions "travel intents dropped en masse" issue — repeated `[travel] pathfinder fault from (x,y) to 'undefined'` with a WASM `RuntimeError: unreachable` escaping `Pathfinder.findPath` → caught per-intent in TravelSystem. Live servers hit this too; see [open-questions.md](open-questions.md).

