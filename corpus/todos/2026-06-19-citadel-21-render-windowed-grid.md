---
title: "Citadel 21 — Render-windowed sparse grid (large-map renderer)"
created: 2026-06-19
status: deferred
tags: [citadel, engine, render, perf, premature]
---

# Citadel 21 — Render-windowed sparse grid

**Lineage:** tiny-world-builder's "intent-full / render-windowed" model — the logical
`world[][]` may hold a full 512×512 board, but `cellMeshes` only holds the camera-centered
render window; off-window cells come from a virtual `getWorldCell()` default rather than
preallocation.

**Target:** engine + Citadel render.

## Idea

Allocate render objects only for the visible viewport on large maps; everything else is a
virtual default tile materialised on demand.

## ⚠️ PREMATURE — capture only, do not implement now

Citadel is **96×96** and the static backdrop bakes to a trivially small texture; the inventory
explicitly flagged this as **not needed at current size** — it's premature optimization. There
is **no consumer**: the plot is fixed and APR #12 defers any expansion. Implement only **if/when
a larger-than-96×96 world (or much smaller tiles) is committed**. We already do viewport
*culling*; this is the *sparse-allocation* step beyond it.

## Acceptance (only if unblocked by a committed large world)

- Render objects allocated for the camera window only; off-window cells virtualised; memory flat as the logical grid grows.
- Render-only; no determinism change.
