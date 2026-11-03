# Citadel: the boot bake is 6144 px wide and fails on a 4096 device

> **Owner, 2026-11-03: fold this into the patches work.** No stopgap in `window-controller.ts`; the
> boot cap is met by [moving Citadel's window onto patches](2026-10-28-citadel-window-onto-patches.md),
> whose acceptance already boots at 4096. Close this spec when that one closes.

status: todo (approved 2026-11-03)
created: 2026-10-28
context: found by the large-textures research
([spec](closed/2026-10-27-tiled-textures-for-large-assets-research.md), findings on
[asset-pipeline.md](../wiki/asset-pipeline.md) → *Large images and patches*).

## What is wrong

The default 192×192 world takes the windowed path (`windowState().windowed === true`), but the boot
camera frames the whole map, so `visibleTileWindow` returns tiles 0-191 and the first bake is the
whole iso world: 6144×3072, 72 MB. With `MAX_TEXTURE_SIZE` forced to 4096 (a WebGL wrapper in
Chromium, 2026-10-28), `assertTextureWithinLimits` throws and the game does not boot
(`[citadel] boot failed RangeError: static-layer bake is 6144×3072px …`). Many phones report 4096,
and the owner's rule is that phones still run.

## What to do

Make the window never ask for more than the device allows. In
[`window-controller.ts`](../../games/citadel/client/src/render/window-controller.ts), cap the
window's iso region at `gl.getParameter(MAX_TEXTURE_SIZE)` (read through the renderer; never a
hardcoded 4096 or 8192) around the camera centre, and let the camera's zoom-out stop where the view
would need more. Either cap alone works; doing both keeps the view honest. If
[the engine patch spec](closed/2026-10-28-engine-patched-static-layer.md) lands first, this becomes part of
[moving the window onto patches](2026-10-28-citadel-window-onto-patches.md) instead.

## Acceptance

- Citadel boots with `MAX_TEXTURE_SIZE` forced to 4096 (the research's wrapper, or a real phone),
  and the static texture stays at or under the limit while panning and zooming out.
- Desktop behaviour at 8192 is unchanged apart from the cap.
- `npm test -w @citadel/client` passes with a test of the cap.
