---
title: Make neutral/landmark islands bigger and decorate them
created: 2026-06-12
status: open
tags: [world, render]
depends_on: [foundation-grow-grid-to-240, foundation-theme-decor-table]
---

# Make neutral/landmark islands bigger and decorate them

Neutral (non-farm) islands should be **bigger** and carry **themed decorations**
so they read as distinct, lived-in places rather than bare bounded rects.

"Neutral islands" = the landmark / scenic / heritage bodies, not the farms:
`shrine`, `waterfall`, `heritage-stones`, `heritage-ruin`, `heritage-statue`,
`camp`, `weather-station`, `volcano`, `casino` (and arguably the fishing isles /
harbor / mill / mushroom-grove / ice-pond) in
[regions.ts](../../packages/sim-core/src/world/regions.ts).

## Decisions (grilled 2026-06-12)

- **Rides on the two foundations.** Do the
  [grow-grid-to-240](2026-06-12-00-foundation-grow-grid-to-240.md) spike first
  (opens inter-ring gaps to grow into), then use the
  [theme + décor table](2026-06-12-00-foundation-theme-decor-table.md) for the
  decoration. This todo is the décor consumer + per-island enlarge.
- **Enlarge** the landmark `*_BOUNDS` from today's 7×7/8×8 — but resize + re-verify
  bridges/gaps **together**: growing a body can break an auto-generated bridge
  (which throws) or violate the ≥2-tile landmark margin.
- Each neutral island gets a `theme` → themed interior décor scatter. Render-only,
  deterministic off `WORLD_GEN_SEED`, EDG32-only.

## Acceptance

- Neutral/landmark islands are visibly larger than today's 7×7/8×8.
- Each carries themed decorations (not bare ground), via the theme/décor table.
- No-adjacency ≥2-tile gap + full bridge connectivity still hold
  (`walkable-grid.test.ts`, `regions.test.ts` green); determinism preserved.
