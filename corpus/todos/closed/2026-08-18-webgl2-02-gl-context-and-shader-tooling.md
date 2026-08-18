# WebGL2 02 — GL context, capability probe, and shader tooling

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 1 · blocks: 03, 04, 05, 06, 07, 10

## Goal

The foundation every pass brief builds on: one module that owns the `WebGL2RenderingContext`, DPR
sizing, context-loss handling, and program compilation — plus the build/test plumbing for `.glsl`
files. **No rendering passes here.** This is the sibling of
[../../engine/core/src/render/webgpu/gpu-context.ts](../../engine/core/src/render/webgl2/gl-context.ts)
(147 LOC); read that file first and mirror its shape and responsibilities so briefs 03–07 find a
familiar surface.

## Scope

**`engine/core/src/render/webgl2/gl-context.ts`**
- `createGlContext(canvas): GlContext` — `canvas.getContext("webgl2", {…})` with explicit attrs:
  `alpha: false`, `antialias: false` (pixel art — never smooth), `depth`/`stencil` per what the
  passes actually need (start `depth: false`; sprite ordering is CPU-sorted today via
  `compareSprite`, not depth-tested — do not silently introduce a depth buffer),
  `premultipliedAlpha: true`, `preserveDrawingBuffer: false`, `powerPreference: "high-performance"`.
- Throw a clear, greppable error when the context is null:
  `"webgl2: context unavailable"`. Match `gpu-context.ts`'s message style — brief 09 turns this
  into the user-facing screen, so the throw must be catchable and identifiable.
- **DPR + resize.** Port whatever `gpu-context.ts` does for device-pixel-ratio and canvas sizing
  exactly. Non-negotiable invariant, stated in `RendererLike`: *callers always author in CSS
  pixels; the backend scales by DPR internally.* Get this wrong and every UI quad in three games
  lands in the wrong place.
- **Context loss/restore** — this is new work with no WebGPU analogue and it matters, because
  WebGL2 contexts are lost routinely (tab backgrounding, GPU reset, driver hiccup). Register
  `webglcontextlost` (`preventDefault()`) and `webglcontextrestored`. Expose an
  `onContextLost` / `onContextRestored` hook and an `isLost()` guard so `endFrame` can no-op
  instead of throwing a wall of GL errors. Full resource re-creation on restore is **out of scope**
  — define the seam, document the gap in the tracker, and make loss degrade quietly.
- `dispose()` — release the context (`WEBGL_lose_context` where available) and detach listeners.

**`engine/core/src/render/webgl2/program.ts`**
- `compileProgram(gl, vertSrc, fragSrc, label): WebGLProgram` — compile, link, and on failure throw
  with `getShaderInfoLog`/`getProgramInfoLog` **plus the shader source with line numbers**. Every
  pass brief will hit a GLSL compile error; make that error readable once, here, rather than five
  times badly.
- `uniformLocations(gl, program, names)` — cache locations once at construction. Never call
  `getUniformLocation` per frame.
- Small helpers for the repeated VAO + instanced-attribute setup the quad passes all need
  (`vertexAttribPointer` + `vertexAttribDivisor`), so 03/06 don't each reinvent it.

**Shader file plumbing**
- `engine/core/src/render/webgl2/glsl.d.ts` — ambient decl for `*.glsl?raw`, mirroring the existing
  `wgsl.d.ts` (4 LOC). Note: the same ambient decl is duplicated in `tools/{run-sim,world-preview,
  hollow-sim}/src/wgsl.d.ts` because those tools import the `@engine/core` barrel; **brief 12**
  handles those — do not touch tools here, but do confirm the pattern so 12 knows what to mirror.
- All shaders are **GLSL ES 3.00** (`#version 300 es` on line 1 — must be the very first line, no
  leading blank). Author `.vert.glsl` / `.frag.glsl` pairs under `webgl2/shaders/`.
- **`webgl2/shaders/glsl-lint.test.ts`** — the replacement for the two `wgsl-lint.test.ts` guards
  (see `render/webgpu/shaders/wgsl-lint.test.ts` and `render3d/webgpu/shaders/wgsl-lint.test.ts`).
  Same spirit: glob `**/*.glsl` from the test's own directory and assert, per file:
  - line 1 is exactly `#version 300 es`;
  - a fragment shader declares a precision qualifier (`precision mediump float;` or `highp`) —
    the single most common "works in Chrome, black screen in Firefox" bug;
  - no GLSL ES 3.00 reserved word is used as a declared identifier (port the `RESERVED` set idea);
  - **no raw hex/RGB colour literal** — enforce the palette rule *inside shaders*. Colours arrive
    as uniforms. This is the shader-side arm of the palette guard test and it is the reason this
    lint is a hard gate, not a nicety.
  `wgsl_reflect` has no GLSL equivalent, so this is a regex/structural lint, not a real parse.
  Say so in a header comment — an honest lint beats a lint that pretends to be a compiler.

## Design notes
- **`getContext("2d")` is not affected by anything here.** The CPU rasterizer (`raster2d.ts` after
  brief 01) keeps baking textures. This brief adds a *GL* context alongside it.
- Do not add a WebGL1 path. WebGL2 is the floor (~98%); a third tier defeats the whole point of
  collapsing to one backend.
- Keep this module free of any game concept. `@engine/core` never imports a game.

## Out of scope
- Any draw call, pass, or shader that renders game content (03–07, 10, 11).
- Full resource re-creation after context loss (seam only — document it).
- Touching `create-renderer.ts` (brief 08 rewrites it).

## Acceptance
- `npm run typecheck` clean.
- `npm run test -w @engine/core` green — including the new `glsl-lint.test.ts`. It must have at
  least one shader to scan, so land a trivial `webgl2/shaders/blit.{vert,frag}.glsl` (a passthrough
  textured quad) and prove the lint catches: a missing `#version` line, a missing precision
  qualifier, and a hardcoded hex colour. **Assert the failures, don't just assert the happy path** —
  a lint nobody has seen fail is not known to work.
- `compileProgram` is unit-tested against a **mock GL object** (same stub pattern as
  `webgpu/renderer.test.ts`'s fake adapter — no real context in the `node` env), covering the
  success path and the throw-with-source-and-log path.
- Nothing in `engine/core/src/render/webgpu/` or `canvas2d/` is modified by this brief.
