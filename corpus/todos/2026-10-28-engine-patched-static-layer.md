# Engine: the static layer on patches, sized from the device

status: proposed — for the owner to approve or reject
created: 2026-10-28
context: the recommendation of the large-textures research
([spec](closed/2026-10-27-tiled-textures-for-large-assets-research.md), findings on
[asset-pipeline.md](../wiki/asset-pipeline.md) → *Large images and patches*). The research
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
6. Record the call in [decisions.md](../wiki/decisions.md); it supersedes engine brief 07's
   one-cached-layer choice for worlds past the limit.

## Acceptance

- Farm at its current size renders identically (one texture on desktop); with `MAX_TEXTURE_SIZE`
  forced to 2048 it runs on patches.
- A Farm world twice today's width bakes and draws on desktop without any texture above 2048 px,
  and texture memory stays bounded while the camera crosses the world.
- No visible seam at fractional zoom (screenshot at a non-integer zoom, read back).
- Engine unit tests for patch sizing, culling and eviction; `npm run typecheck` and the targeted
  tests pass.
