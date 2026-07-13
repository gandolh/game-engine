---
title: "Citadel building art rebuild — in-code 3D-box dimetric renderer (from scratch)"
created: 2026-07-13
status: DONE 2026-07-14 (`6cc32fb` Phase 1 + `d1e7c7c` Phase 2) — all 21 buildings rebuilt as meshes, browser-approved. Phase-3 polish (dynamic `@lit`/animation-parity, dead-code cleanup, tests-through-atlas) split out to [2026-07-14-citadel-mesh-phase3-cleanup.md](2026-07-14-citadel-mesh-phase3-cleanup.md).
tags: [citadel, client, render, art, assets, iso, dimetric, apollo, 3d-box]
---

# Rebuild Citadel building art from scratch — 3D-box → dimetric projection → flat-shaded sprite

**Decision (user, 2026-07-13):** the 2D ASCII pixel-recipe approach (`iso-draw.ts` primitive
composition) does not produce recognizable complex buildings reliably — blind procedural pixel
art needs a visual loop we can't cheaply run, and it's a weak spot. **Rebuild all Citadel
building art from 0** using an **in-code 3D-box renderer** (the user's idea; also how pros make
iso art — model in 3D, project to a 2D sprite). Supersedes the
[CC0-ingest todo](closed/2026-07-11-citadel-external-cc0-art-ingest.md) (external art was
rejected; this is the from-scratch replacement).

## Why this approach (research 2026-07-13, inline)
Pro iso art is baked from 3D (Blender→sprite; voxel→iso like [IsoVoxel](https://github.com/tommyettinger/IsoVoxel)).
The in-code variant fits Citadel: it's **deterministic geometry + a projection matrix + flat
shading** — math, not per-pixel artistry — which is where generation succeeds. A bakery becomes
"body box + half-cylinder oven + chimney"; a watchpost is "small box on 4 leg-boxes" — reads
correctly *by construction*. Chose it over baking from MagicaVoxel/Blender (needs an offline tool,
committed PNGs, licensing, and amends the "no external art pipeline" decision).

## In-memory representation (researched 2026-07-13, user-directed)
**Indexed triangle mesh** (the universal "indexed face set"): a vertex array (3D positions) + a
triangle-index list (3 vertex-indices/face) + per-face material. NOT half-edge (that only wins for
topological *editing*/adjacency and is manifold-restricted — we generate-then-render). Buildings are
proper 3D objects built from **parametric primitive generators** (`box`, `cylinder`, `cone`,
`prism/gable`, `pyramid`) that each emit a mesh, transformed (translate/scale/rotate) and **merged**
into one indexed mesh — so ovens can be round, roofs conical/pyramidal, etc. (not box-only). Render
with a small software rasterizer: dimetric-project verts, **z-buffer** per pixel (robust for
curved/interpenetrating geometry), back-face cull, **flat-shade each triangle by face normal** → an
Apollo tone. (Superseded the box-only first cut per user direction 2026-07-13.)

## The technique
- **2:1 dimetric** (Citadel already uses it: `ISO_TILE_W=32`, `ISO_TILE_H=16`, `ISO_ART_SCALE=2`
  in [iso.ts](../../games/citadel/client/src/render/iso.ts)).
- Project a 3D point: `sx = (x−y)·(TILE_W/2)`, `sy = (x+y)·(TILE_H/2) − z·heightScale` (scaled by
  `ISO_ART_SCALE`). Draw faces **back-to-front (painter's)**.
- **Three-tone flat shading** (the non-negotiable iso look): top face brightest, left mid, right
  dark — depth reads from face value. Each material = **3 adjacent steps on an Apollo ramp**
  (`CITADEL_PAL`/`APOLLO` in [citadel-palette.ts](../../games/citadel/client/src/render/citadel-palette.ts)).
- Optional darker silhouette outline (IsoVoxel-style) for readability.

## Integration contract (verified)
The atlas consumes `RasterizedRecipe = {rgba: Uint8ClampedArray, width, height}` per named frame
([rasterize.ts](../../games/citadel/client/src/render/sprites/rasterize.ts),
[atlas.ts](../../games/citadel/client/src/render/sprites/atlas.ts) shelf-packs `ALL_RECIPES`).
The new renderer emits a `RasterizedRecipe` directly per building (named `bld/<type>`) — a drop-in;
no char-grid needed. Everything downstream (renderer, snapshot, day/night wash, showcase) is
unchanged.

## Phased plan
- **Phase 1 — core + 3-building slice (CURRENT):** the `BoxModel` type (boxes + gable/hip roof
  prisms + material), the dimetric projector + 3-tone Apollo flat-shaded rasterizer → `RasterizedRecipe`,
  and 3 sample buildings (`house` simple, `bakery` medium w/ oven, `watchpost` tall/stilted).
  Wire ONLY these 3 into the atlas (override those recipe frames) so `?showcase` shows new-vs-old
  side by side. **Gate: a real-browser screenshot the user approves** before Phase 2.
- **Phase 2 — all 21 buildings** modeled as box recipes.
- **Phase 3 — dynamic features** (mill sails as animated geometry, lit-window night frames,
  burning/damaged states, tier upgrades) + outline/AA polish.
- **Cleanup:** delete the superseded `iso-draw.ts` 2D primitives + char-recipes once all buildings
  are ported.

## Constraints
- Apollo palette only (`CITADEL_PAL`/`APOLLO`); per-scope palette guard must stay green.
- Deterministic (no `Math.random`/`Date.now`; boot-time atlas build only).
- No external tools, no committed PNGs (stays procedural + runtime atlas). No atlas growth beyond
  the pow2 ceiling.
- `npm run typecheck` + `@citadel/client` tests green.

## Acceptance
- Buildings read as recognizable, distinct forms **in a real browser** (the bar unit tests can't
  meet — the whole reason the 2D approach failed unseen). Screenshot-verified per phase by the user.
