---
title: Make neutral/landmark islands bigger and decorate them
created: 2026-06-12
status: done
tags: [world, render]
depends_on: [foundation-grow-grid-to-240, foundation-theme-decor-table]
---

# Make neutral/landmark islands bigger and decorate them

> **DONE 2026-06-12.** Enlarged (grown about center, authored bounds): heritage×3,
> mushroom-grove, ice-pond, volcano, casino 8×8→**12×12**; camp 8×8→10×10,
> weather-station 7×7→9×9 (the camp↔weather-station bridged pair grown less + away
> from each other). **shrine/waterfall left at 7×7/8×8** (their mutual gap was only 3
> — growing both collides); functional fishing/harbor/mill left (lower risk, todo
> said "arguably"). Themed via #0.5's table: added `RegionTheme` values
> `'camp'|'pond'|'volcano'` + table entries; assigned mushroom-grove/waterfall→forest,
> ice-pond→pond, camp→camp, weather-station→quarry, volcano→volcano. Bridge gen
> clean (no throw), no-adjacency ≥2 holds, full repo **1063 tests** + typecheck green.
> set-pieces snapshot regenerated (bigger islands shifted open-water scatter). Render
> eyeball pending. See [log.md](../log.md) 2026-06-12.

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
