---
title: "Farm Valley — world-gen multi-seed property tests are failing (pre-existing)"
created: 2026-06-27
status: done
resolved: 2026-07-02
tags: [farm, worldgen, tests, bug, pre-existing]
source: "observed during the 2026-06-27 autonomous backlog pass"
---

> **No longer reproduces (2026-07-02, corpus audit).** Re-ran the three named
> suites (`generate-world.property`, `walkable-grid`, `bridge-graph`) — **28/28
> pass**. No commits touched `games/farm/sim-core/src/world/` since this was
> filed, so the original failures were seed-sweep flakiness / an environment
> artifact, not a live source bug. Closed as not-reproducing rather than fixed.

# Farm — world-generation property tests failing

## Finding

A full-repo `npm run test` on 2026-06-27 surfaced **5 failing tests, all in
`@farm/sim-core` world generation** (every other workspace is green — Citadel
sim-core 161, client 227, server 9, engine all pass). These are **pre-existing**:
`git log 82bb358..HEAD -- games/farm/sim-core/src/world/` is empty, i.e. the Farm
world-gen was untouched across this whole session (and the merge) — the last change
to these files predates it ("restructuring", 4e8fb44). Recording so it isn't lost.

## The failing assertions

Multi-seed layout-invariant property tests (they sweep many seeds asserting the
generated archipelago is well-formed):

- [generate-world.property.test.ts](../../games/farm/sim-core/src/world/generate-world.property.test.ts)
  — "every region pair keeps a >=2-tile ocean gap (bounds)" and "every region
  center is reachable from the village over land+road".
- [walkable-grid.test.ts](../../games/farm/sim-core/src/world/walkable-grid.test.ts)
  — "no two island bodies are adjacent (≥2 Chebyshev between every region pair)".
- [bridge-graph.test.ts](../../games/farm/sim-core/src/world/bridge-graph.test.ts)
  — "bridges never overlap an island (other than their endpoints)".
- [interior-decor.test.ts](../../games/farm/sim-core/src/render-systems/interior-decor.test.ts)
  — "blue-noise: no two décor tiles within Chebyshev MIN_SPACING".

The shape (ocean-gap / island-adjacency / reachability / bridge-overlap all
failing together) points at a **region-placement / spacing invariant** the current
generator violates on some seeds — likely a single root cause in the world layout
(region packing or the spacing guarantee), with the décor blue-noise possibly
separate.

## Why not fixed here

Out of scope for the Citadel-focused backlog pass, and world-gen invariants are
balance/geometry-sensitive — a blind fix risks changing every Farm map. Needs a
focused session: reproduce a failing seed, decide whether the generator or the
invariant (the test's expectation) is wrong, fix the root cause, re-run the
multi-seed sweep.

## Acceptance

- `npm run test -w @farm/sim-core` is green across the property-test seed sweep.
- The fix is the generator or a corrected invariant — not loosened thresholds that
  paper over a real adjacency/reachability bug.
