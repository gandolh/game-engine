---
title: Give each farm a neighbouring ranch-style island
created: 2026-06-12
status: open
tags: [world, render]
depends_on: [foundation-grow-grid-to-240, foundation-theme-decor-table]
---

# Give each farm a neighbouring ranch-style island

Each of the 21 farms gets its own **neighbouring island a short distance away**,
with a **ranch-style** look. **No animals yet** — this is the ranch *place*
(layout + décor), not livestock behaviour.

## Decisions (grilled 2026-06-12)

- **Procedural radial-outward placement.** Place each ranch at `r + Δ` on its
  farm's **own radial angle** (mirror `ringSlotBounds` in
  [regions.ts](../../packages/sim-core/src/world/regions.ts)), ~8×8, as a
  **dead-end leaf** bridged farm→ranch. Outward leaves can't hijack the
  inward-pointing farm→cluster spokes (which is the failure mode, since
  `generateFarmSpokes` picks nearest-clean and **throws** if none exists).
- **Rides on [grow-grid-to-240](2026-06-12-00-foundation-grow-grid-to-240.md):**
  the outer-ring ranches go furthest out — exactly where the grow created the most
  slack. **RISK TO VERIFY:** inner-ring ranches (5 named + 4 proc farms) land
  *between* the two rings (~30-tile inter-ring gap after grow) — confirm they don't
  collide with outer-ring farms.
- **`ranch` theme** (fences/pens/troughs/barn-style décor) via the
  [theme + décor table](2026-06-12-00-foundation-theme-decor-table.md). **No animal
  entities.** Render-only, deterministic off `WORLD_GEN_SEED`, EDG32-only.
- One placement function + one new guard test (21 ranches keep ≥2 margin + each
  bridges cleanly).

## Acceptance

- All 21 farms (named + procedural) have a distinct neighbouring island a short
  distance away, bridged to its farm.
- Those islands read as ranches (themed décor: fences/pens/barn-style), **no
  animals**.
- No-adjacency ≥2-tile gap + full bridge connectivity still hold
  (`walkable-grid.test.ts`, `regions.test.ts` green); determinism preserved.
