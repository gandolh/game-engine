# Light overlay as a full-canvas upload

status: closed 2026-11-26. Done 2026-11-23 as brief 16 ([16](../../briefs/done/16-the-light-overlay-drawn-on-the-gpu.md)), promoted by the owner's call to
build light optimizations without waiting for a trigger. Its trigger was to promote it when a bench scene on a reference device shows Farm's light overlay, its canvas
paint plus the upload, above 1 ms at p95, or the GPU time dropping by more than 1 ms with the overlay off.
created: 2026-11-21
context: the 60 fps plan, [frame-budget.md](../../wiki/frame-budget.md); found by brief 05's texture counter.

Brief 05's profile counted Farm uploading 4,096,000 bytes of texture every frame at 1280×800: one
full-canvas RGBA image. `OverlayLightPass` (`engine/core/src/render/webgl2/overlay-light-pass.ts`) paints
the light overlay with the CPU 2D canvas API onto an offscreen canvas the size of the drawing buffer, then
`texImage2D`s the whole canvas every frame it draws. At 1080p with DPR capped at 2 that is about 8 MB a
frame, near 500 MB a second at 60 fps, plus the CPU raster.

SwiftShader can't say what it costs on a real GPU, so this waits for a number
([brief 07](../../briefs/done/07-the-real-gpu-baseline.md)).

If it is promoted, the usual answers are:

- draw the light pools as instanced quads with a radial falloff in a shader, as the other passes draw,
  and drop the 2D canvas;
- or keep the canvas and upload only when the light set or the camera changed, at a lower resolution.
