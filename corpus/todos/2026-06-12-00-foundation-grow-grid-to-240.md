---
title: "FOUNDATION #0 — Grow the world grid to 240×240"
created: 2026-06-12
status: open
tags: [world, render, foundation]
blocks: [bigger-decorated-neutral-islands, per-farm-ranch-islands, casino-island-open-air, seasonal-trees-and-big-tree-island]
---

# FOUNDATION #0 — Grow the world grid to 240×240

**Prerequisite spike for all four land-adding/growing todos.** The current 160×160
radial archipelago is packed to a worst-case 2-tile ocean gap and farms are
jittered to within 2 of their budget — there is no room to add 21 ranch islands,
a big-tree island, or to enlarge 9 landmarks. Grow the canvas first.

## Decision (grilled 2026-06-12)

- **Uniform radial scaling**, NOT an outer margin. Scale the whole layout so local
  inter-body breathing room opens *everywhere* (the ranch islands need space next
  to their owning farms, which sit on the rings — not in a far outer void).
- **Target: 240×240.** `WORLD_WIDTH`/`WORLD_HEIGHT` 160→240, `MAP_CX`/`MAP_CY`
  80→120.
- **Push both farm rings out:** inner `r` 52→~78, outer `r` 72→~108. Keep ring
  counts (inner n=9, outer n=12 = 21 farms) and per-ring jitter as-is.
- Re-pack the central cluster + landmark consts proportionally around the new
  center (they are hand-authored `*_BOUNDS` — scale their offsets from center).

## Why it's cheap mechanically (verified)

The grid size is genuinely parametric: the render pipeline (ocean depth/shore
gradient, coral, static-layer depth mask in
[geometry.ts](../../packages/sim-core/src/render-systems/geometry.ts) /
[static-layer.ts](../../packages/farm-valley/src/main/static-layer.ts)) all derive
from `WORLD_WIDTH`/`WORLD_HEIGHT` + `isWalkable` — the ocean/shore gradient is
computed analytically, not baked. Only **one** stray literal exists (a comment on
default camera zoom in [config.ts](../../packages/farm-valley/src/main/config.ts)).

## Costs / blast radius

- **BFS render passes scale with area** (240² ≈ 2.25× the cells of 160²) — ocean
  depth + shore gradient + walkable-grid BFS. Watch perf on constrained hardware.
- **Default camera zoom** assumes "1 = whole 160×160 world in view" — fix the
  zoom default + verify the minimap bounds.
- **Bridges + farm spokes are auto-generated and `throw` if no clean route
  exists** ([regions.ts](../../packages/sim-core/src/world/regions.ts)
  `generateClusterBridges` / `generateFarmSpokes`). After scaling, the nearest-
  island spoke selection may pick *different* targets (gaps changed). The spike
  must re-run the guard tests AND eyeball the rendered bridge tree before any
  feature work layers on top.

## Acceptance

- World is 240×240, both rings pushed out (inner ~78, outer ~108), cluster +
  landmarks re-packed proportionally; nothing overlaps.
- `regions.test.ts` + `walkable-grid.test.ts` green (≥2-tile margins, clean
  bridges/spokes, no throw); determinism preserved.
- Camera default zoom + minimap fit the larger world; ocean/shore gradient still
  renders correctly at the new size; no perf cliff at 240².
