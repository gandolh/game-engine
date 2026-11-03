# Engine: the static layer on patches, sized from the device

> **Done 2026-11-03.** Built as specified, with three changes found while building.
> - **A 4096 px ceiling for one texture.** One texture is kept only up to 4096 px (and the device's
>   limit). Otherwise, on a desktop, the "twice Farm's width" world (7680 px) fits one 225 MB texture and is
>   never patched ([decisions.md](../../wiki/decisions.md) → Renderer).
> - **Testing a smaller device:** the prototype's `staticPatchSize` and Farm's `?patches=` are gone.
>   `createRenderer`'s `textureLimit`, read by Farm from `?textureLimit=` in dev builds, makes the
>   renderer behave as a smaller device.
> - **The upside-down upload:** walking the patches showed that every baked static layer was drawn upside down.
>   Canvas uploads set `UNPACK_FLIP_Y_WEBGL`. It is now off for every upload.
>
> The rest:
> - `DecorateFn` gained a `region` argument, and Farm's three decorators paint only that region's tiles.
> - Painted images: `@tool/image-patches` cuts them into patches, `loadPatchedImage` loads them and
>   `bakeStaticImage` shows them.
> - The dev page: `npm run harness -w @tool/image-patches`.
>
> Checks:
> - engine tests 688, Farm client 273, Citadel client 597, the tool 3, and the typecheck all pass.
> - In headless Chromium: the 7680 px world held no texture over 2048 px while panning, with far patches freed.
>   There were no gap pixels at four fractional zooms, and 1024 px patches matched one texture at zoom 2.37.
>   At 1.37 and 0.73, 0.01-0.04% of pixels differed: one-pixel tile markers that nearest sampling rounds
>   differently, none on a patch edge.
> - Farm drew identically at its own limit and at `?textureLimit=2048`, now the right way up.
> - Citadel booted.
>
> Record: [asset-pipeline.md](../../wiki/asset-pipeline.md) → *Patches as built*.

> **Owner, 2026-11-03: approved, step 4 included.** The patches replace the single static texture,
> and Citadel's boot fix is folded into the Citadel follow-up. Build step 4, loading a pre-cut painted image
> as patches, now, even though no game uses it yet. Test it with a generated on-palette sample image.
> Farm's map stays 240×240 (owner, 2026-11-03). The "twice the width" acceptance uses a synthetic
> 480×480 world that exists only in tests and a dev-only browser harness, never in the game.

status: todo (approved 2026-11-03)
created: 2026-10-28
context: the recommendation of the large-textures research
([spec](2026-10-27-tiled-textures-for-large-assets-research.md), findings on
[asset-pipeline.md](../../wiki/asset-pipeline.md) → *Large images and patches*). The research
prototype is `90434df` (`staticPatchSize`, Farm's `?patches=`).

## Why

One static texture caps a world at the device's `MAX_TEXTURE_SIZE`: Farm's 3840 px bake fails on a
2048 device and Citadel's 6144 px boot bake on a 4096 one. The owner wants worlds at least twice
Farm's 240×240 at 16 px (7680 px a side, 225 MB as one RGBA image), on desktop, with phones still
running. The prototype showed patches remove the limit with the same shader; it still bakes one CPU
canvas and keeps every patch, so it does not save memory or lift the 2D-canvas size limit.

## What to do

1. **Patch size from the device**: 2048 px, or `MAX_TEXTURE_SIZE` if smaller. A bake that fits in
   one texture keeps one texture (no behaviour change for today's Farm on desktop).
2. **Bake per patch, by region**: each patch bakes its own world region (sprites culled by bounding
   box, `decorate` given the region), the way Citadel's windowed bake already does for iso. No
   whole-world CPU canvas.
3. **Lazy and bounded**: bake a patch the first time it is in view (plus a one-patch ring), at a
   per-frame budget like Citadel's `IncrementalQueue`; free patches two rings out. Memory then
   follows the view, not the world.
4. **Hand-drawn images**: the same path for a pre-sliced large image (an asset step cuts the source
   into patch-sized files; the loader uploads each as a patch).
5. Replace the prototype's `staticPatchSize` option and Farm's `?patches=` with the real switch.
6. Record the call in [decisions.md](../../wiki/decisions.md); it supersedes engine brief 07's
   one-cached-layer choice for worlds past the limit.

## Acceptance

- Farm at its current size renders identically (one texture on desktop); with `MAX_TEXTURE_SIZE`
  forced to 2048 it runs on patches.
- A Farm world twice today's width bakes and draws on desktop without any texture above 2048 px,
  and texture memory stays bounded while the camera crosses the world.
- No visible seam at fractional zoom (screenshot at a non-integer zoom, read back).
- Engine unit tests for patch sizing, culling and eviction; `npm run typecheck` and the targeted
  tests pass.
