# WebGL2 11 — `scene3d` GLSL + `SceneRenderer3D` on WebGL2 (the materials UBO)

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 3 · depends on: 10 · blocks: 09

## Goal

Finish the 3D half: port `shaders/scene3d.wgsl` (115 LOC) and `webgpu/renderer3d.ts` (267 LOC) to
`render3d/webgl2/`, so Hollow renders on every WebGL2 browser.

Port `MeshHandle`, `DrawCall3d`, `Frame3d`, `SceneRendererOptions`, and `SceneRenderer3D` with its
surface unchanged: `setMaterials(materials)`, `uploadMesh(mesh, materialIndexOf) → MeshHandle`,
`resize(w, h)`, `render(frame)`. Hollow's
[app.ts](../../../games/hollow/client/src/render3d/app.ts) calls exactly these, and it does one
subtle thing brief 10's audit flagged: it builds a **single combined material table** (world keys
then agent skin/hair/cloth keys, appended never interleaved, so world indices keep positions
`0..WORLD_MATERIAL_KEYS.length-1`) and makes **one** `setMaterials` call. Preserve that contract.

`drawIndexed(mesh.indexCount, instanceCount)` becomes
`gl.drawElementsInstanced(TRIANGLES, indexCount, UNSIGNED_SHORT|UNSIGNED_INT, 0, instanceCount)` —
check which index width `packMesh` produces before choosing. `instanceCount === 0` still skips.

## The one genuinely new design decision in this migration

`scene3d.wgsl` line ~27:

```wgsl
@group(1) @binding(0) var<storage, read> materials: array<MaterialEntry>;
```

**WebGL2 has no storage buffers.** This is the *only* WebGL2-incompatible feature in the entire
repo. Replace it with a **uniform block holding a fixed-size array**:

```glsl
layout(std140) uniform Materials { vec4 entries[MAX_MATERIALS]; };
```

- `FLOATS_PER_MATERIAL` is **4** (`buffers.ts`), i.e. one `vec4` per material — which is exactly the
  `std140` array stride, so the packed `Float32Array` from `packMaterials` uploads **unchanged**. No
  repacking, no padding. This is the reason a UBO is the right answer here rather than a texture.
- `MAX_MATERIALS` is a compile-time constant injected into the shader source (string-substitute
  before `compileProgram`, or `#define` prepended after the `#version` line — it must stay line 1).
  WebGL2 guarantees `MAX_UNIFORM_BLOCK_SIZE >= 16 KB` = 1,024 `vec4`s, far more than the table
  needs. Pick a round number (e.g. 256), and **`setMaterials` must throw a clear error if the table
  exceeds it** — a silent truncation would render agents in the wrong skin tone, which reads as a
  genetics bug in Hollow and would be debugged in entirely the wrong place.
- Query `MAX_UNIFORM_BLOCK_SIZE` at device creation and assert the chosen `MAX_MATERIALS` fits.
- Record this decision in the tracker; brief 13 folds it into the wiki. If the table ever needs to
  outgrow a UBO, the documented fallback is an `RGBA32F` lookup texture + `texelFetch`.

## Shader port notes
- The cozy look must survive intact: **flat shading (one tone per face by normal) + ambient
  occlusion + palette-snapped warm ramps + optional toon ramp** (`toonSteps`, cached per-program by
  brief 10's program cache). Flat shading in GLSL ES 3.00 uses the `flat` interpolation qualifier on
  the varying, *or* per-face normals baked by `packMesh` — check which `scene3d.wgsl` relies on
  before choosing, because guessing produces smooth Gouraud shading that looks *fine* and is wrong.
- `precision highp float;` in the fragment shader.
- Every colour comes from `HOLLOW_PAL.*` via uniforms / the material table. No literal in the GLSL
  (brief 02's lint enforces it). Note `SceneRendererOptions.clearColor` is already passed in as
  floats from `toFloatRgb(HOLLOW_PAL.navy)` — keep that path.
- **Winding + depth.** With `CULL_FACE` enabled (brief 10), a front-face winding mismatch renders
  the town inside-out. Verify `gl.frontFace` against what `geometry.ts` emits; and note WebGPU's
  depth range and GL's differ in convention — if the scene renders depth-inverted, that is where to
  look, not in `mat4.ts` (which is shared and must not change).

## Also in scope
- **Re-point `render3d/index.ts`** to the WebGL2 modules (it currently exports `Device3d`,
  `createDevice3d`, `PipelineCache`, `Pipeline3d`, `SceneRenderer3D`, `MeshHandle`, `DrawCall3d`,
  `Frame3d`, `SceneRendererOptions` from `./webgpu/*`). Keep every exported **name** identical so
  `@hollow/client` needs no import changes.
- **Reword Hollow's unavailable message.** `app.ts` ~205–223 currently says *"chrome://flags →
  Unsafe WebGPU, or Chrome 113+"* — obsolete and now actively misleading. It becomes a WebGL2
  message. Keep the graceful-degradation behaviour exactly (sim, chronicle, dashboard, research rail
  keep running; `onRendererUnavailable` fires; no unhandled rejection, no blank canvas).

## Out of scope
- Deleting `render3d/webgpu/` (brief 12).
- Any change to `mat4`/`camera3d`/`geometry`/`pick`. If you think one needs changing, stop and
  report — it almost certainly means a winding or depth-convention issue that belongs in this file.

## Acceptance
- `npm run typecheck` clean; `npm run test -w @engine/core` green — including `pick.test.ts`,
  `mat4.test.ts`, `camera3d.test.ts`, `geometry.test.ts` **unchanged**, which is the proof the shared
  math layer was not disturbed.
- A test that `setMaterials` throws above `MAX_MATERIALS` rather than truncating.
- **Visual proof, and this one is the whole point of the brief:** run Hollow, screenshot the cozy
  town — flat-shaded faces, AO, warm ramps, agents in gene-driven skin/hair/cloth colours, correct
  depth, nothing inside-out. Compare against a WebGPU screenshot side by side. Paths in the tracker.
- Hollow's no-WebGL2 path still shows a message with the sim running, and the message no longer
  mentions WebGPU or `chrome://flags`.
