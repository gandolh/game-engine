# Brief 56 — Extract `sim-core` package

**Status:** todo. **Type:** refactor (behavior-preserving). **Parent:** [55-client-server-split](55-client-server-split.md).

## Goal

Move all deterministic sim code out of `packages/farm-valley/src` into a new **Node-safe, browser-safe** workspace package so both the future Node server (brief 57) and the renderer (type-only) can depend on it. This is a pure relocation — **zero behavior change, identical determinism numbers.**

## Package

- New workspace: `packages/sim-core`, name `@farm/sim-core` (mirror the `@engine/*` convention; confirm with the user if a different scope is preferred). Subpath exports like `@engine/core` does (TS source directly, no build step), e.g. `@farm/sim-core`, `@farm/sim-core/snapshot`.
- Depends on `@engine/core` (+ `@engine/wasm-modules` types as needed). Must NOT depend on `farm-valley`. Must NOT import any browser API (`document`/`window`/`self`/`fetch`/`import.meta.env`).
- Same TS strictness as the rest of the repo (`tsconfig.base.json`: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). EDG32 palette guard still applies to any moved files that name colors.

## What moves (sim authority — verified browser-API-free)

From `packages/farm-valley/src/` → `packages/sim-core/src/`:

- `sim-bootstrap.ts` (+ its test)
- `systems/**` (109 files), `agents/**` (38), `world/**` (12), `economy/**` (6), `protocols/**` (14), `components/**` (12)
- `world-setup.ts`, `run-descriptor.ts` (+ test), `run-recap/**`
- The **snapshot types + builder**: `worker/snapshot/**` and `worker/snapshot-builder/**` (these are pure data shaping over the world — no browser API). The renderer and server both need these types; the server needs the builder.
- `sim-worker-skip.ts` (pure skip logic) — moves too; `sim-worker.ts` re-exports it today, that re-export can go.

## What STAYS in farm-valley (the renderer)

- `worker/sim-worker.ts` — **delete in brief 58**, not here (keep it compiling against the new import paths for now so the app still runs through this brief).
- `worker/sim-client/**` — the renderer facade (rewired in 58).
- `render/**` (engine-side render is already in `@engine/core`), `render-systems*`, `main/**`, `screens/**`, `ui/**`, `main.ts`, `atlas`, all DOM/Canvas code.

## The message protocol — split it

`worker/snapshot/messages.ts` defines `WorkerInbound`/`WorkerOutbound`. These types are shared by **both** sides, so they move to `@farm/sim-core/protocol` (rename the concept from "Worker*" to transport-neutral names is optional — if renaming, do it as a mechanical find/replace and note it; if it risks churn, keep the `Worker*` names and just relocate). The server (57) and client (58) both import from here.

## Procedure (mechanical, high-volume — this is the determinism-risk brief)

1. Create the package skeleton (`package.json` pinned versions, `tsconfig.json` extending base, barrel `index.ts`, subpath `exports`).
2. `git mv` the directories above (preserve history). Do it in **file-overlap-grouped waves** (see the worktree-swarm memory) if parallelizing, but a single sequential move is safer for determinism.
3. Fix imports:
   - Inside moved files: relative imports mostly survive (same relative layout). Cross-references that pointed at *render* code must be severed — if any sim file imports a render/DOM module, that's a layering bug to surface, not paper over.
   - In `farm-valley` (renderer): repoint `from "../sim-bootstrap"`, `from "./systems/..."`, `from "./worker/snapshot"` etc. to `@farm/sim-core` subpaths.
   - In `tools/run-sim` and `tools/world-preview`: repoint to `@farm/sim-core`.
4. Move the tests with their sources. Sim/agent/system tests now live in `sim-core` and still drive `bootstrapSim()` directly (the canonical pattern) — they just import it locally now.
5. `npm install` to relink workspaces; update root `package.json` workspace globs if needed (already `packages/*`, so the new package is picked up automatically).

## Acceptance

- `npm run typecheck` clean across all workspaces; `npm run test` green (counts may redistribute between `sim-core` and `farm-valley` — total should be unchanged: ~718).
- **`@farm/sim-core` imports no browser API** — grep `document|window|self\.|import\.meta|fetch\(` over `packages/sim-core/src` returns only comments. Add a guard test if cheap.
- **Determinism: fast JSON diff clean** (user directive — fast version only, no full 100-day runs or `CHECK_DETERMINISM=1`). Re-run `SEED={0xc0ffee,1,42} TICKS_PER_DAY=20 MAX_DAYS=3 EXPORT=json` and diff byte-identical against a baseline captured from `main` BEFORE this brief (`/tmp/split-baseline/fast-seed-*.json` + `check-fast.sh`). Any diff = regression; this brief must not move a single number. Accepted blind spot: 3 days doesn't reach festivals/shock/recap.
- `npm run dev` still launches the app through the (still-present) Web Worker, now importing from `@farm/sim-core`. `npm run sim` (headless) still runs.
- Corpus: update `architecture.md` workspace + layers diagram to show `sim-core`; `log.md` entry.

## Risks / watch-fors

- **`exactOptionalPropertyTypes` / `noUncheckedIndexedAccess`** sometimes surface new errors when files cross a package boundary with slightly different resolution — fix by tightening types, never by loosening tsconfig.
- **Circular imports** between the moved snapshot-builder and systems — the builder only *reads* the world, so it should sit at the top of the dependency order; if a cycle appears, the builder is importing something it shouldn't.
- **WASM artifact path**: `sim-core` references no asset paths directly (the pathfinder is injected via `bootstrapSim({ pathfinder })`), so nothing to repath here. The *server* (57) decides where it reads `pathfinding.wasm` from.
