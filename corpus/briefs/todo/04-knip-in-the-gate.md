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
