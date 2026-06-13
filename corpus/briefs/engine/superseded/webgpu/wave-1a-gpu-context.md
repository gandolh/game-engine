# Wave 1a — GPU Context & View Uniform

**Agents:** 1 (parallel with 1b–1e, worktree-isolated). **Depends on:** Wave 0.

## Goal

Implement `GpuContext` (`render/webgpu/gpu-context.ts`): device/adapter bootstrap, canvas
configuration, the per-frame world→clip view uniform, and render-pass creation. This is
the foundation every other GPU module builds on.

## Files you own

- `packages/engine/src/render/webgpu/gpu-context.ts` (fill the Wave-0 stub).

## Files you must NOT touch

Any other `webgpu/*` module, the interface, the factory, `index.ts`. You may *read* them.

## Contract (from `01-architecture.md §3.1`)

Implement `GpuContext` with: `static create(canvas)`, `device`, `queue`, `format`,
`context`, `resize(w,h)`, `setView(view)`, `viewBindGroupLayout()`, `viewBindGroup()`,
`beginPass(encoder, clear)`.

## Implementation steps

1. `static async create(canvas)`:
   - `if (!navigator.gpu) throw new Error("webgpu: navigator.gpu unavailable")`.
   - `adapter = await navigator.gpu.requestAdapter()`; throw if null.
   - `device = await adapter.requestDevice()`. Attach `device.lost.then(...)` to log loss.
   - `context = canvas.getContext("webgpu")`; `format = navigator.gpu.getPreferredCanvasFormat()`.
   - `context.configure({ device, format, alphaMode: "premultiplied" })`.
2. **View uniform:** a `GPUBuffer` (uniform, ~32 bytes) holding the world→clip transform.
   Provide a small UBO struct, e.g. `vec4(scaleX, scaleY, offsetX, offsetY)` where the
   shader computes `clip = vec2(pos.x*scaleX + offsetX, pos.y*scaleY + offsetY)` with the
   Y term arranged so screen-down maps to clip-down (Y flip). Derive these from
   `ViewUniform` (the caller passes already-resolved values; see below). Create one bind
   group layout (binding 0 = uniform, visibility VERTEX) and a cached bind group.
3. `setView(view)`: `queue.writeBuffer` the uniform from `view`. Recompute the bind group
   only if the buffer was recreated (it shouldn't be).
4. `resize(width, height)`: set `canvas.width/height` if changed. (Re-`configure` is not
   required on resize for the canvas context in current WebGPU, but the depth/MSAA targets,
   if any, must be recreated — we use none in v1, so just resize the canvas.)
5. `beginPass(encoder, clear)`: get `context.getCurrentTexture().createView()`, return
   `encoder.beginRenderPass({ colorAttachments: [{ view, clearValue: {r,g,b,a}, loadOp:
   "clear", storeOp: "store" }] })`.

### View math (must match Canvas2D exactly)

The **caller** (Wave 2 orchestrator) computes the `ViewUniform` from the camera and
pixel-snap, mirroring `Canvas2dRenderer.endFrame`:
```
sx = W / camera.worldUnitsX;  sy = H / camera.worldUnitsY;
left = camera.centerX - camera.worldUnitsX/2;  top = camera.centerY - camera.worldUnitsY/2;
ox = pixelSnap ? Math.round(-left*sx) : -left*sx;
oy = pixelSnap ? Math.round(-top*sy)  : -top*sy;
// world (wx,wy) -> pixel (px,py): px = wx*sx + ox;  py = wy*sy + oy
// pixel -> clip: clipX = px/W*2 - 1;  clipY = 1 - py/H*2
```
So `GpuContext.setView` should accept `ViewUniform = { scaleX, scaleY, offsetX, offsetY }`
already collapsed to clip space, OR accept `{sx,sy,ox,oy,W,H}` and collapse inside. Pick
one and document it in a doc-comment; Wave 2 will adapt. Keep per-instance vertex math in
the shader minimal — the heavy lifting is the uniform.

## Notes / pitfalls

- `navigator`, `GPUDevice`, etc. are browser globals; `@webgpu/types` (Wave 0) supplies
  the TS types. Do not import anything DOM-incompatible into a module that jsdom tests
  load — this module is only reached via the dynamic-import factory branch, so it is safe.
- No `any`. If a WebGPU type is awkward, narrow it with a comment, don't `any` it.
- You cannot run WebGPU under jsdom or (likely) headless Linux. Verification for this wave
  is **typecheck only** + a self-review against the spec. The browser smoke test happens
  in Wave 3.

## Acceptance & verify

- `npm run typecheck -w @engine/core` clean.
- No new exports leak into the Canvas2D/test bundle (this file is only imported by
  `webgpu/renderer.ts`, which is dynamically imported).

Commit: `webgpu(wave-1a): GpuContext device/canvas/view-uniform`.
