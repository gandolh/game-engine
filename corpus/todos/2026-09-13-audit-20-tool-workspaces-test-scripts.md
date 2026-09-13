# audit-20 — Four workspaces have no `test` script, so ~4,700 lines are invisible to the gate

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Prerequisite for [audit-05](2026-09-13-audit-05-determinism-fingerprint-nonfinite.md), which needs somewhere to put its tests.

## The gap

`npm run test` is `turbo run test --continue --concurrency=1`. Turbo only runs the task in workspaces that
declare it. These four declare no `test` script at all, so they are absent from the task graph — with no
failure, no warning, and no "skipped" line:

| workspace | src lines | test files |
|---|---|---|
| `@tool/run-sim` | 2,496 | **0** |
| `@tool/citadel-sim` | 1,592 | **0** |
| `@tool/world-preview` | 279 | **0** |
| `@engine/wasm-modules` | 349 | **0** |

Measured 2026-09-13.

`@tool/run-sim` is not incidental code: it is the headless deterministic Farm sim, the probe scripts, and
**the determinism checker itself** — the machinery every behaviour claim in this project is verified with.

## Failure scenario

A reviewer trusting a green `npm run test` has verified **0 of these ~4,700 lines**. A regression in the
determinism checker (see audit-05, where `fingerprint` is provably blind to ±Infinity/NaN/−0) has no
automated signal anywhere. The same applies to every probe the corpus cites as evidence.

`@engine/wasm-modules` is partly mitigated — `engine/core/src/wasm/pathfinder.test.ts` exercises the
compiled pathfinder from the consumer side — but see
[audit-07](2026-09-13-audit-07-wasm-typecheck-all-kernels.md): its `typecheck` covers only 1 of 4 kernels,
so between the two gaps three kernels have neither typecheck nor test.

## Fix sketch

1. Add `"test": "vitest run"` to `@tool/run-sim` and `@tool/citadel-sim` with a `vitest.config.ts`
   (`node` env). Even initially-thin suites mean future tests are actually collected.
2. Seed each with tests that need **no sim run**: `fingerprint`/`describeDivergence` (audit-05), env-var
   parsing (`SEED`, `TICKS_PER_DAY`, `MAX_DAYS`, `EXPORT`, `PATHFINDER`), and CSV/JSON export shape.
3. `@tool/world-preview` and `@engine/wasm-modules` may legitimately stay test-less — but make that a
   **documented exception** in CLAUDE.md rather than a silent gap.
4. Respect the hardware limits: no test in these packages may start a long sim. Keep them unit-scoped.

## Files you OWN
- `tools/run-sim/package.json`, `tools/citadel-sim/package.json` (+ new `vitest.config.ts` each)
- new test files in those packages
- a line in [CLAUDE.md](../../CLAUDE.md) recording the deliberate exceptions
- `turbo.json` **only** if a new `inputs` override is genuinely needed — coordinate with
  [audit-01](2026-09-13-audit-01-turbo-cache-false-green.md), which owns that file

## Files you must NOT touch
- the tools' actual behaviour — this spec adds gates, it does not change what the tools do
- `games/farm/sim-core/vitest.config.ts` — its `isolate: false` is a measured, deliberate setting
  (though note its rationale comment is missing from the file despite `performance.md` claiming otherwise —
  a separate, minor corpus-drift item)

## Acceptance
- `npm run test` runs tasks for `@tool/run-sim` and `@tool/citadel-sim` and they appear in the summary.
- The seeded tests are meaningful (they would catch a real regression), run in milliseconds, and start no sim.
- The two deliberate exceptions are documented.
- Full `npm run test` still green and no slower in wall-clock terms than before, within noise.
