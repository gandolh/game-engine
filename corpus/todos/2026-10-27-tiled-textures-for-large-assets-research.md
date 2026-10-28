# Tiled textures for large assets (research)

status: todo
created: 2026-10-27
context: the owner, 2026-10-27: "we should research Tiles for large assets maybe". Research only.
Grilled 2026-10-28; the answers are under "Settled at the grill".

## What "large assets" are today

Each game bakes its static layer (the ground that never changes) once on the CPU into one
offscreen canvas, then uploads it as **one** WebGL2 texture
([`static-layer-pass.ts`](../../engine/core/src/render/webgl2/static-layer-pass.ts)). A texture
wider or taller than the driver's `MAX_TEXTURE_SIZE` throws (`assertTextureWithinLimits`), and
[asset-pipeline.md](../wiki/asset-pipeline.md) gives 4096 px as the size 99% of devices support.

- **Farm** bakes 240 × 240 tiles at 16 px: 3840 × 3840 px, about 59 MB of RGBA, a little under
  4096. Widening the world again would cross it.
- **Citadel** bakes in iso. Its render window
  ([`window-controller.ts`](../../games/citadel/client/src/render/window-controller.ts), Citadel
  briefs 21 and 22) bakes only a camera-centred window on a large map and re-bakes as the camera
  pans, at a per-frame budget. The 256 × 256 multiplayer world is 8192 × 4112 px whole. The
  default world is now 192 × 192 (`terrain.ts`); check which path it takes.
- Engine brief 07 ([closed](closed/07-chunked-tile-layer.md)) chose one cached layer over a grid of
  textures in 2026-05, when the world was 640 px across.

So tiling here means: cut a large baked image into a grid of fixed-size textures and draw only the
ones in view. It is the other answer to the problem Citadel's window solves by re-baking.

**Naming.** "Chunk" means a dispatch unit in this repo, and "tile" means a world grid tile
([glossary.md](../wiki/glossary.md)). The pieces need a name of their own before any code; settle
it at the grill and add it to the glossary.

## Settled at the grill (2026-10-28)

1. **All three readings.** Bigger worlds (the static layers above) and large hand-drawn images
   share one mechanism, a large image cut into patches; both are in scope. **Tiled, the map
   editor**, is a separate question (loading its `.tmj`/`.tmx` maps into the engine): research it
   as step 5 below, or split it into its own spec if it turns out not to touch patches.
2. **Desktop is the target; phones degrade.** Size for desktop GPUs; on a phone a game still runs,
   every patch under 4096 px, even if large worlds are slower. Worlds: at least twice today's
   largest (Farm's 240 × 240 at 16 px).
3. **The name is patch**: one fixed-size square of a large baked or drawn image, uploaded as its own
   texture. Added to the glossary; not "chunk" or "tile", which mean other things here.

## What to find out

1. **Inventory** every texture each game creates at boot and its size: static layers, water
   pattern, atlases, Hollow's 3D textures. Measure GPU memory with the browser's tools on Farm and
   Citadel.
2. **Find the breaking point.** Run Farm and Citadel with the browser's `MAX_TEXTURE_SIZE` forced
   to 4096 (a WebGL wrapper, or a real phone) and record what fails today.
3. **Compare three designs** for the engine, on memory, draw calls, bake time and code size:
   - one texture (today), with a clear error past the limit;
   - Citadel's window, moved into the engine so Farm can use it;
   - a fixed grid of textures (for example 1024 or 2048 px), baked once or lazily on first view,
     drawn when visible, freed when far away.
   Say which fits the iso projection, where a world tile's diamond crosses texture edges.
4. **Prototype the grid** on Farm's static layer behind a flag, and compare frame time
   (`?profile`) and GPU memory against the single texture. Check the seams with nearest filtering
   at fractional zoom.

5. **Tiled maps.** What Tiled exports (`.tmj` JSON, tile layers, object layers, tilesets), what
   the engine's map and terrain code would need to load one, and whether any game would use it
   (Citadel's and Farm's worlds are generated, not drawn). A short answer is fine.
6. **Large hand-drawn images.** Whether the patch grid from step 3 serves a painted background or
   map unchanged, and what an asset needs (a source size, a slicing step in the asset pipeline).

## Deliverable

- A findings section in [asset-pipeline.md](../wiki/asset-pipeline.md) or
  [performance.md](../wiki/performance.md), with the inventory, the breaking points and the
  prototype's numbers ([performance-measurements.md](../wiki/performance-measurements.md) gets the
  raw numbers).
- A recommendation, and if it is to build, the follow-up specs for the owner to approve.
- `npm run gates` passes with the prototype behind its flag. Render-only: no sim or determinism
  change.
