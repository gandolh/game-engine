---
title: "Citadel — rotate the minimap to iso space so the camera viewport reads as a rectangle"
created: 2026-06-22
status: done
resolved: 2026-06-22
tags: [citadel, render, ui, minimap]
---

> **Done 2026-06-22.** [minimap.ts](../../games/citadel/client/src/ui/minimap.ts)
> now draws in iso world-px space (chose the cleaner framing over option (b)): a
> single uniform fit transform maps iso world-px → the square face; terrain is
> re-baked once as iso diamonds (via `tileDiamond`), and buildings/villagers/
> raiders project through the world's `tileToIso`. The camera viewport's four
> screen corners invert to iso world-px and are plotted directly, so the quad is
> an upright rectangle by construction. Click-to-seek inverts the same fit
> transform (face → iso → tile). Render-only, EDG32-clean, dpr-aware; client
> tests + palette guard + typecheck green. Still worth a live HiDPI visual pass.

# Citadel — rotate the minimap so the viewport is a rectangle

## Problem

The minimap draws the world in **axis-aligned tile space**
([ui/minimap.ts](../../games/citadel/client/src/ui/minimap.ts)). The game itself
renders **2:1 dimetric isometric**, so the rectangular screen viewport, when its
four corners are inverted back to tile coords, becomes a **diamond** on the
minimap ([minimap.ts:126-148](../../games/citadel/client/src/ui/minimap.ts#L126)).
A diamond "viewport" is hard to read — players expect the on-minimap viewport box
to look like their actual (rectangular) screen.

## Wanted

Rotate/skew the minimap into the same iso orientation as the world so the camera
viewport quad renders as an upright **rectangle** (matching the screen), while
terrain, buildings, villagers and raiders rotate with it and still line up.

## Approach

The cleanest framing: draw the minimap in **iso/screen space** instead of tile
space, so the inverse-projected viewport is axis-aligned by construction.

- Project every stamped element through the same `tileToIso` the world uses
  ([render/iso.ts](../../games/citadel/client/src/render/iso.ts)) into a
  normalized iso box that fits the minimap face, instead of the current
  `px(tileX)/py(tileY)` linear tile→px map.
- Terrain bake: today it's a 1px/tile axis-aligned bake scaled up
  ([minimap.ts:69-80](../../games/citadel/client/src/ui/minimap.ts#L69)). Either
  (a) re-bake it as an iso diamond (rotate the offscreen canvas when blitting), or
  (b) keep the tile bake but apply a single canvas transform (rotate ~45° + 2:1
  vertical scale) around the minimap center before drawing terrain + entities, so
  the whole map tilts and the viewport box comes out rectangular. Option (b) is
  far less code — one `ctx.setTransform` / `ctx.rotate`+`ctx.scale` wrapping the
  existing draw — and worth trying first.
- The **click-to-seek** inverse must be updated to match: `mousedown` currently
  maps click→tile via a plain linear map
  ([minimap.ts:83-88](../../games/citadel/client/src/ui/minimap.ts#L83)); after
  rotating, invert the same transform (screen→iso→tile) so clicks still recentre
  on the tile under the cursor.
- Keep the minimap face square; the rotated map should fit inside it (the iso
  world is wider than tall, so scale to fit the diagonal).

## Notes / constraints

- **Render-only.** No sim, no determinism impact. EDG32-only (palette guard scans
  this `.ts`; the colors are unchanged — only geometry moves).
- Watch the dpr scaling (`ctx.scale(dpr,dpr)` already applied in the ctor) — the
  rotation transform composes on top; verify on a HiDPI display.
- Re-verify the four-corner viewport inversion
  ([minimap.ts:129-145](../../games/citadel/client/src/ui/minimap.ts#L129)) still
  produces a closed quad after the change — it should now be the rectangle.

## Acceptance

- The camera viewport on the minimap renders as an upright rectangle that tracks
  pan/zoom and matches the screen aspect.
- Terrain, buildings, villagers, raiders remain correctly positioned under the
  rotation; click-to-seek still recentres on the clicked tile.
- Render-only, EDG32-clean, client tests + palette guard + typecheck green;
  visually verified in `npm run citadel`.
