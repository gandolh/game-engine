# Brief 13 (engine) — living water: tiling break, noise warp, shore foam, caustics

Promoted from [wiki/shader-ideas.md](../../../wiki/shader-ideas.md) (chs. 9–12; first wave, items 2 + 4). **Caustics half depends on brief 12** (GPU wash) so it composes under the day/night tint.

## Why

[water.wgsl](../../../../packages/engine/src/render/webgpu/shaders/water.wgsl) scrolls one repeated texture — the eye catches the period, and the water reads flat. All four upgrades below are **palette-safe by construction**: pure UV displacement (perturb *where* we sample, never *what color* we output) or alpha-only modulation of pre-parsed EDG uniforms.

## Tasks (in order; each independently shippable)

1. **Cell-hash tiling break.** `floor()` the water UV into a cell grid, hash the cell id (`fract(sin(dot(cell, vec2(12.9898,78.233))) * 43758.5453)`), offset/flip each cell's UV phase. Kills the visible repeat.
2. **Value-noise UV-warp.** Small animated value-noise displacement on the sample coordinate (book ch. 11 hash + bilinear recipe, ~20 lines WGSL), driven by the existing scroll time. Flat scroll → visible undulation.
3. **Quantized shore foam.** `step()`-thresholded noise band at the land/water boundary — the coastal band is already computed in [water-depth.ts](../../../../packages/farm-valley/src/render/water-depth.ts). EDG-white at 2 quantized alpha levels (pixel-art friendly, no smooth gradients).
4. **Voronoi caustics on the shallow band** *(after brief 12)*. 3×3-tile Voronoi distance field thresholded to cell edges, drifted over time, masked to the depth band; output as pre-parsed `EDG.cyan`/white at quantized alpha. The "wow per line" item.

## Acceptance

- Palette guard green; shader time driven from one uniform (not per-call `performance.now()`).
- Render-only — no determinism impact. (Shader hash functions are fine; the `Math.random`-in-sim ban is unrelated.)
- Manual in-browser check at zoom 1–6: no shimmering/aliasing regression at zoom-out (the brief-63 fix class).
- Prefer `step()`-quantized over continuous `smoothstep` washes — smooth analogue gradients clash with nearest-sampled EDG32 art.
