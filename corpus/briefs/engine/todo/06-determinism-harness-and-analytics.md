# Engine Task 06 — Determinism Harness + Run Analytics in run-sim

## Context

The entire architecture rests on one guarantee: **the sim is fully deterministic** (seed + input log replay byte-for-byte — see [decisions.md](../../../wiki/decisions.md)). Save/replay (Game Brief 17), shareable runs (18), and replayable event feeds (20) all depend on it. But nothing *enforces* it: a stray `Math.random`, `Date.now`, or `Map`-iteration-order bug could silently break determinism and no test would catch it. Separately, `tools/run-sim` prints a final leaderboard but emits no machine-readable data for balance analysis.

This brief hardens the guarantee in CI and makes the headless runner useful for tuning.

## Goal

1. **Determinism assertion**: a check (in `run-sim` and/or a vitest) that runs the same seed twice and asserts the two runs produce identical results — same per-day leaderboard, same final standings, same event sequence if available. Fails loudly on any divergence.
2. **Multi-seed sanity**: optionally run a handful of seeds and assert each is internally reproducible (run twice, compare) — catches seed-dependent nondeterminism.
3. **CSV / JSON export**: `run-sim` gains a flag/env (e.g. `EXPORT=csv`) that dumps per-day per-farmer rows (day, name, personality, gold, unsold, total, weather) for offline balance analysis.
4. **CI-friendly exit code**: determinism failure → non-zero exit so it can gate a pipeline.

## Files in scope

- `tools/run-sim/src/index.ts` — add a "run twice, diff" determinism mode and a CSV/JSON export mode, both env/flag-gated. Keep the existing human-readable default output unchanged when no flag is set.
- `tools/run-sim/src/determinism.test.ts` (or `packages/farm-valley/src/sim-bootstrap.test.ts`) — NEW vitest: boot two sims with the same seed, tick both to completion, assert identical leaderboards. This is the regression guard that lives in `npm run test`.
- `tools/run-sim/package.json` — ALLOWED only to add a script alias (e.g. `check-determinism`). No new deps.

## Files you must NOT touch

- `packages/engine/**` source — this brief verifies determinism, it doesn't change the sim.
- `packages/farm-valley/src/systems/**`, `agents/**`, `world/**`, `protocols/**`, `ui/**`, `render-systems.ts`, `main.ts`.
- `sim-bootstrap.ts` source (you may *import* and *call* `bootstrapSim` + `leaderboard`, but do not change them).

## Determinism note

The harness itself must compare *sim outputs*, not wall-clock timings. Use `bootstrapSim` + `scheduler.tick` exactly as `run-sim` already does. If the determinism check *fails*, that's a real bug to surface — do not "fix" it by loosening the comparison; report it.

## Acceptance criteria

- `npm run typecheck` (all workspaces) passes
- `npm run test` passes, including the new determinism regression test
- `npm run sim` with no flags behaves exactly as today; with the determinism flag it runs twice and reports MATCH / DIVERGE with a non-zero exit on divergence; with the export flag it writes per-day CSV/JSON
- No new runtime deps; no `.js` import suffixes

## Workflow

You're the sonnet executor. Read this brief, then `tools/run-sim/src/index.ts` and `sim-bootstrap.ts` (`bootstrapSim` + `leaderboard` signatures). Implement. Run typecheck + tests + `npm run sim` (default and each new mode) before reporting done. If the determinism check uncovers an actual nondeterminism bug, STOP and report it rather than masking it. Report files changed, test counts, and anything surprising. Do not commit — orchestrator handles that.
