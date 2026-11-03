# Citadel: replace the re-baking render window with engine patches

status: todo (approved 2026-11-03); after
[the engine patch spec](2026-10-28-engine-patched-static-layer.md)
created: 2026-10-28
context: the large-textures research
([spec](closed/2026-10-27-tiled-textures-for-large-assets-research.md)).

## Why

Citadel's window ([`window-controller.ts`](../../games/citadel/client/src/render/window-controller.ts),
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
