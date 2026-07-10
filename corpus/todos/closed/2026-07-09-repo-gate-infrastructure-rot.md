---
title: "Repo gate infrastructure rot — typecheck red on main, a dead test, and a Windows-broken determinism script"
created: 2026-07-09
status: closed
closed: 2026-07-09
tags: [tooling, tests, typecheck, determinism, windows, ci]
---

# Repo gate infrastructure rot

**CLOSED 2026-07-09** in `42bb4b1`. `npm run typecheck` and `npm run test` both exit 0.
The original filing (kept below, corrected) under-counted the damage: it named **one**
red workspace when there were **five**, and missed **two** further instances of the same
rot that only surfaced once the first three were fixed.

Three defects in the repo's own quality gates, all **pre-existing on `main`**, all surfaced
while running the gates for [brief 97](../../briefs/game/done/97-review-fix-wave.md) wave 1.
None was caused by that work. Each silently weakened a gate that
[CLAUDE.md](../../../CLAUDE.md) and [routing.md](../../routing.md) tell every agent to trust.

They shared a root cause — **nobody ran these gates from a clean checkout on this platform**.

## 1. `npm run typecheck` was RED on clean `main` — in five workspaces

The original filing blamed `@tool/world-preview`. That was just the one someone noticed:
`npm run typecheck` runs `--workspaces` and **stops at the first failure**, so it never
reached world-preview. The real list, each independently confirmed:

| Workspace | Errors | Cause |
|---|---|---|
| `@farm/server` | 51 | WebGPU |
| `@farm/sim-core` | 57 | WebGPU + missing node types |
| `@tool/run-sim` | 51 | WebGPU |
| `@tool/world-preview` | 51 | WebGPU |
| `@tool/citadel-sim` | 51 | WebGPU |

**Cause A (the 51).** [tsconfig.base.json](../../../tsconfig.base.json) sets `"types": []`, so every
package must opt in. These five are headless but import the `@engine/core` root barrel, which
transitively re-exports the WebGPU render passes — so they need the WebGPU ambient types and a
declaration for Vite's `*.wgsl?raw` imports, and had neither:

```
engine/core/src/render/webgpu/static-layer-pass.ts: error TS2304: Cannot find name 'GPUBufferUsage'.
engine/core/src/render/webgpu/tint-pass.ts:  error TS2307: Cannot find module './shaders/tint.wgsl?raw'.
```

**The fix already existed in-repo.** `@citadel/sim-core` and `@citadel/server` are the same shape
and were green, because each carries a `src/wgsl.d.ts` and `"types": ["node", "@webgpu/types"]`.
Copied to all five, with `@webgpu/types` pinned in devDependencies rather than resolved by
hoisting luck.

**Cause B (the extra 6).** `@farm/sim-core`'s tsconfig declared no `types` at all, so
`node:fs`/`node:path`/`node:url` in `farmer-frames.test.ts` and `travel.test.ts` did not resolve.
Added `"node"` and a pinned `@types/node`.

**No real type errors were hiding behind the WebGPU noise** — all five went to zero on the
config fix alone.

Why this mattered: the locked convention is "typecheck + test before any commit," and the
typecheck half *could not pass*. Five separate subagents independently reported these errors as
"pre-existing, not mine" — each was right, and none could prove it from inside its lane. The gate
had been trained to be ignored.

## 2. `farmer-frames.test.ts` had been dead since the repo reorg

[farmer-frames.test.ts](../../../games/farm/sim-core/src/render-systems/farmer-frames.test.ts) read
its atlas manifest from `../../../farm-valley/public/atlas/characters.json`, a path from the
pre-reorg `packages/farm-valley` layout, resolving to `games/farm/farm-valley/…`. The real file is
at `games/farm/client/public/atlas/characters.json`.

The suite failed at **import**, so vitest reported `Tests: no tests` rather than a failure — it
never contributed a pass or a fail to any report.

Re-pointed. **Both revived assertions pass**, so the atlas is genuinely consistent; there was no
hidden finding underneath.

## 3. `check-determinism` could not run on Windows — for two reasons, not one

The filing named the npm script's POSIX env prefix (`CHECK_DETERMINISM=1 tsx …`), unparseable by
the `cmd.exe` that npm spawns on Windows. **No `cross-env` dep was needed**: [env.ts](../../../tools/run-sim/src/env.ts)
already accepted a `--check-determinism` CLI flag, so the script just passes that.

But fixing the env var was not enough. With it set correctly the harness still died:

```
ERR_MODULE_NOT_FOUND: Cannot find module '…/tools/run-sim/src/run-core'
  imported from …/tools/run-sim/src/determinism-worker.ts
```

**tsx's ESM hooks do not install in a worker thread via `execArgv`.** Measured: `--import tsx`,
`--import tsx/esm`, and `--loader tsx/esm` all fail (the last one errors outright). The worker
could transform its own TS but could not *resolve* an extensionless import. The worker now boots
from an eval'd stub that calls tsx's `register()` **inside the thread** before importing the real
entry — see [determinism.ts](../../../tools/run-sim/src/determinism.ts).

Verified: 3 seeds × 6 workers, all MATCH.

## 4. (new) `interior-decor.test.ts` could never pass at the default timeout

Called `expect()` inside an O(n²) pair loop. The matcher overhead alone — not the check —
pushed it past the 5s default. Collects violations and asserts once now: identical invariant,
**8.4s → 2.4s**. It had been quietly counted as a known-red test.

## 5. (new) `coral-fishing.integration.test.ts` failed only under full-repo load

A 24k-tick live sim in `beforeAll` that needs ~40s idle, declaring a 60s hook timeout — not enough
headroom when sharing the box with three sibling vitest workers during `npm run test`. Passed
standalone, failed in the full run, which is the worst possible signal. Raised to 180s. Its 30-day
window is load-bearing per its own comment, so shortening the run would have weakened the assertion.

This is the class of bug the other four were hiding: **a gate that is already red teaches you to
ignore a new red.**

## Acceptance — all met

- ✅ `npm run typecheck` exits 0 (verified on Windows; the fix is platform-independent).
- ✅ `farmer-frames.test.ts` loads and its assertions run and pass.
- ✅ `npm run check-determinism -w @tool/run-sim` runs on Windows and reports MATCH.
- ✅ `npm run test` exits 0 across all workspaces.
- n/a — the documented determinism command did not change, so no `decisions.md` note was needed.

## Residual

The seeded double-run `EXPORT=json` hash diff (used for brief 97's determinism proof) still
subsumes `check-determinism`: it diffs actual outputs rather than only asserting reproducibility.
Worth considering as the *documented* gate. Not done here.
