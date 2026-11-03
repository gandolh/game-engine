# Citadel: replace the re-baking render window with engine patches

> **Done 2026-11-03.** `createCitadelRenderer` bakes the terrain once, through the engine's patched
> static layer: at 192×192 the 6144 px iso world is a 3×2 grid of 2048 px patches. `makeTerrainDecorate(iso, grid)`
> takes each patch's iso rect as `region` and paints only the diamonds that reach it, in the whole-world order.
> Removed: `window-controller.ts`, `build-budget.ts` (`IncrementalQueue`) and their tests. They are replaced by
> `terrain-bake.test.ts`, which checks four things:
> - every pixel's diamond is painted;
> - no diamond whose box misses the patch is painted;
> - the paint order is the whole-world order;
> - both shipped sizes are past one texture.
>
> `WINDOW_PAD` moved to `render-window.ts`, which still culls the pushed sprites. `__citadel.windowState()` now
> reports `staticLayerInfo()`, and `?textureLimit=` works in dev.
>
> Checked in headless Chromium at `?textureLimit=4096`:
> - solo 192×192 boots and looks as before;
> - pans inside live patches baked nothing (6 bakes throughout);
> - going to the far corners freed patches (4 live) and re-baked them on return;
> - no seam where patches meet at iso x = 2048.
>
> **256×256 was not drawn.** The client renders its own 192×192 terrain even under `?mp`, so the server's
> 256×256 world never reaches the renderer. Online play is deprecated (Citadel decision #21). Its 8192 px
> extent is covered by the unit check and the engine's grid sizing. Citadel's tests pass: 589.

status: todo (approved 2026-11-03); after
[the engine patch spec](2026-10-28-engine-patched-static-layer.md)
created: 2026-10-28
context: the large-textures research
([spec](2026-10-27-tiled-textures-for-large-assets-research.md)).

## Why

Citadel's window ([`window-controller.ts`](../../../games/citadel/client/src/render/window-controller.ts),
`render-window.ts`, `build-budget.ts`: ~380 lines) re-bakes the whole window every time a pan
passes the pad, and its size follows the camera, which is how the boot bake reached 6144 px. Engine
patches bake each region once, keep what is near, and never exceed the device limit.

## What to do

Bake Citadel's iso terrain through the engine's patched static layer (each patch an iso region,
`makeTerrainDecorate(iso, grid, region)` as today), drop the window controller and its queue, and
keep the `__citadel.windowState()` dev hook reporting the patch state instead.

## Acceptance

- Citadel boots and pans with `MAX_TEXTURE_SIZE` forced to 4096, at 192×192 and 256×256.
- No terrain re-bake on a pan inside already-baked patches.
- `npm test -w @citadel/client` passes; the window-controller tests are replaced, not deleted
  without a replacement.
