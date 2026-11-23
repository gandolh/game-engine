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
