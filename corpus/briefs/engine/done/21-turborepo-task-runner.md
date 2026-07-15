# Engine Brief 21 — Adopt Turborepo as the task runner (typecheck/test parallelism + local cache)

status: todo
source: 2026-07-15 TS-monorepo research (follow-up to the structure survey). Measured baseline:
`npm run typecheck` is **44s serial** across the 14 workspaces, and `--workspaces` **stops at the
first failing workspace** — the exact mechanism behind the 2026-07-09 gate-rot incident, where
four red packages hid behind one. The full 2,275-test suite is likewise serial, while the
before-every-commit discipline re-runs all of it for changes that usually touch 1–3 packages.

## Context

Turborepo layers a task graph + content-hash cache **on top of npm workspaces** — it does not
touch install or module resolution, so the locked "npm workspaces, not pnpm" decision
([decisions.md](../../../wiki/decisions.md)) is unaffected. This repo is an unusually good fit:
the strict dependency layering (engine → sim-cores → clients/servers, enforced) gives Turbo an
*exact* invalidation graph.

One shape-fact drives the whole config: every internal package is a Turbo
**"Just-in-Time package"** (exports raw TS source, no build step). So there are no library
*builds* to cache — the value is parallel + cached `typecheck` and `test`, which Turbo's own
guidance endorses without adopting TS project references. The no-build-step philosophy stays.

**The one real trap — undeclared cross-package inputs.** Turbo hashes a package's own files plus
its *declared dependencies'* files. A task that reads a file outside that set gets stale cache
hits. Known offender: `@farm/sim-core`'s `farmer-frames.test.ts` reads
`games/farm/client/public/atlas/` — and `@farm/sim-core` does **not** depend on `@farm/client`.
Without an explicit `inputs` glob, an atlas change would replay a stale green.

## Scope

1. Add `turbo` as a root devDependency — **exact pin** (no `^`/`~`, locked convention) — and a
   root `turbo.json` with `typecheck`, `test`, and `build` tasks (`build` covers the three
   packages that have one: `@farm/client`, `@tool/atlas-builder`, `@engine/wasm-modules`).
   `typecheck`/`test` depend on `^topological` upstreams per Turbo convention.
2. Point the root scripts at turbo: `npm run typecheck` → `turbo run typecheck`, `npm run test`
   → `turbo run test`. Keep per-workspace scripts unchanged (single-workspace/single-file
   invocations like `npm run test -w @farm/sim-core -- <file>` must keep working exactly as
   documented in root CLAUDE.md).
3. **Sweep for undeclared cross-package inputs** before trusting the cache: grep the test suites
   for reads outside their own package (`readFile`/`readFileSync`/path literals crossing
   `games/`/`engine/`/`tools/` boundaries). Declare each as an `inputs` glob on that package's
   task (the farmer-frames → farm atlas read is the known one; find the rest, don't assume one).
   Committed WASM (`engine/wasm-modules/dist`) is already covered by the dependency graph.
4. Housekeeping: disable Turbo telemetry (repo practice — codegraph's is off too); gitignore
   `.turbo/`; leave `npm run dev`/`scripts/dev.mjs`, the headless sims, and
   `check-determinism` **outside** turbo (or `cache: false`) — persistent servers and
   determinism proofs must never be cache-served.
5. Update root CLAUDE.md's Commands section if invocation syntax changes anywhere (goal: it
   doesn't, except the root gates getting faster).

## Constraints

- No behavior change to any package; this is orchestration only. Pinned-versions and
  no-build-step conventions hold.
- Windows is the dev platform — verify everything on it, not just in theory.

## Acceptance

- `npm run typecheck` and `npm run test` run all 14 workspaces **in parallel**, report **every**
  failing workspace (not first-failure-stops), and pass green.
- Warm-cache full gate on an untouched tree completes in ~1–2s (`FULL TURBO`); editing one
  package re-runs only that package + its dependents.
- **Cache-correctness proof for the known trap:** modify a byte under
  `games/farm/client/public/atlas/`, confirm `@farm/sim-core`'s test task is a cache MISS.
- Single-workspace and single-file test invocations from root CLAUDE.md work unchanged.
- `CHECK_DETERMINISM` runs are demonstrably never cache-served.

---

**Outcome (2026-07-15, DONE — one documented deviation).** `turbo@2.10.5` exact-pinned
(`a71e6f6`); root `typecheck`/`test` → turbo with **`--continue`** (the load-bearing flag — turbo's
default cancels siblings on first failure, the exact hidden-red-package behavior this brief
replaces); everything else (dev/sim/server/determinism) stays outside turbo. **Numbers:** typecheck
44s serial → ~18-32s cold parallel → **88ms FULL TURBO warm**; test warm ~2-10s. Two-failure
break-proof passed; atlas-byte cache-MISS proof passed and re-proven.
**The input sweep found more than the brief knew:** beyond `farmer-frames.test.ts`→atlas, the
`@engine/core` palette guard **walks the entire repo** (declared repo-wide source-glob inputs),
`travel.test.ts` + `@farm/server`'s `sim-host.test.ts` read `wasm-modules/dist`, and **no workspace
declares a dependency on `@engine/wasm-modules` at all** (would be circular for engine/core) — all
handled via explicit `inputs`. **Deviation:** `test` runs `--concurrency=1` — cross-suite
parallelism oversubscribes nested vitest pools (~1-in-3 timeout flakes at concurrency=2) and
`@tool/atlas-builder`'s test *rewrites* the atlas `@farm/sim-core` reads (torn-read race);
rationale committed in turbo.json. `dependsOn: []` on purpose (JIT packages; topological would
serialize + re-hide reds). Known smell filed as a todo: the atlas-builder test rewrites
`index.json` with LF endings, wobbling Windows warm-cache stability
([todos/closed/2026-07-15-atlas-eol-gitattributes.md](../../../todos/closed/2026-07-15-atlas-eol-gitattributes.md)).
