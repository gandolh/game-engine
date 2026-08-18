# WebGL2 08 — `WebGl2Renderer` assembly, single-backend `createRenderer`, delete Canvas2D

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 3 · depends on: 03, 04, 05, 06, 07 · blocks: 09

## Goal

Assemble the five ported passes into one `RendererLike` implementation, collapse
`createRenderer` to a single backend, and delete the Canvas2D renderer.

`engine/core/src/render/webgl2/renderer.ts` — the mirror of `webgpu/renderer.ts` (589 LOC). Almost
all of that file is **backend-neutral CPU logic** that ports verbatim; the GPU-specific part is the
last ~110 lines. Port, do not redesign:

- `push(sprite)` into a reused `_queue` (`length = _queueLen`, never reallocated), `_shadowQueue`,
  `_uiQueue`; `begin*`/`end*` lifecycle; `addAtlas`/`setAtlas`/`getAtlas`.
- `endFrame`'s camera math: `sx`/`sy`, `left`/`top`, `ox`/`oy` with `pixelSnap` rounding, and the
  **two** view records — the clip-space `view` for GL passes (`scaleY` negative,
  `scaleX: sx * 2 / canvasW`, `offsetX: ox * 2 / canvasW - 1`, `offsetY: 1 - oy * 2 / canvasH`) and
  the positive-scale `overlayView` for the 2D overlay. **They are different on purpose.**
- `timeSec` = `performance.now() / 1000` and `windStrength` = `1.0 + 0.15 * sin(t * 0.37)`.
- `_queue.sort(compareSprite)` then the **per-atlas group coalescing** loop (consecutive
  same-atlas sprites become one draw group), `_packSprite`, the `_occludableIdx` +
  `_ghostCovered` ghost-redraw pass (occluded sprites redrawn as ghosts, coalesced the same way).
- `visRect` computation and the `zoomedOut = sx < 1` flag.
- Shadows: colour from `EDG.black` via `hexToRgbaFloats`, alpha per shadow.
- `_deviceLost` early-out → becomes the context-lost guard from brief 02's `isLost()`.
- `clearColor`, `pixelSnap`, `useGpuEffects`, `profileUi`/`lastUiFlush`, `bakeStaticLayer`,
  `bakeWaterPattern`, `setWaterScroll`, `setWaterSwell`, `setWaterDepthMask`, `clearStaticLayer`.

**Draw order is load-bearing and must be identical:**
`water → static → shadows → sprite groups (per atlas) → [GPU particles → GPU weather] → cloud →
tint(wash)`, then `Overlay2D`: CPU particles/weather (when `!useGpuEffects` or a non-`RainField`
`WeatherLike`) → **UI quads last, in screen transform**. Getting this wrong produces a plausible
picture with the wash under the clouds or UI beneath the world.

WebGPU records into a `GPURenderPassEncoder` and submits a command buffer; WebGL2 issues immediate
calls against the default framebuffer. So `beginPass`/`pass.end()`/`queue.submit` collapse into a
`gl.clear` + ordered draws. That is the entire structural difference.

## `createRenderer` — one backend

Rewrite [../../engine/core/src/render/create-renderer.ts](../../../engine/core/src/render/create-renderer.ts).
It currently has a `backend` option (`"auto" | "webgpu" | "canvas2d"`) and a try/fallback ladder.
With one backend that machinery is gone:
- `createRenderer(canvas, camera, opts?)` → `Promise<RendererLike>`, always `WebGl2Renderer`.
- **Keep `onBackend`** (all four clients log through it) but narrow its type to `"webgl2"`.
- **Remove `backend` from `CreateRendererOptions`.** Do not keep it as a no-op — a dead option that
  silently ignores `"webgpu"` is worse than a compile error that points at the call site. The four
  call sites are updated in brief 09; expect `typecheck` to fail at them until then, and say so in
  your handoff notes rather than "fixing" it by keeping the option.
- On failure, throw — do not fall back to anything. Brief 09 catches it for the user-facing screen.

## Deletions (this brief)
- `engine/core/src/render/canvas2d/renderer.ts`
- `engine/core/src/render/canvas2d/index.ts`
- `engine/core/src/render/canvas2d.test.ts`
- `engine/core/src/render/canvas2d/draw.test.ts` → **relocate** its cases to cover `raster2d.ts`
  (brief 01 moved the functions; the CPU rasterizer is still live and still needs its tests).
- The `canvas2d/` directory should be **empty** afterwards. If anything remains, it was
  misclassified in brief 01 — report it, do not leave a one-file directory.
- `render/index.ts`: drop `Canvas2dRenderer` and `Canvas2dSprite` exports; export `WebGl2Renderer`.

## The `RendererLike` interface changes (deferred here from briefs 05 and 07)

You own `engine/core/src/render/renderer.ts` and `render/index.ts` this migration. Two parity
asymmetries were deliberately held back to this brief, because both become safe only once
`Canvas2dRenderer` is deleted (making either required earlier would break the workspace typecheck):

1. **`setCloudOptions` becomes required.** Drop the `?` and rewrite its doc comment, which currently
   names Canvas2D as the reason for optionality. Then update the three guarded call sites:
   delete Farm's `RendererWithCloudOptions` interface + `hasCloudOptions` type-guard
   (`games/farm/client/src/main/render-loop.ts` ~55–58) and call the method directly; simplify
   Citadel's `renderer.setCloudOptions?.(…)` at `main/render-loop.ts` ~581 and
   `render/showcase.ts` ~340 to plain calls.
   Verify with: `grep -rn 'setCloudOptions?\.\|hasCloudOptions\|RendererWithCloudOptions' games engine`
   → nothing.
2. **`OverlayFn` becomes a documented, honoured parameter.** Brief 05 implemented the behaviour
   (offscreen 2D bake → additive full-screen quad, drawn after sprites and before the wash). Your job
   is the *type + docs*: it is no longer "Canvas2D honours it, WebGPU ignores it". Note in the comment
   that Farm's night lighting (`makeLightOverlay`) is its live consumer and **was silently dead on
   WebGPU** — so nobody re-introduces the no-op.

Also: `DecorateFn` is passed to `bakeStaticLayer` and is honoured on both backends today — leave it
alone.

## Out of scope
- The client call sites for `createRenderer` and the unsupported-browser screen (brief 09). Note the
  `setCloudOptions` call-site cleanup above IS yours — it is an interface consequence, not a backend switch.
- Deleting `webgpu/` (brief 12) — it stays compiling as the reference until 09 proves WebGL2 works
  in a real browser. **This is deliberate: do not delete the thing you are still comparing against.**
- Any 3D work (10, 11).

## Acceptance
- `npm run test -w @engine/core` green. Port `webgpu/renderer.test.ts` (187 LOC) to the new
  renderer — it already encodes the instance layout and draw-call expectations.
- A test asserting **draw order** explicitly (a mock GL recording the call sequence), because order
  is the defect class most likely to survive every other test.
- `ls engine/core/src/render/canvas2d/` is empty or the directory is gone.
- `grep -rn 'Canvas2dRenderer' engine games tools --include=*.ts` returns nothing.
- Workspace `typecheck` will fail **only** at the four `backend: "webgpu"` call sites. List them in
  your handoff notes for brief 09. Any other typecheck failure is yours to fix.
