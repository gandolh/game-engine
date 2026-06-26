---
title: "Citadel — give it real pixel-art sprites (buildings/villagers), not flat quads"
created: 2026-06-19
status: superseded
tags: [citadel, render, assets, art]
---

# Citadel — real pixel-art sprite assets

> **SUPERSEDED / DONE (2026-06-26).** The premise ("100% procedural flat quads, no
> sprites, 1×1 white atlas") is **stale** — the 2026-06-21 true-isometric epic built
> the full library this todo asked for: `sprites/recipes/{buildings,units,fx}.ts`
> author every building type as an iso volume (diamond base + two shaded faces + hip
> roof), an animated 8-frame windmill, a 32px villager, a horned axe raider, and a
> 16px pedestrian — packed via `rasterize.ts` + `atlas.ts`. Eyeballed a 33-sprite
> contact sheet (2026-06-26): coherent, type-distinct, well-shaded iso settlement.
> The renderer resolves real `bld/<type>`/`vil/person`/`raider` frames. Nothing left
> to author. See log.md 2026-06-26.

**The headline asset-quality gap:** Citadel currently renders **100% procedural
flat-colored quads** — there are no sprites at all. Buildings, villagers, raiders,
and ambient crowd are all solid-color rectangles tinted from the EDG32 palette and
drawn through a generated **1×1 white-pixel atlas**. Farm Valley, on the same
engine, has a full baked pixel-art atlas. Citadel reads as a geometric prototype by
comparison.

## Context

Verified in the renderer:

- [citadel-renderer.ts](../../games/citadel/client/src/render/citadel-renderer.ts) —
  `createQuadAtlas()` generates a 1×1 white pixel and tints it per entity; no frames.
- [quads.ts:142-190](../../games/citadel/client/src/render/quads.ts#L142) —
  `buildingQuad()` returns a single filled `fillRect`-equivalent quad per building
  (roads/gates get an inset band; everything else fills its footprint, burning →
  `EDG.orange`); `villagerQuad()` is a 0.7-tile centered square colored by FSM
  state; `raiderQuad()` is a red square scaled by strength.

Farm Valley's pipeline is the template: ASCII `PixelRecipe` grids → `npm run atlas`
([tools/atlas-builder](../../tools/atlas-builder/)) shelf-packs them into sheets +
`index.json`. The bake principle and atlas best-practice are documented in
[wiki/asset-pipeline.md](../wiki/asset-pipeline.md). The renderer already does
sprite-batch quads with `atlasId`/frame resolution — it just has nothing but a 1×1
frame to draw.

**Scope of this TODO** (the full-fidelity path; see the sibling
[procedural-building-detail](2026-06-19-citadel-procedural-building-detail.md) todo
for the cheap no-asset interim slice):

- Author Citadel `PixelRecipe`s — one per building type (house, farm, mill, bakery,
  market, chapel, garrison, tower, wall, gate, keep, road, trading post), per-tier
  variants where it matters, plus a burning/damaged overlay frame.
- A villager character sprite (idle + a short walk cycle; FSM/clothing tint as an
  overlay, not the whole body) and a raider sprite (light/heavy silhouettes).
- Extend `@tool/atlas-builder` with Citadel recipes (or a parallel Citadel atlas
  build) and commit the baked sheets + `index.json` under the Citadel client's
  public dir. Keep the engine generic — no game-specific art in `@engine/core`.
- Multi-tile structures may bloat a sheet → note the maxrects-packer upgrade path
  the asset-pipeline wiki already documents.

All EDG32-compliant (the palette guard walks `games/`); the renderer code largely
exists — this is mostly **art authoring + pipeline wiring**, so it's a large but
high-impact effort. Render-only, no determinism impact.

## Acceptance

- Buildings/villagers/raiders draw from real multi-frame pixel-art sprites resolved
  by type/state, not a 1×1 tinted quad.
- A committed Citadel atlas (sheets + manifest) built by a repeatable `npm run`
  command; palette guard + typecheck green.
- A clear visual lift in the running client (`npm run citadel`) over the current
  flat-quad look.
