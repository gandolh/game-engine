---
title: "Citadel 14 — Edge-coherent river/path continuity (off-map cue)"
created: 2026-06-19
status: open
tags: [citadel, sim, worldgen]
---

# Citadel 14 — Edge-coherent terrain continuity

**Lineage:** tiny-world-builder's `ghostHash` + `pathZForRow(boardZ)` / `riverXForCol(boardX)`
— **pure single-coordinate functions** so rivers/paths from adjacent boards always align at
shared edges with no cross-board communication (a river in column 14 of one board emerges at
column 14 of its neighbour because both call the same pure function).

**Target:** [terrain.ts](../../packages/citadel-sim-core/src/world/terrain.ts) — **sim-side,
seed-deterministic.** Touches the determinism baseline.

## Idea

Make water/river entry at the plot boundary a pure function of `(seed, x)` / `(seed, y)` so
rivers and shorelines read as **continuing off the edge of the map** rather than stopping at
a hard border. Optionally wire raider/trader spawn geography to the coherent edge gaps (they
arrive through the river mouth / forest gap), giving the threat layer a spatial logic.

## Important scope caveat

Citadel has a **fixed bounded 96×96 plot** (APR #12 — no expansion in v1). This is **not**
infinite/streamed terrain — it's purely a visual + spawn-geography coherence cue at the
existing edges. Do **not** confuse with the render-windowed / ghost-world streaming ideas
([citadel-21](2026-06-19-citadel-21-render-windowed-grid.md) / [citadel-22](2026-06-19-citadel-22-incremental-build-queue.md)),
which are parked (no consumer at 96×96).

## Acceptance

- Rivers/water read as continuing past the plot edge; deterministic per `seed`.
- **Determinism gate:** sim-side terrain change → multi-seed `EXPORT=json` re-proof. **Ask before running** (resource limits).
- Typecheck + `@citadel/sim-core` tests green.
