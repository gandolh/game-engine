# audit-07 — wasm typecheck covers 1 of 4 AssemblyScript kernels

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). One-line fix; grouped here because it is part of the same "gates that don't gate" cluster as audit-01/06/20.

## The gap

[engine/wasm-modules/package.json](../../../engine/wasm-modules/package.json) declares:

```
"typecheck": "asc --noEmit src/pathfinding.ts --config asconfig.json"
```

`src/` contains **four** kernels: `pathfinding.ts`, `floodfill.ts`, `noise.ts`, `rng.ts`. Three are
never passed to `asc`. The package also has **no `test` script**, so it is absent from `npm run test`
entirely (see [audit-20](2026-09-13-audit-20-tool-workspaces-test-scripts.md)).

## Failure scenario

A compile-breaking AssemblyScript error in `floodfill.ts`, `noise.ts` or `rng.ts` passes
`npm run typecheck` cleanly. `engine/wasm-modules/build/compile.mjs` (the `build` script) *does* loop
over every `src/*.ts` and would reject it — but `build` is not part of either gate CLAUDE.md tells you
to run before committing, and CLAUDE.md explicitly says `npm run build-wasm` is "NOT required after
clone". So the break sits in the tree until someone happens to rebuild wasm for an unrelated reason.

## Fix sketch

Point `typecheck` at all four sources (glob, or loop the way `build/compile.mjs` already does). Costs
nothing extra to run. Confirm `asconfig.json` doesn't assume a single entry point; if it does, loop
rather than glob.

## Files you OWN
- [engine/wasm-modules/package.json](../../../engine/wasm-modules/package.json)
- [engine/wasm-modules/build/compile.mjs](../../../engine/wasm-modules/build/compile.mjs) if a shared
  source list is the cleaner route

## Files you must NOT touch
- the AssemblyScript sources themselves
- the committed `dist/*.wasm` artifacts (that is [audit-29](2026-09-13-audit-29-wasm-artifact-drift-check.md))

## Acceptance
- `npm run typecheck -w @engine/wasm-modules` type-checks all four kernels. Prove it by introducing a
  deliberate error in `rng.ts` and showing it fails, then reverting.
- `npm run typecheck` at the root still passes on a clean tree.
