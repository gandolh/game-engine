---
title: "Citadel 21 — Render-windowed sparse grid (large-map renderer)"
created: 2026-06-19
status: open
tags: [citadel, engine, render, perf, multiplayer]
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

## ✅ UN-PARKED (2026-06-19) — spine item K

Was parked as premature at 96×96 with no consumer. The **256×256 MP world**
([citadel-29](2026-06-19-citadel-29-world-256-townhall.md)) is now the committed large-map
consumer, so this is **un-parked**. Spine position **K (depends on
[29](2026-06-19-citadel-29-world-256-townhall.md))**. We already do viewport *culling*; this
is the *sparse-allocation* step beyond it.

## Acceptance

- Render objects allocated for the camera window only; off-window cells virtualised; memory flat as the logical grid grows.
- Render-only; no determinism change.
