# Task 04: knip in the gate

**Origin:** promoted on 2026-11-13 from the todo `knip-in-the-gate` (captured 2026-11-11 from brief 03's owner question 3), which this commit removes.

**Depends on:** brief 03 (done): the vendored house-style 1.2.0 copy, with its `knip.json` preset.

## Context

Brief 03 left knip out of `check:conventions`. Run by hand it reported unused files (mostly hand-run probes and tools), unused dependencies, unlisted dependencies and binaries, and unused exports. Before knip can gate anything, the entries have to be decided: which probes and tools are entry points, which files go, and which dependencies are really unused. The other estate repos wire it with a `knip.config.js` that spreads the house preset (knip has no `extends`) and adds the entries knip can't find.

## Files you OWN

- `knip.config.js` (new), root `package.json` (`check:conventions`)
- Files knip proves dead and nothing refers to (each listed in the outcome note)
- `package.json` files of workspaces with a truly unused dependency
- `corpus/` pages for this brief (outcome, `log.md`, `wiki/status.md` if it lists the gate)

## Files you must NOT touch

- `vendor/` (generated), sim code, game behaviour, determinism-relevant files.

## What to do

1. Add `knip.config.js` spreading `vendor/house-style/knip.json`, with workspace entries for probes, tools, scripts, smoke scripts, demos, AssemblyScript sources and every game's entry.
2. Delete only what is clearly dead and unreferenced. Anything doubtful goes into the ignore list with a one-line reason.
3. Fix real dependency findings (unused, unlisted) or ignore them with a reason.
4. Put `knip` first in `check:conventions`. Unused files and dependencies are errors; unused exports stay warnings, as the house config sets them.

## Acceptance

- `npx knip` exits 0.
- `npm run check` exits 0 with knip in it; `bash corpus/lint.sh` passes.
- The outcome note lists every deletion and every ignore.

## Outcome (2026-11-13)

`knip.config.js` spreads the house preset and `knip` runs first in `check:conventions`; `npx knip` and `npm run check` exit 0. Unused exports (53) stay warnings.

**Entries added:** `inspirations/fetch.mjs`, `scripts/*.mjs`, house-style bins; engine/core `node-import-check.ts`; engine/ui `tools/*.ts`; wasm-modules `build/*.mjs` and `src/*.ts` (AssemblyScript sources); library-consumer `smoke*.mjs`; Hollow client `render3d-demo.ts`; citadel-sim `*.mts`; hollow-sim `rationalizer/index.ts`; image-patches `harness/main.ts`; every run-sim probe; docs pages and components.

**Deleted (2):** `tools/world-preview/shrink.mjs` and `tools/world-preview/src/measure-land.ts`: one-off scratch scripts, no script, import or doc refers to them.

**Ignored (with the reason in `knip.config.js`):**
- `corpus/verify/**` (evidence pages, not code);
- binaries `codegraph`, `agent-browser` (global CLIs);
- dependencies: the two Docusaurus search/docs plugins and `prism-react-renderer` (loaded from the Docusaurus config); `tsx` (spawned by `node-import.test.ts`); `jsdom` and `@types/jsdom` (listed in three sim-cores that never import them: removing them touches the lockfile, a later cleanup); `@farm/client` (world-preview build order); `ws` (Farm server's, used by `probe-perf` by hand).
