# hollow-08 — engine WebGPU 3D renderer + primitive-mesh promotion

status: todo
milestone: M2
depends-on: M1 exit bar cleared (hollow-07)
created: 2026-07-17

## Goal
Add a **generic, game-agnostic true-3D WebGPU renderer** to `@engine/core`, plus a promoted
primitive→mesh module, so Hollow (and future games) can draw flat-shaded low-poly cozy scenes.
The engine names no game; Hollow's scene assembly is hollow-09.

## Scope
### Primitive → mesh module (promote from Citadel)
- Lift Citadel's parametric primitive generators (`render/sprites/mesh/{geometry,materials}`:
  box / cylinder / cone / pyramid / gable + transform + merge → indexed triangle mesh with
  per-face material) into a generic `@engine/core` mesh module. Citadel's software rasterizer
  stays in Citadel (it bakes to sprites); the engine gains the **mesh data model** only.
- Keep the "assets are code" ethos: meshes are built in code from primitives, deterministically.

### WebGPU 3D render layer
- Device/adapter acquisition + a **pipeline/shader cache** (keep `GPUDevice` + pipelines in a
  small render context, per the researched best practice).
- Vertex+fragment pipeline with a real **depth (z) buffer**; indexed draw.
- **Bind-group scheme** grouped by update frequency: group 0 = per-frame (view/projection,
  time, light dir, day/night factor); group 1 = per-material; group 2/instance = per-object
  model transform + tint. Support instanced draws for repeated meshes (many agents/props).
- **Cozy shading** in the fragment shader: **flat shade by face normal** onto a warm 3-step
  ramp (matches Citadel's flat-by-normal look), + **ambient occlusion** (baked vertex AO or a
  cheap SSAO-lite — pick the cheaper that reads well), + committed upper-left sun, soft
  contact shadows. Optional toon ramp knob. All colors from palette roles (Hollow palette
  passed in by the game; engine ships no palette).
- **Perspective camera** util: view/projection matrices, orbit + pan + zoom controller, and a
  **ray-pick** helper (screen → world ray → nearest mesh instance) for click-inspect.
- WGSL shaders live beside the renderer; ensure the library-packaging postbuild copies `.wgsl`
  (already handled for Citadel — verify it covers the new files).

## Approach / notes
- This is the first true-3D path in the repo (the old WebGPU renderer was deleted; Citadel's
  WebGPU use is 2D sprite-batch). Design it standalone; do not entangle with the Canvas2D or
  sprite-batch code.
- Keep it renderable headlessly-testable where possible (mesh construction + matrix math are
  pure and unit-testable; the GPU pass needs a real browser — WebGPU cannot render headless in
  this environment, per the Citadel finding, so gate visual checks on system Chrome with
  `--enable-unsafe-webgpu`).
- Instancing + a bounded agent/prop count (30–60 agents) keeps this well within perf budget.

## Acceptance / gates
- `@engine/core` exposes the mesh module + 3D renderer via a subpath export; **names no game**
  (grep for game nouns → none).
- Pure parts unit-tested headless: primitive mesh vertex/index counts + normals, merge,
  transform, camera matrices, ray-pick intersection.
- A tiny engine example/harness draws a lit, flat-shaded, AO'd primitive scene in a real
  browser (screenshot-verified on system Chrome).
- Citadel + Farm untouched and green (`typecheck` + their tests) — this is additive to the
  engine.
- `.wgsl` shaders ship correctly through the pack/postbuild path (extend the fixture if needed).
