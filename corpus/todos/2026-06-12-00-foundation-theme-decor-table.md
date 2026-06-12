---
title: "FOUNDATION #0.5 — `theme` field on RegionDef + per-theme décor table"
created: 2026-06-12
status: open
tags: [world, render, foundation]
blocks: [bigger-decorated-neutral-islands, per-farm-ranch-islands, casino-island-open-air, seasonal-trees-and-big-tree-island]
depends_on: [foundation-grow-grid-to-240]
---

# FOUNDATION #0.5 — `theme` field + per-theme interior décor scatter

The shared substrate for every décor todo. This is the long-open world-gen
"Variety" item, scoped concretely. **Strictly render-only.**

## Decision (grilled 2026-06-12)

- Add a **typed `theme` enum** to `RegionDef`
  ([regions.ts](../../packages/sim-core/src/world/regions.ts)):
  `theme?: 'ranch' | 'casino' | 'shrine' | 'heritage' | 'forest' | 'big-tree' | …`.
- A **central per-theme décor table** maps theme → prop frames + density. New
  render-only **interior** décor scatter, mirroring the existing open-water
  [set-pieces.ts](../../packages/sim-core/src/render-systems/set-pieces.ts):
  rejection-sampled blue-noise, Chebyshev min-spacing, a forbidden-set for
  collisions — but **invert the eligibility test** (require walkable + inside the
  region, instead of open water).
- **Determinism idiom (copy exactly from set-pieces):** seed off `WORLD_GEN_SEED`,
  `rng.fork('decor:'+regionId)`, and **draw all rng fields every iteration**
  regardless of acceptance so the stream stays aligned. Never `Math.random` for
  positions.
- **Render-only, out of the sim.** `theme` is NEVER read by sim logic. Interactive
  features (casino-as-game, ranch animals later) get their OWN sim feature keyed
  off region id — not off `theme`. EDG32-only; the palette guard + a décor-table
  test enforce correctness.

## Acceptance

- `RegionDef.theme` typed enum exists; décor table + interior scatter implemented.
- Décor is deterministic across seeds (positions stable per `WORLD_GEN_SEED`),
  EDG32-only (palette guard green), and provably never touched by sim code.
- A region with a theme renders themed interior props; a themeless region renders
  bare as before.
