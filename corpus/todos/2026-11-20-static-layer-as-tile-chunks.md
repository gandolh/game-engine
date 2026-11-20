# Static layer as tile chunks

status: open. Promote when brief 07 or a later bench reading shows the static layer's GPU time or
memory breaking the bar on a reference device, the Android phone most likely.
created: 2026-11-20
context: the 60 fps plan, [frame-budget.md](../wiki/frame-budget.md).

## The cost today

Each game bakes the ground once on the CPU into one big image and uploads it as a texture. Farm's
is 3840×3840, 56.3 MB. Citadel's 192×192 map is 6144×3072, 72 MB, drawn as 2048 px patches since
2026-11-03 ([asset-pipeline.md](../wiki/asset-pipeline.md), "Patches as built"). Megabytes are not
milliseconds, and the patches already keep every texture under the device limit. On a phone,
though, memory bandwidth and the browser's GPU memory budget are tight.

## What the industry does instead

Tile engines don't bake the ground into one image. Godot's TileMap, Unity's Tilemap and Tiled
renderers build a static vertex buffer per chunk of tiles, often 32×32, and draw the chunks in view
from the tile atlas. A second way stores the tile indices in a small texture and looks the atlas up
in the fragment shader. Either way the memory is the atlas plus a few kilobytes per chunk, not one
image the size of the world.

## What it would take

- Farm's bake draws more than tiles: the decorator's shore foam and the water pattern. Citadel's
  terrain carries a hillshade. Each needs its own answer, as tiles, an overlay pass or a shader term.
- Measure the draw cost of the chunks in view at the widest zoom against today's one textured quad.

A spike on Farm behind a flag, compared on the reference devices, comes before any engine change.
