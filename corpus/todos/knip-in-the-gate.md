# knip in the gate

Captured 2026-11-11, from brief 03's owner question 3 (answered by the
controller: later, as its own brief).

Brief 03 left knip out of `check:conventions`. Run by hand it reports 38 unused
files (mostly hand-run probes and tools), 12 unused dependencies, 2 unlisted
dependencies, 2 unlisted binaries and 145 unused exports. Before knip can gate
anything, a brief decides its entries: which probes and tools are entry points,
which files go, and which dependencies are really unused. Then knip joins
`check:conventions`, with unused exports as warnings as the house config sets
them.
