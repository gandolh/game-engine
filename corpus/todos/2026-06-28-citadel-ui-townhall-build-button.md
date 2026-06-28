---
title: "Citadel UI — Town Hall build button + iso asset"
created: 2026-06-28
status: todo
tags: [citadel, ui, art, building, cozy-pivot]
---

# Town Hall — build button + iso sprite

Make the **town hall** placeable from the build bar with its own iso art. This is a
prerequisite for the cozy pivot's **autonomy pass** (Phase G of
[the cozy-pivot build order](2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)) — under the
pivot the town hall is the civic building that autonomously runs rations/work-hours, so
the player must be able to *place* it.

## Current state
- `town-hall` **already exists as a building type** in
  [building.ts](../../games/citadel/sim-core/src/entities/building.ts) (3×3,
  `SERVICE_RADII["town-hall"] = 10`, currently flagged `isKeep` as the MP anchor) — but
  it is **not on the toolbar** (no `#build-bar` button) and likely has **no dedicated
  iso recipe** (falls back to the generic `fort`/box form).
- The build bar is wired in
  [main.ts:145](../../games/citadel/client/src/main.ts#L145)
  (`#build-bar button` querySelectorAll); buttons live in
  [index.html](../../games/citadel/client/index.html).

## Scope
1. **Toolbar button** — add a `town-hall` button to `#build-bar` in `index.html`
   (icon-only + `title` tooltip, matching the condensed build-bar convention), wired to
   set placement mode to `place` with `selectedType = "town-hall"` and the 3×3 footprint.
2. **Iso sprite** — author a distinct `bld/town-hall` recipe in
   [sprites/recipes/buildings.ts](../../games/citadel/client/src/render/sprites/recipes/buildings.ts)
   (a civic hall form — bigger, banners/clock/portico — not the generic fort). EDG32-only
   via `SWATCH`. Add to `BUILDING_SPRITE_TYPES`; set `BUILDING_HEIGHT_TILES`.
3. Verify placement works end-to-end (ghost, validity, occupancy) on the 3×3 footprint.

> ⚠️ **Pivot note:** under the cozy pivot the town hall stops being the `isKeep` MP
> anchor and becomes a placeable civic coverage building. Coordinate with Phase G if
> both land — don't bake the keep semantics into the new button.

## Acceptance
- Town hall appears on the toolbar, places as a 3×3 building, renders with its own
  distinct iso sprite. EDG32 + client tests green.
