# Shader ideas — Book of Shaders → WebGPU TODOs

Source: [The Book of Shaders](https://thebookofshaders.com/) (Vivo & Lowe), chapters 5–13, read 2026-06-12 and filtered against the WebGPU renderer (`webgpu-migration` branch, waves 0–4 shipped). Each TODO names the file it would land in. Items are *ideas*, not committed work — promote one to a `briefs/engine/todo/` brief before implementing.

## Cross-cutting constraints (read before picking any item)

- **The book is GLSL; we write WGSL.** Core builtins translate 1:1 (`fract`, `mix`, `step`, `smoothstep`, `length`, `atan2` for `atan(y,x)`, `dpartial`→`fwidth` already in use in [particle.wgsl](../../packages/engine/src/render/webgpu/shaders/particle.wgsl)).
- **EDG32 palette is enforced** ([palette.ts](../../packages/engine/src/render/palette.ts) + guard test). Two compliant strategies, both already proven in the codebase:
  1. **Pre-parsed EDG uniforms at varying alpha** — CPU parses an `EDG.*` hex to floats and passes it in (the [weather-pass.ts](../../packages/engine/src/render/webgpu/weather-pass.ts) pattern). Procedural math may only modulate *alpha/coverage*, never synthesize new RGB.
  2. **UV displacement only** — the shader perturbs *where* it samples an already-palette-compliant texture, never *what color* it outputs (safe for water/static-layer effects).
  Free-floating gradients (book ch. 6 HSB rainbows) are **out** unless quantized to EDG levels via `step()`.
- **Determinism:** all of this is render-only (snapshot consumer side), so sim determinism is untouched. Render-side animation already uses wall-clock phases (bridges, ducks) — fine to continue, but drive shader time from one uniform, not per-call `performance.now()`.
- **Pixel-art aesthetic:** smooth analogue gradients clash with nearest-sampled EDG32 art. Prefer `step()`-quantized noise (2–3 alpha levels) over continuous `smoothstep` washes; the book's shaping chapter gives the tools for both.

## Ch. 5 — Shaping functions (`step`, `smoothstep`, `pow`, `sin`)

- [ ] **Shaped particle fade-out.** Particle alpha arrives per-instance linear from CPU; apply `pow()`/`smoothstep` easing in [particle.wgsl](../../packages/engine/src/render/webgpu/shaders/particle.wgsl) (or CPU-side in [particle-batch.ts](../../packages/engine/src/render/webgpu/particle-batch.ts)) so sparks die fast and smoke lingers. Cheap, no palette risk (alpha only).
- [ ] **Rain-streak tail taper.** In [weather.wgsl](../../packages/engine/src/render/webgpu/shaders/weather.wgsl) fade streak alpha head→tail with `smoothstep` along the quad's v coordinate — reads as motion blur, parity-plus over the flat Canvas2D lines.
- [ ] **Soft-edged drop shadows.** [shadow-batch.ts](../../packages/engine/src/render/webgpu/shadow-batch.ts) ellipses are hard-edged; `smoothstep` the ellipse SDF over ~1px (`fwidth`) like the particle circles already do.

## Ch. 6 — Colors (`mix`)

- [x] **GPU day/night wash.** Realised as `TintPass` (`engine/core/src/render/webgpu/tint-pass.ts`), fed a CPU-computed EDG `WashSpec` via `endFrame(wash, …)`. Used by both games.
- [ ] **Seasonal grading via per-channel `mix`.** Book shows `mix()` with a `vec3` t — per-channel grading could replace/extend the existing seasonal tint while keeping the target colors EDG-derived.

## Ch. 7 — Shapes (SDFs, polar coordinates)

- [ ] **Proper 8-point star particle.** [particle.wgsl](../../packages/engine/src/render/webgpu/shaders/particle.wgsl) star is an L1 diamond (brief 4a accepted the simplification). The book's polar method — modulate radius by `atan2(v,u)` — restores Canvas2D's 8-point star for ~5 lines of WGSL.
- [ ] **Round snow.** [weather.wgsl](../../packages/engine/src/render/webgpu/shaders/weather.wgsl) draws snow as squares; the SDF-circle-with-`fwidth` recipe is already proven in particle.wgsl — copy it over for parity with Canvas2D's round flakes.
- [ ] **SDF ring splashes for rain.** Brief 81's rain field has ground/water splashes (particles). A GPU expanding-ring SDF (`abs(length(uv)-r) < w`) per splash instance would be crisper and cheaper at high drop counts.

## Ch. 8 — 2D matrices (rotating/translating coordinate space)

- [ ] **Vertex-shader wind sway.** Bridge sway is CPU-side today (per-frame sprite re-push, see log 2026-06-11); crops/trees don't sway at all. A per-instance `swayPhase + swayAmp` attribute in [sprite-batch.ts](../../packages/engine/src/render/webgpu/sprite-batch.ts) plus a small shear/rotation about the sprite's base in the vertex stage gives whole-map foliage sway with zero per-frame CPU work. The rotation-matrix plumbing already exists in [sprite.wgsl](../../packages/engine/src/render/webgpu/shaders/sprite.wgsl).

## Ch. 9–10 — Patterns + random (`fract` grids, hash functions)

- [ ] **Break water tiling repetition.** [water.wgsl](../../packages/engine/src/render/webgpu/shaders/water.wgsl) scrolls one repeated texture — the eye catches the period. Book recipe: `floor()` the UV into a cell grid, hash the cell id (`fract(sin(dot(cell, vec2(12.9898,78.233))) * 43758.5453)`), and offset/flip each cell's UV phase. Pure UV displacement → palette-safe. (Shader hash is fine here — render-only; the `Math.random`-in-sim ban is unrelated.)
- [ ] **Per-flake snow variation.** Hash the instance index in [weather.wgsl](../../packages/engine/src/render/webgpu/shaders/weather.wgsl) for size/alpha twinkle variation instead of uniform flakes.

## Ch. 11 — Noise (value noise)

- [ ] **Living water via noise UV-warp.** Add a small value-noise displacement to the water sample coordinate in [water.wgsl](../../packages/engine/src/render/webgpu/shaders/water.wgsl), animated by the existing scroll time. Pure UV displacement (palette-safe); turns the flat scroll into visibly undulating water without new art. Pairs with the cell-hash item above. ~20 lines of WGSL (hash + bilinear value noise from the book).
- [ ] **Quantized noise shore foam.** A `step()`-thresholded noise band at the land/water boundary (the static layer knows where shores are — [water-depth.ts](../../packages/farm-valley/src/render/water-depth.ts) already computes the coastal band) as animated EDG-white foam flecks at 2 alpha levels.

## Ch. 12 — Cellular noise (Voronoi)

- [ ] **Shallow-water caustics.** The coastal depth band is currently a static baked cyan tint ([water-depth.ts](../../packages/farm-valley/src/render/water-depth.ts)). The book's 3×3-tile Voronoi distance field, thresholded to its cell *edges* and drifted over time, is the classic water-caustics look — masked to the depth band, output as pre-parsed `EDG.cyan`/white at quantized alpha. The single most "wow per line" candidate; needs the GPU wash pass first so it composes correctly under the day/night tint.

## Ch. 13 — Fractal brownian motion + domain warping

- [x] **Cloud-shadow pass.** Realised as `CloudShadowPass` (`engine/core/src/render/webgpu/cloud-shadow-pass.ts` + `shaders/cloud.wgsl`, brief 15): world-anchored 3-octave fBm, `step()`-quantized to 3 alpha levels, pre-parsed EDG uniform color, premultiplied source-over. Driven per-game via the (optional) `RendererLike.setCloudOptions({ color, coverage, driftSpeed, timeSec, mode?, vignette? })` seam, consumed inside `endFrame` when `coverage > 0.001`. **Citadel wired 2026-07-02** (art-03 P2): `cloudOptionsFor(season, day, dayFraction, timeSec)` in `citadel-renderer.ts` derives coverage from the season→weather cadence (overcast/rainy/winter → heavier) and picks the mode; cool `slate` shadows.
- [x] **fBm mist/fog sheet.** Realised as the **haze** mode of the same cloud pass (art-03 P2): `mode: "haze"` swaps the dark cool shadow blobs for a warm, very-low-alpha (≤0.12) `cream` veil (broader/softer thresholds, same fBm + `step()` quantization). Citadel triggers it in the dawn→mid-morning window for a cozy morning mist. Kept a param+branch on `cloud.wgsl` (not a fork) so Farm reuses it. A **soft radial vignette** (`vignette` param, NDC-space, 2-tier quantized) is folded into the same pass for cozy framing — available but Citadel currently leaves it off (`0`).

## Suggested first wave (if/when this becomes a brief)

1. GPU day/night wash (unblocks compositing for everything below)
2. Water cell-hash + noise UV-warp (biggest visible win, palette-safe by construction)
3. Weather parity fixes (round snow, streak taper, 8-point star)
4. Voronoi caustics on the shallow band
5. Cloud shadows
