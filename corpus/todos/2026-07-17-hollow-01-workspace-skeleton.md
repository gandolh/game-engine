# hollow-01 — workspace skeleton

status: todo
milestone: M1
depends-on: none
created: 2026-07-17

## Goal
Stand up the Hollow workspaces so every later brief has a home, with the transport seam and
palette guard in place from day one. No gameplay yet — this is scaffolding that typechecks,
tests (trivially), and runs an empty deterministic tick loop headless.

## Scope
- New workspaces under `games/hollow/`:
  - `@hollow/sim-core` — deterministic sim (Node + browser safe). Exposes TS source via subpath
    `exports` (no build step), mirroring `@farm/sim-core`.
  - `@hollow/client` — Vite browser client (empty shell for now; sim will run in a Web Worker).
- New tool workspace `tools/hollow-sim` → `@tool/hollow-sim` (headless entry stub).
- Register all three in root `package.json` workspaces (already `games/*/*`, `tools/*`) and add
  root scripts: `npm run hollow` (client dev), `npm run sim:hollow` (headless).
- `bootstrapHollowSim(opts)` in `@hollow/sim-core/src/sim-bootstrap.ts` — transport-agnostic:
  builds an ECS `world`, a `FixedStepClock` (20 Hz), a seeded `Rng`, registers an empty system
  list, returns a handle with `tick()` and a snapshot getter. Nothing Worker/DOM-specific here.
- Worker entry stub in `@hollow/client/src/worker/sim-worker.ts` that drives `bootstrapHollowSim`
  and posts snapshots over `postMessage` (Citadel is the reference).
- Headless entry stub in `tools/hollow-sim` that drives the scheduler directly on the main
  thread and prints a tick count (Farm's `run-sim` is the reference).
- Palette module `games/hollow/client/src/render/hollow-palette.ts` — re-export Apollo-46 roles
  (`CITADEL_PAL`) **by copying the swatch table into a Hollow-owned module** (games can't import
  each other) plus **new natural skin/hair-tone role constants** for appearance genetics. Import
  as `HOLLOW_PAL as EDG` so role names stay shared, per the Citadel precedent.
- Extend the per-scope palette guard test so files under `games/hollow/` validate against the
  Hollow palette, everything else unchanged.

## Approach / notes
- Copy the `@farm/sim-core` and `@citadel/client` package.json + tsconfig shape; pin all
  versions (no `^`/`~`); extend `tsconfig.base.json`.
- Keep the dependency rule intact: `@hollow/*` may depend on `@engine/*` only, never on
  `@farm/*` or `@citadel/*`.
- Do NOT add the WebGPU renderer here (that's M2). The client shell can render a "sim running,
  tick N" text page for now.

## Acceptance / gates
- `npm run typecheck` green across all workspaces (including the three new ones).
- `npm run test` green (add one trivial `sim-bootstrap.test.ts` that ticks the empty sim 100
  times deterministically and asserts a stable tick count).
- `npm run sim:hollow` runs headless and exits cleanly.
- Palette guard test covers the new Hollow scope and passes.
- No cross-game import (add/extend the layering check if one exists; otherwise grep-assert in a
  test).
