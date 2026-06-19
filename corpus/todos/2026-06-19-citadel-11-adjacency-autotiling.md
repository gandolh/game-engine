---
title: "Citadel 11 — Generalized adjacency autotiling (roads + walls)"
created: 2026-06-19
status: open
tags: [citadel, render, legibility]
---

# Citadel 11 — Adjacency autotiling for roads & walls

**Lineage:** tiny-world-builder's adjacency-aware rendering — roads/fences/walls sample
their 4–8 neighbours and pick a `T/L/straight/cross/dead-end` variant from a lookup, so
networks read as connected runs instead of loose squares.

**Target:** Citadel render only — building draw on the WebGPU renderer ([citadel-27](2026-06-19-citadel-27-webgpu-renderer-port.md)).
**Render-only, zero determinism impact.** Depends on the WebGPU port.

## Idea

Roads (the connectivity spine + walker paths) and walls (the siege perimeter) currently
render as uniform 1×1 tiles, so the player can't visually read a connected road network or
a continuous wall run. Compute a 4-neighbour bitmask (N|E|S|W) over road/wall tiles → 16
variant indices (straight/corner/T/cross/dead-end), drawn via the WebGPU `sprite-batch` as
selected quads/sub-tiles. Farm Valley already ships `computeShores`/`computeWalls` autotile
logic in `@farm/sim-core` to crib the bitmask→variant lookup — **verify the exact symbols
before reusing** (wiki may have drifted).

## Decisions to settle in-brief

- Procedural sub-tile quads now (placeholder, no art) vs authored autotile sprites later (atlas, see [citadel-20](2026-06-19-citadel-20-sprite-batch-renderer.md)) — quads are the pragmatic v1; the bitmask→variant logic is identical either way.
- Do gates count as wall neighbours (continuous run *through* the gate) or break the run?
- Recompute the bitmask every frame (<1000 tiles, cheap) vs cache + invalidate on placement command.

## Acceptance

- Connected roads render as a joined network (T/L/cross); continuous walls render as runs.
- Any new colour comes from `EDG.*` (see [citadel-07](2026-06-19-citadel-07-tier-lock-enforcement.md) palette-guard extension).
- No sim/baseline change; `npm run typecheck` + citadel render tests green.
