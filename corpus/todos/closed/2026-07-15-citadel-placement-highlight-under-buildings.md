---
title: "Citadel — placement coverage highlight should draw under buildings, not over them"
created: 2026-07-15
status: closed (2026-07-16, `b389832` — LAYER_COVERAGE 38 → 6, below LAYER_ENTITY 10)
tags: [citadel, ui, render, placement]
---

# Citadel: draw the placement-area highlight under buildings

When placing a well (or any similar mechanic item with an area of effect), the
highlighted coverage area is currently drawn **over** the buildings, which
makes it hard to tell whether the area will cover a specific building. Draw the
highlight **under** the buildings instead, so buildings inside the area remain
clearly visible on top of it.

## Context

- This is a render-layer/ordering fix in the Citadel client's placement
  preview: the coverage overlay should sit above the terrain but below building
  sprites.
- Applies to the well and any other placeable with a similar area-coverage
  preview — fix it at the shared placement-preview level, not per-building.
- Colors from `CITADEL_PAL.*` as always.

## Acceptance

While placing a well (or similar), buildings inside the highlighted area are
drawn on top of the highlight, so it is immediately readable which buildings
the area covers.

## Resolution (2026-07-16)

One-line root cause: the coverage/catchment wash sat at layer 38, just under the ghost (40) and
above everything else — including buildings (LAYER_ENTITY 10). Moved to 6 (above roads at 5, below
entities), fixed once at the shared `pushCatchment` call site so every area-coverage placeable
inherits it. The ghost silhouette and the no-road HUD pip stay at 40/39. LAYER_ENTITY / LAYER_GHOST /
LAYER_COVERAGE / LAYER_DISCONNECT are now exported and the ordering is pinned by tests.
Browser-verified: in Place-well mode the windmill/houses/barn render fully on top of the wash.
