# WebGL2 10 — render3d: GL device, buffer packing, pipeline cache

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 2 · depends on: 02 · blocks: 11

## Goal

The 3D half of the migration, foundation layer. Hollow renders true 3D through
`engine/core/src/render3d/`, and today its GPU layer is WebGPU-only — which is why Hollow shows a
"renderer unavailable" message instead of a town on Firefox-Linux.

**The good news, established by the feasibility audit:** the entire 3D *math* layer is already
backend-agnostic and is not touched by this brief or the next — `mat4.ts` (194), `camera3d.ts` (118),
`geometry.ts` (252), `pick.ts` (110), plus their four test files. Only `render3d/webgpu/` (674 LOC
across 4 files, 1 WGSL) needs a sibling.

## Scope

**1. Relocate the pure packing helpers out of the backend directory** (same move brief 01 makes for
2D). `webgpu/buffers.ts` (201 LOC) is almost entirely **CPU float packing with no GPU calls**:
`FLOATS_PER_VERTEX` (4), `FLOATS_PER_INSTANCE` (20), `FLOATS_PER_MATERIAL` (4),
`materialIndexMap`, `packMesh`, `packInstance`, `packInstances`, `packMaterials`,
`instanceAABB`, and the `Material` / `InstanceInput` types. Move all of it to
**`render3d/buffers.ts`** and move `buffers.test.ts` (138 LOC) with it. Verify each symbol really is
GPU-free before moving it; anything that touches a `GPUBuffer` stays behind for step 2.
`instanceAABB` is used by picking, so this also removes a `render3d/pick` → `webgpu/` dependency.

**2. `render3d/webgl2/device3d.ts`** — sibling of `webgpu/device3d.ts` (82 LOC).
`createDevice3d(canvas)` currently: checks `navigator.gpu`, throws
`"render3d: navigator.gpu unavailable (WebGPU not supported in this browser)"`, requests an adapter,
requests a device, reads `getPreferredCanvasFormat()`. The WebGL2 version reuses brief 02's
`createGlContext` and — unlike the 2D path — **needs a depth buffer** (`depth: true`) and
`gl.enable(gl.DEPTH_TEST)` + `gl.enable(gl.CULL_FACE)`, since real 3D depends on both. Keep the
throw catchable and clearly identifiable: Hollow's
[app.ts](../../games/hollow/client/src/render3d/app.ts) ~205–223 already catches it and turns it into
an on-screen message, and that path must keep working (brief 11 rewords the message).

**3. `render3d/webgl2/pipeline-cache.ts`** — sibling of `webgpu/pipeline-cache.ts` (124 LOC).
Today: `getOrCreate(format, toonSteps = DEFAULT_TOON_STEPS) → Pipeline3d`, keyed by canvas format +
toon step count. WebGL2 has no pipeline objects, so this becomes a **program cache** keyed by
`toonSteps` (the format key is meaningless without `GPUTextureFormat` — drop it, don't fake it),
holding the compiled program plus its cached uniform locations and its VAO layout. Keep the
`getOrCreate` shape and the `Pipeline3d` type name so `SceneRenderer3D` (brief 11) reads familiarly.

**4. GL buffer creation** — whatever `webgpu/buffers.ts` retains after step 1 (`GPUBufferUsage.VERTEX`
/ `INDEX` / `UNIFORM` allocations) gets a WebGL2 equivalent in `webgl2/`: `ARRAY_BUFFER`,
`ELEMENT_ARRAY_BUFFER`, `UNIFORM_BUFFER`. **Do not port the `STORAGE` buffer here** — that is the
materials table and brief 11 owns its UBO redesign.

## Out of scope
- `scene3d.wgsl` → GLSL, `SceneRenderer3D`, `MeshHandle`, the materials UBO — **all brief 11**.
- Any change to `mat4`/`camera3d`/`geometry`/`pick` behaviour. Import-path updates only.
- `render3d/index.ts`'s barrel re-pointing (brief 11 does it once, after both halves exist), except
  for the `buffers.ts` move in step 1, which must keep the barrel compiling.

## Acceptance
- `npm run typecheck` clean across the workspace (`@hollow/client` imports this barrel).
- `npm run test -w @engine/core` green, with `buffers.test.ts` passing **unchanged in intent** at its
  new location — it is the proof the packing move was behaviour-neutral.
- `createGlDevice3d` unit-tested against a mock GL for both the success path and the
  no-context throw.
- `grep -rn 'from "./webgpu/buffers"' engine/core/src/render3d` returns nothing.
- The existing WebGPU 3D path still compiles and its tests still pass — nothing is deleted until 12.
