# Brief 95 — Citadel building restyle toward the "Isometric Buildings" reference look

Status: **todo / in-progress** (partial landed 2026-06-21; remaining items below).

## Why

The user supplied reference art — the CC-BY-SA "Isometric Buildings" set
(Reiner/OpenGameArt) plus three itch.io packs (zatoart *Isometric Isolation*,
zatoart *Isoverse Medieval Outdoors*, xilurus *Pixel Isometric Village*) — and
asked the generated Citadel buildings to **evoke that style**: clean, readable
2:1 iso; warm **terracotta tile roofs**; **half-timbered** (timber-frame +
diagonal bracing over cream infill) and stone buildings; ground plots with props;
lattice towers; market stalls/fences; a cohesive, multi-step (not flat) shading.

Decisions taken with the user:
- **Inspiration only**, stay procedural; no licensed art imported; **EDG32 only**
  (the palette guard stays green) — match the vibe with the warmest EDG swatches
  (clay/rust/salmon for terracotta, cream/tan infill, bark/woodDark oak framing,
  slate/steel stone).
- **Resolution: keep 32-based** (`ISO_ART_SCALE = 1` in
  [iso.ts](../../../games/citadel/client/src/render/iso.ts)). An earlier pass tried
  4×; the user judged 32 dense enough in practice, so buildings author at native
  res like units/terrain. The `ISO_ART_SCALE` knob + `isoArtDims` stay so the
  authoring math is scale-independent if revisited. **This also supersedes the 4×
  rationale in brief [94](94-upscale-units-terrain-to-match-buildings.md)** —
  re-evaluate or close 94 (units/terrain no longer need to "catch up" to 4×).
- Scope: **iterate the existing ~20 generated buildings**, do NOT add new
  standalone props/decor sprites (would need sim/placement hooks).

## Done so far (landed 2026-06-21)

In [iso-draw.ts](../../../games/citadel/client/src/render/sprites/recipes/iso-draw.ts):
- **Terracotta tile roof** (`drawGableRoof`): clay/salmon/rust ramp, tile-course
  banding parallel to the eave, a thick **ridge cap**, and a dark **eave-overhang
  shadow** lip. Replaces the old flat-orange hip.
- **Half-timber framing** (`drawTimberFrame`): oak (bark `%`) studs + top/sill
  plates + mid rail + a **diagonal cross-brace per panel**.
- **Richer wall shading** (`drawWalls`): 3 tones — lit infill, top highlight band,
  darker sill ambient-occlusion band — instead of a flat fill.
- `PLASTER` palette in
  [buildings.ts](../../../games/citadel/client/src/render/sprites/recipes/buildings.ts)
  retargeted to the terracotta + cream + oak mapping.
- Verified at 1× (raster): house/storehouse/chapel still read with roofs +
  framing. typecheck + recipes.test green.

(Context: this builds on the earlier same-day passes — per-type silhouettes, then
distinct medieval FORMS + animated post-mill. See log 2026-06-21 entries and
[citadel-overview.md](../../wiki/citadel-overview.md) "Per-building FORMS".)

## Remaining (the ask, not yet done)

1. **Stronger half-timber bracing** — at 1× the diagonals are faint/cramped; make
   the cross-brace clearly read against the cream infill (maybe widen panels or
   use `W` woodDark vs `%` bark for contrast). Apply to all cottage-form
   buildings (house/bakery/woodcutter/sawmill/smith/healer) + warehouse/town-hall.
2. **Richer roof shading** — confirm the 3-step terracotta reads at 1×; consider a
   4th step / per-tile dither so it doesn't band harshly when small.
3. **Ground base + props** — each building sits on a small dirt/grass plot with a
   few scattered props (barrels, sacks, fence bits) like the references, instead
   of floating on the bare diamond. (Render-only; drawn into the sprite, below the
   body, within the footprint box.)
4. **Cleaner selective outlines** — darker outlines around the silhouette + eaves
   for the "clean, readable" pack look; avoid noisy interior outlines.
5. **Cross-set verification** — apply the style consistently to ALL ~20 forms
   (not just the cottages), then verify: raster PNG sweep, a Playwright pass on the
   real runtime atlas gallery, and in the actual game. typecheck + full
   `@citadel/client` tests + EDG32 palette guard.

## Constraints / gotchas

- **EDG32 guard** ([palette.ts](../../../games/citadel/client/src/render/sprites/palette.ts)
  + the guard test) — every new char must already be in `SWATCH`.
- **Render-only / determinism** — recipes + atlas are pure; no sim impact. The
  mill animation uses the main-thread render clock only.
- **Anchor + dims** — `isoSpriteDims` is the renderer's world-px source of truth;
  keep `isoMetrics`/`isoArtDims` proportional. `recipes.test.ts` asserts
  `width % TILE_SIZE === 0` and per-type opaque-fraction floors (open farm/market/
  mill relaxed) — keep green.
- **Files**: `iso-draw.ts` (forms + style), `buildings.ts` (palettes + mapping),
  `iso.ts` (`ISO_ART_SCALE`). Verify with a temp `tsx` raster script + the temp
  `gallery.html`/`src/gallery.ts` harness (recreate + delete; not committed).

## Verify (definition of done)

All ~20 buildings read as the reference style (terracotta roofs, visible
half-timber bracing, ground props, clean outlines) at game zoom in the actual
Citadel client; mill still animates; typecheck + `@citadel/client` tests + engine
palette test green; temp harness removed; corpus wiki + log updated.
