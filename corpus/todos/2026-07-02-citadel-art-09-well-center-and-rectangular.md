---
title: "Citadel art-09 — well: center on tile + rectangular kerb"
created: 2026-07-02
status: todo
tags: [citadel, client, render, art, isometric, well]
scope: BRIEF-ONLY (spec + acceptance)
---

# art-09 — Well: fix offset + make it rectangular

## Why (code-grounded)

Two defects in [`wellForm`](../../games/citadel/client/src/render/sprites/recipes/iso-draw.ts)
(~L624), both visible in `showcase-noon.png` (the tiny well, bottom-centre):

1. **Offset from its tile.** The well sprite doesn't sit centred on its 1×1 ground
   diamond — it reads shifted off the footprint (an anchor/registration bug: the kerb +
   roof geometry are laid relative to `ringTopY`/`groundY` but the composite's opaque mass
   isn't centred over the diamond the renderer places it on). A 1×1 building's sprite must
   be centred so it lands on its tile like every other footprint.
2. **Round kerb.** The kerb is a vertical cylinder (round well-head). The ask is a
   **rectangular (square) stone kerb** — a small iso box well-head — which also reads more
   clearly at 1-tile size and matches the blocky masonry vocabulary.

## Goal / acceptance

- **Centred.** The well's opaque silhouette is centred over its 1×1 footprint diamond
  (same anchoring as other buildings — verify against `isoFootprintBox`/the sprite's
  transparent-corner invariant). Add a cheap test: the well recipe's opaque-pixel centroid
  is within a couple px of the sprite centre-x (no lateral offset).
- **Rectangular kerb.** Replace the round cylinder kerb with a small **square iso box**:
  a stone footprint diamond extruded a short wall band, two lit/shaded faces + a hard near
  corner (the mini-fort/mini-cube vocabulary), a dark water mouth in the top, ashlar
  coursing. Keep the two posts + little pitched roof + windlass + bucket on top, re-anchored
  to the box.
- Committed UL sun (lit-left/shaded-right); EDG32; deterministic.
- Palette guard green · typecheck green · recipes.test green · **browser-verified** (well
  sits centred on its tile and reads as a small square well-head).

## Notes

- The offset is likely the highest-value fix — a mis-anchored 1×1 is a general anchoring
  smell; check whether other 1×1/odd sprites share it while here.
- Keep `wellForm` a distinct silhouette (silhouette.test stays green).

Graded against the [asset critique rubric](../wiki/citadel-asset-critique.md) C (isometry/anchoring).
