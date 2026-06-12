# Brief 10 (engine) — WASM pathfinder `unreachable` allocator fault

Promoted from [wiki/open-questions.md](../../../wiki/open-questions.md) (deferred there as "brief 73 task 4 — needs its own engine brief").

## Why

`WasmHeap.alloc` intermittently throws `RuntimeError: unreachable` under churn. It is caught per-intent in [TravelSystem](../../../../packages/sim-core/src/systems/travel/system.ts), so the sim survives, but the affected travel intent is silently dropped — the farmer just doesn't go. The 2026-06-10 `probe-perf` 10-sim ramp reproduced it loudly (`[travel] pathfinder fault from (x,y) to 'undefined'`, en masse) — live servers hit this too (see [wiki/performance.md](../../../wiki/performance.md), "Measured results (2026-06-10)" side-finding).

## Tasks

1. **Reproduce small.** A short headless run (low `MAX_DAYS`, `ticksPerDay=20`, WASM pathfinder) or a targeted alloc/free stress test against `WasmHeap` directly. Keep runs small per the resource constraints.
2. **Root-cause in the AssemblyScript side** ([packages/wasm-modules/](../../../../packages/wasm-modules/)): check alloc/free pairing across `findPath` calls, the AS runtime variant in use, and whether memory growth is ever requested. `unreachable` usually means an AS assertion/abort path, not OOM per se.
3. **Fix + regression test.** A unit test that hammers alloc/free at pathfinder-realistic sizes and asserts no throw. Re-run `npm run build-wasm` and commit artifacts.
4. **Re-check the catch site.** Once alloc is sound, decide whether TravelSystem's per-intent catch should stay (defensive) or escalate to a loud error (so the next fault class isn't silent).

## Guardrails

- **Likely baseline-mover:** today's faults silently drop intents; fixing them changes outcomes. Re-verify reproducibility with the fast 3-day/3-seed diff (WASM pathfinder — JS is not route-equivalent), and **ask the user before any determinism run** (resource rule).
- Don't swap in the JS pathfinder as the "fix" — the server baseline is WASM ([wiki/decisions.md](../../../wiki/decisions.md)).
