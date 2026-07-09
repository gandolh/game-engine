---
title: "Repo gate infrastructure rot — typecheck red on main, a dead test, and a Windows-broken determinism script"
created: 2026-07-09
status: open
tags: [tooling, tests, typecheck, determinism, windows, ci]
---

# Repo gate infrastructure rot

Three independent defects in the repo's own quality gates, all **pre-existing on `main`** and
all surfaced while running the gates for [brief 97](../briefs/game/todo/97-review-fix-wave.md)
wave 1 (2026-07-09). None was caused by that work. Each one silently weakens a gate that
[CLAUDE.md](../../CLAUDE.md) and [routing.md](../routing.md) tell every agent to trust.

They are filed together because they share a root cause — **nobody runs these gates from a
clean checkout on this platform** — but they are independently fixable.

## 1. `npm run typecheck` is RED on clean `main`

`@tool/world-preview` typechecks the engine's WebGPU sources, but its tsconfig has neither the
WebGPU ambient types nor a module declaration for Vite's `*.wgsl?raw` imports. Result:

```
engine/core/src/render/webgpu/static-layer-pass.ts: error TS2304: Cannot find name 'GPUBufferUsage'.
engine/core/src/render/webgpu/tint-pass.ts:  error TS2307: Cannot find module './shaders/tint.wgsl?raw'.
… (≈20 errors across static-layer-pass / tint-pass / weather-pass)
```

**Verified** by checking out `main` into a worktree and running `tsc --noEmit` in
`tools/world-preview` — identical errors, with `static-layer-pass.ts` untouched by any branch.

This matters a lot: the locked convention is "`npm run typecheck` + `npm run test` before any
commit," and the typecheck half **cannot currently pass**. Five separate subagents independently
reported these errors as "pre-existing, not mine" — each was right, and none could prove it from
inside its lane. The gate has been trained to be ignored.

**Fix:** add `@webgpu/types` to `@tool/world-preview`'s `compilerOptions.types` (or exclude the
WebGPU renderer from its program — it only needs Canvas2D), and add an ambient
`declare module "*.wgsl?raw"`. Then confirm `npm run typecheck` exits 0 from a clean clone.

## 2. `farmer-frames.test.ts` has been dead since the repo reorg

[games/farm/sim-core/src/render-systems/farmer-frames.test.ts](../../games/farm/sim-core/src/render-systems/farmer-frames.test.ts)
reads its atlas manifest from `../../../farm-valley/public/atlas/characters.json` — a path from
the pre-reorg `packages/farm-valley` layout. The file now lives at
`games/farm/client/public/atlas/characters.json`.

The suite fails at **import** time (ENOENT), so it does not fail loudly as an assertion — it
just never runs. Every recent test report has quietly counted it as a known failure.

**Fix:** re-point the path. Then check whether the assertions still hold — they have not
executed since the move, so treat any failure as a genuine finding, not a broken test.

The same stale-path class was swept out of `corpus/wiki/` in `d071281`; this one is in **code**,
so that sweep never touched it. Worth grepping the rest of the repo for `farm-valley/` and
`packages/` path literals.

## 3. `check-determinism` cannot run on Windows

`tools/run-sim/package.json` defines:

```json
"check-determinism": "CHECK_DETERMINISM=1 tsx src/index.ts"
```

The POSIX env-var prefix is not parseable by `cmd.exe`, which is what npm spawns on Windows, so
`npm run check-determinism -w @tool/run-sim` always fails. Worse, the harness's **parallel
Worker** path then dies anyway: `determinism-worker.ts` imports `./run-core` extensionless, and
tsx's ESM loader does not apply inside `node:worker_threads`, giving
`ERR_MODULE_NOT_FOUND` even when the env var is set correctly.

So the determinism gate named in [CLAUDE.md](../../CLAUDE.md) is unrunnable as documented on
this machine. (Brief 97's wave-1 determinism was proven instead by running each seed twice with
`EXPORT=json` and comparing hashes — which is the stronger check anyway, since it diffs actual
outputs rather than only asserting reproducibility.)

**Fix:** use `cross-env` (or move the flag into the script's own `process.env` handling), and
give the worker an explicit extension or a tsx-aware loader. Consider making the seeded
double-run `EXPORT=json` diff the *documented* determinism gate, since it subsumes the current one.

## Acceptance

- `npm run typecheck` exits 0 from a clean clone on Windows and Linux.
- `farmer-frames.test.ts` loads and its assertions run (and pass, or its failure is triaged).
- `npm run check-determinism -w @tool/run-sim` runs on Windows and reports MATCH/MISMATCH.
- A note in [wiki/decisions.md](../wiki/decisions.md) or CLAUDE.md if the determinism gate's
  documented command changes.
