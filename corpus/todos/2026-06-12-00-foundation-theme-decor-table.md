---
title: "FOUNDATION #0.5 — `theme` field on RegionDef + per-theme décor table"
created: 2026-06-12
status: done
tags: [world, render, foundation]
blocks: [bigger-decorated-neutral-islands, per-farm-ranch-islands, casino-island-open-air, seasonal-trees-and-big-tree-island]
depends_on: [foundation-grow-grid-to-240]
---

# FOUNDATION #0.5 — `theme` field + per-theme interior décor scatter

> **DONE 2026-06-12.** `RegionTheme` enum + optional `theme?` on `RegionDef`
> (regions.ts; assigned via a `THEME_BY_ID` post-pass, farms default `'ring'`).
> New [interior-decor.ts](../../packages/sim-core/src/render-systems/interior-decor.ts):
> `THEME_TABLE` (theme→frames+density) + `computeInteriorDecor(world)` — blue-noise
> rejection scatter INSIDE each themed region (walkable + `regionAt===id`), mirroring
> set-pieces (fork `decor:<id>`, draw-all-fields each iter). Baked in static-layer.ts
> (layer 2, opaque) — render-only, never an entity, never read by sim. Forbidden-set
> unions plots/solids/stations/home/fountain/dock/board/coral docks + existing
> decoration/structure sprites, and rejects any tile within Chebyshev 1 of a bridge
> tile (mouths). 5 guard tests (zero functional overlap, inside-themed-region,
> determinism, frames-in-table, blue-noise). typecheck + 703 sim-core tests green.
> Render eyeball pending. Note: tall props bake below dynamic sprites (layer 2) — a
> farmer draws over a lamp-post; fine for the substrate. See [log.md](../log.md) 2026-06-12.

The shared substrate for every décor todo. This is the long-open world-gen
"Variety" item, scoped concretely. **Strictly render-only.**

## Decision (grilled 2026-06-12)

- Add a **typed `theme` enum** to `RegionDef`
  ([regions.ts](../../packages/sim-core/src/world/regions.ts)):
  `theme?: 'ranch' | 'casino' | 'shrine' | 'heritage' | 'forest' | 'big-tree' | 'ring' | …`.
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

## Functional-tile avoidance (grilled 2026-06-12)

Interior décor has far more to dodge than the open-water set-pieces (which only
avoid coral). The forbidden-set must **union all functional anchors per region**:
plots, NPC stations, building footprints (`solid` tiles), dock/board tiles, bridge
mouths, AND (on ranch islands) **pen/barn footprints**. Décor is for "the feeling
and story of the game" — but must never render on top of or visually block a
gameplay tile. **Add a guard test:** no décor tile coincides with any
plot/station/footprint/pen/bridge-mouth tile.

## Acceptance

- `RegionDef.theme` typed enum exists; décor table + interior scatter implemented.
- Guard test: zero décor tiles overlap functional tiles (plots/stations/footprints/
  pens/dock/bridge mouths).
- Décor is deterministic across seeds (positions stable per `WORLD_GEN_SEED`),
  EDG32-only (palette guard green), and provably never touched by sim code.
- A region with a theme renders themed interior props; a themeless region renders
  bare as before.
