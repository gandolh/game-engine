# Task 21: a tile-chunk ground spike in Farm

**Origin:** the [static layer as tile chunks todo](../../todos/2026-11-20-static-layer-as-tile-chunks.md),
promoted by the owner on 2026-11-23 with the rest of the measure-first todos: build light optimizations that
are not too heavy, complex or wide ([decisions.md](../../wiki/decisions.md) → Frame budget). The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Opus ([routing.md](../../routing.md)): a new rendering approach whose shape is not settled.

**Depends on:** none.

## Context

Each game bakes its ground once on the CPU into one big image and uploads it. Farm's is 3840×3840, 56.3 MB;
Citadel's is 6144×3072, 72 MB, drawn as 2048 px patches
([asset-pipeline.md](../../wiki/asset-pipeline.md), "Patches as built"). Tile engines (Godot's TileMap,
Unity's Tilemap, Tiled renderers) instead build a static vertex buffer per chunk of tiles, often 32×32, and
draw the chunks in view from the tile atlas. The memory is the atlas plus a few kilobytes per chunk.

On the laptop the ground is no problem: Farm's GPU time is 2.6–2.7 ms a frame. The gain would be memory and
bandwidth on a phone. But moving every game's ground off baked images is a large engine change, and Farm's
bake draws more than tiles: the decorator's shore foam and the water pattern. The todo itself says a spike
comes first. **This brief is only the spike**: Farm, behind a URL flag, measured against today. Whether to
adopt it is a later brief.

## Files you OWN

- A new pass in `engine/core/src/render/webgl2/` (for example `tile-chunk-pass.ts`), its shaders and tests
- `engine/core/src/render/webgl2/renderer.ts`, only for one optional hook that draws the chunk pass in
  place of the static layer
- Farm's client code that builds the static layer, behind `?tilechunks`
- `corpus/verify/<date>-tile-chunk-spike/` (screenshots and counter exports)
- `corpus/` pages for this brief: the outcome, `log.md`, the todo's status line,
  [asset-pipeline.md](../../wiki/asset-pipeline.md) (a "Tile-chunk spike" section) and
  [frame-budget.md](../../wiki/frame-budget.md)

## Files you must NOT touch

- Citadel's terrain, and Farm's default path: without the flag, Farm draws exactly as today.
- `static-layer-pass.ts` beyond what the hook needs.
- The atlas cook.

## What to do

1. **Chunk the tiles.** Group Farm's ground tiles into 32×32 chunks, one static vertex buffer per chunk
   with each tile's atlas rectangle, built once at load. Draw the chunks that intersect the view.
2. **Keep the extras simple.** Draw shore foam and the water pattern the cheapest way that looks right:
   keep baking them into a much smaller overlay, or draw them as tiles. Say which, and what it costs.
3. **Measure both paths** in the headless bench with and without `?tilechunks`: texture bytes created
   (`textureBytesTotal`), GL draw calls at the widest zoom (0.5), and the CPU milliseconds of the new pass.

## Acceptance

- Without the flag, Farm's headless counters are unchanged.
- With the flag, the outcome gives texture memory, draw calls and CPU time against today's, and screenshots
  of the default and widest zoom side by side in `corpus/verify/<date>-tile-chunk-spike/`.
- The outcome ends with a recommendation: adopt for Farm, adopt for both games, or drop, with the reason.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Look at the side-by-side screenshots and say whether the flagged ground looks right.
- Deploy only if the flag should be reachable on the live site: `node cli.ts farm-valley deploy`.

## Outcome (2026-11-24)

**Built.** `TileChunkPass` ([tile-chunk-pass.ts](../../../engine/core/src/render/webgl2/tile-chunk-pass.ts),
its shaders and tests) groups the static sprites into 32×32-tile chunks: one instance buffer per chunk
(24 bytes a quad), built once per bake, sorted as the bake sorts, and one instanced draw per chunk in view.
`WebGl2Renderer.bakeTileChunks` is the one hook: it drops the baked layer, draws the chunks in its place,
and replays them after a context restore. Farm feature-detects it under `?tilechunks`, read in production
builds too ([static-layer.ts](../../../games/farm/client/src/main/static-layer.ts)). Without the flag Farm
bakes and draws as before.

**The extras are drawn as tiles, as shader terms, with no texture.** On a tile with an opaque ground
sprite, the ground noise's shade and the shore descent's bands are applied to each sprite of the tile:
both are affine per pixel, so that equals painting them over the stack. Tiles without ground (water,
bridges) get one decoration quad after the chunk's sprites: the shade square, then the water depth's
speckles, by the same hash as the CPU decorator, compared as integers. Cost: 28,379 decoration quads
(680 KB of the buffers), integer hashing in the fragment shader on those quads, and the decorators' logic
in two places (the CPU bake and the shader), pinned against each other by
[static-layer.test.ts](../../../games/farm/client/src/main/static-layer.test.ts), which runs each
decorator against a recording canvas. Sprite alpha is ignored, as the bake ignores it.

**Measured** (headless SwiftShader, Farm's bench scene, 1280×800; everything in
[verify/2026-11-24-tile-chunk-spike/](../../verify/2026-11-24-tile-chunk-spike/README.md); the load average
was 1-21, other builders shared the machine):

| | Today | `?tilechunks` |
|---|---:|---:|
| Texture bytes created (`textureBytesTotal`) | 61,176,324 | 2,193,924 (-58,982,400, the 3840×3840 bake) |
| Instance buffers | 0 | 1,637,328 (68,222 quads, 64 chunks) |
| GL draws for the ground at the widest zoom (0.5, whole world in view) | 1 | 64 |
| GL draws for the ground at the default zoom, centre | 1 | 9 (10,797 quads) |
| Instances a frame, p95 | 6,887-6,958 | 75,134-75,155 |
| CPU ms of the pass a frame, mean / p95 | not timed (one blit) | 0.06 / 0.2 (0.40 / 2.4 in a run at load 21) |
| Ground build at boot and at each season change, CPU ms | 520-767, plus 357-408 likely waiting on the upload | 143-264 |

- **Without the flag the counters are unchanged.** Texture bytes, textures, uploads and draw groups are
  identical in all 9 no-flag runs. GL draw calls are 93 a frame (as before the edit) or 135, in 2 and 5 runs:
  the Farmers panel lays its cards out two ways depending on the sim state a run reaches (screens of both,
  same code, no flag, in the verify folder); flagged runs show both states too. Why the panel switches was
  not looked for.
- **Screens.** Side by side at the default zoom, on a coast and at the widest zoom, the flagged ground looks
  the same. On land 70-89% of pixels are identical and most of the rest differ by 1-2 levels (8-bit canvas
  against float shader). The rest are moving sprites, water through bridge gaps and, at the widest zoom,
  single texels picked differently by nearest sampling. No seams at chunk borders.
- **SwiftShader drew the flagged frames 5-7× slower** (frame interval 271-280 ms against 38-51 at the default
  zoom), so the flagged benches sampled 40-76 frames, not 180-330, and their frame means don't compare.
  Discarding the decoration quads, a texture-only fragment shader, triangle lists and integer attributes
  each changed nothing. The cause was not found; SwiftShader's frame times are not GPU readings.

**Recommendation: adopt for Farm, if one real-GPU reading agrees; not for both games.** For: the static
layer's memory falls from 56.25 MB of texture to 1.56 MB of buffers, and the ground build costs 0.4-0.5 s
less main-thread CPU at boot and at every season change (0.8-0.9 s counting the likely upload wait), for
about 0.06 ms a frame of CPU. Against:
at the widest zoom the ground becomes 64 draws and 68,222 instanced quads instead of one textured quad, a
GPU cost this sandbox cannot measure. The reading that would flip it to drop: on the laptop, Farm's
`?bench&profile&tilechunks` with a GPU p95 more than 1 ms above the same run without the flag (3.8-4.2 ms
today), or an interval p95 over 16.7 ms. Not for both games: no run touched Citadel, whose iso tiles overlap
their neighbours (this pass orders sprites per chunk, which is exact only for tiles that don't) and whose
hillshade would need its own term. An adoption brief could drop the 28,379 decoration quads by moving the
shade over water into the water pass.

**Deviations.**
- Steps 1 and 2 share one commit: the extras are terms of the same shader and pass.
- `games/farm/client/src/main/render-loop.ts` records `render.tileChunks`, `draw.tileChunks` and
  `extra.tileChunks`, only under the flag. `shore-descent.ts` and `water-depth.ts` export the constants the
  chunk path reuses.
- Farm declares the hook's types structurally instead of importing them: the render barrel wasn't the
  brief's to change.
- The measurements need a copy of the bench with the flag in its URL
  ([bench-flag.ts](../../verify/2026-11-24-tile-chunk-spike/bench-flag.ts)) and two CDP scripts for the
  screenshots and the build CPU; `scripts/bench.ts` is unchanged.

**Owner steps.** Look at the side-by-side images in the verify folder and say whether the flagged ground
looks right. The real-GPU reading is the controller's: `?bench&profile` against `?bench&profile&tilechunks`
on the laptop, from a local production build, or from the live site after `node cli.ts farm-valley deploy`.
