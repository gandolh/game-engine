# WebGL2 07 — fBm cloud shadow / warm haze / vignette

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 2 · depends on: 01, 02 · blocks: 08

## Goal

Port `webgpu/cloud-shadow-pass.ts` (140 LOC) + `shaders/cloud.wgsl` (210 LOC) to
`webgl2/cloud-shadow-pass.ts` + `shaders/cloud.{vert,frag}.glsl`.

One full-screen pass, one `draw(target, opts: CloudOptions)` method, driven by `setCloudOptions`.
It does fBm noise → quantized blobs, in two polarities:
- **`mode: "shadow"`** (default) — dark cloud-shadow blobs, premultiplied source-over darkening.
- **`mode: "haze"`** — a low-alpha warm veil that *lifts* toward `color` (cozy morning mist):
  same fBm and same quantization, opposite polarity.
Plus an optional **`vignette`** [0..1] folded into the same pass so it costs no extra draw, and
**quantization to keep the pixel-art read** — the whole point of the effect is that it does *not*
look like a smooth gradient. A "correct" port that loses the quantization steps is a failed port.

## This brief has a second, non-mechanical job

`setCloudOptions` is **optional on `RendererLike`** — it exists only on the WebGPU backend, and
`renderer.ts`'s doc comment says so explicitly ("Canvas2D omits it, so callers should invoke it via
optional-call"). Its three call sites all guard: `renderer.setCloudOptions?.(…)` in Citadel's
[render-loop.ts](../../games/citadel/client/src/main/render-loop.ts) ~581 and
[showcase.ts](../../games/citadel/client/src/render/showcase.ts) ~340, and Farm's
`hasCloudOptions` type-guard in
[farm/client/src/main/render-loop.ts](../../games/farm/client/src/main/render-loop.ts) ~55–58.

With one universal backend the optionality is dead weight. **Make it required:**
- `setCloudOptions(opts: CloudOptions): void` — drop the `?` in `RendererLike`, and rewrite the doc
  comment (it currently names Canvas2D as the reason for optionality).
- Delete Farm's `RendererWithCloudOptions` interface + `hasCloudOptions` type-guard and call the
  method directly.
- Simplify Citadel's two `?.()` calls to plain calls.

This is the first of the two parity asymmetries the migration exists to kill (the other is
`OverlayFn`, brief 05). Because it edits three game files, **coordinate at the wave gate**: if
another wave-2 brief is touching the same Citadel render-loop lines, the controller sequences them.

## Notes
- Colour arrives as `CloudOptions.color` (a palette hex) and is resolved through `rgbOf` — keep it.
  No literal in the GLSL (brief 02's lint enforces it).
- `coverage <= 0.001` skips the draw entirely, and `_cloudOpts` is **consumed each frame** (reset to
  `undefined` after use, so callers must re-set per frame to keep it on). Preserve both — the reset
  is the documented contract in `RendererLike`.
- fBm needs `fract`/`floor`/`mix` and integer hashing. GLSL ES 3.00 has real integer ops and
  bit operators, so a WGSL hash ports directly — but **verify the output visually**, because
  float precision differences between a `highp` GLSL fragment shader and WGSL's f32 will shift noise
  patterns subtly. Matching *exactly* is not required; looking right is.
- `mediump` is not enough for fBm — declare `precision highp float;` in the fragment shader.

## Out of scope
- Particles/weather (06). Cloud is a screen-space overlay, not a particle system.
- The day/night wash (`TintPass`, brief 05) — a different pass drawn after this one.

## Acceptance
- `npm run typecheck` clean; `npm run test -w @engine/core` green, including a port of
  `webgpu/cloud-shadow-pass.test.ts` (57 LOC).
- `grep -rn 'setCloudOptions?\.\|hasCloudOptions\|RendererWithCloudOptions' games engine` returns
  **nothing**, and `RendererLike.setCloudOptions` has no `?`.
- `npm run typecheck` proves the three game call sites still compile as non-optional calls.
- **Visual proof:** screenshots of `mode: "shadow"` and `mode: "haze"`, one with `vignette > 0`, and
  a side-by-side against the current WebGPU output. The quantization steps must be visibly present
  in both. Paths in the tracker.
- Nothing under `webgpu/` or `canvas2d/` modified.
