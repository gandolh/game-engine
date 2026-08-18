# WebGL2 03 — atlas store + sprite batch + shadow batch (the core quad path)

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-08-18
design-of-record: [2026-08-18-webgl2-00-BUILD-ORDER.md](2026-08-18-webgl2-00-BUILD-ORDER.md) · tracker: [2026-08-18-webgl2-BUILD-STATE.md](2026-08-18-webgl2-BUILD-STATE.md)
wave: 2 · depends on: 01, 02 · blocks: 08

## Goal

Port the three modules that draw **every sprite in every game** to WebGL2. This is the highest-risk
brief in wave 2 — if it is wrong, all four games render nothing. It is also the most mechanical,
because the WGSL already documents the exact conventions to preserve.

Port these, into `engine/core/src/render/webgl2/`:

| From (WebGPU) | To (WebGL2) | LOC |
|---|---|---|
| `webgpu/texture-atlas.ts` (`GpuAtlasStore`) | `webgl2/gl-atlas-store.ts` | 138 |
| `webgpu/sprite-batch.ts` (`SpriteBatch`) + `shaders/sprite.wgsl` | `webgl2/sprite-batch.ts` + `shaders/sprite.{vert,frag}.glsl` | 202 + 163 |
| `webgpu/shadow-batch.ts` (`ShadowBatch`, inline WGSL) | `webgl2/shadow-batch.ts` + `shaders/shadow.{vert,frag}.glsl` | 220 |

## Conventions that must survive exactly (copy them, do not re-derive)

- **The view transform.** `sprite.wgsl` / `shadow-batch.ts` document the canonical convention
  shared by every pass: `clipX = worldX * scale_x + offset_x`, `clipY = worldY * scale_y + offset_y`,
  where **`scale_y` is already negative — there is no extra negation**. GLSL ES 3.00 uses the same
  clip space as WGSL (y-up NDC), so the arithmetic ports verbatim. The one real difference is
  **texture coordinate origin**: WebGPU samples with v=0 at the *top* of the image, WebGL with v=0
  at the *bottom*. Pick **one** fix — either flip v when building UVs in `gl-atlas-store.uv()`, or
  set `UNPACK_FLIP_Y_WEBGL` on upload — and write a comment saying which, because doing both
  silently cancels out and doing neither renders every sprite upside down.
- **Instance layout.** `SpriteBatch` packs `FLOATS_PER_INSTANCE = 16` (x,y,w,h · u0,v0,u1,v1 ·
  rotation,flipX · r,g,b,a · swayPhase,swayAmp), `ShadowBatch` packs 8 (pos_radii vec4 + colour
  vec4). Keep both layouts and both float counts identical — brief 08's `_packSprite` writes into
  them and the existing `renderer.test.ts` assertions encode them.
- **Instancing.** `draw(6, instanceCount)` with a triangle-list (two tris per quad) becomes
  `gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instanceCount)`, with the per-instance attributes set
  up via `vertexAttribDivisor(loc, 1)` (use the VAO helper from brief 02). `gl_InstanceID` replaces
  `@builtin(instance_index)` where the shader needs it. Both are core WebGL2 — no extension.
- **The batch API stays byte-identical**: `begin()`, `add(inst) → number`, `upload()`,
  `drawRange(target, atlasBinding, first, count)`, `.count`. Brief 08 assembles against this exact
  surface. Where WebGPU takes a `GPURenderPassEncoder` + `GPUBindGroup`, take the GL context +
  a texture handle instead — that is the *only* signature change permitted.
- **Growable instance buffer.** `INITIAL_CAPACITY` 512 (sprites) / 64 (shadows), doubling on
  overflow, reusing the staging `Float32Array`. Keep it: it is why the render loop does not allocate
  per frame. Use `gl.bufferData(..., DYNAMIC_DRAW)` on grow and `gl.bufferSubData` per frame.
- **Nearest-neighbour, always.** `TEXTURE_MIN_FILTER`/`MAG_FILTER` = `NEAREST`, wrap =
  `CLAMP_TO_EDGE`, no mipmaps. This is a pixel-art engine; a linear filter anywhere is a bug.
- **Premultiplied-alpha blending** matching the WebGPU pipeline's blend state. Read the actual
  `createRenderPipeline` blend descriptor in `sprite-batch.ts` and translate it literally
  (`gl.blendFuncSeparate` + `gl.blendEquation`), rather than assuming `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`.
  Getting this wrong produces dark fringes on every pixel-art edge — subtle enough to ship by
  accident and obvious once someone looks at a screenshot.
- **Atlas sheets.** `GpuAtlasStore` keys sheets by atlas id and exposes `uv(atlasId, frame)` →
  `{u0,v0,u1,v1,layer}` plus a per-atlas binding. Keep the `AtlasUV` shape (including `layer`).
  One `TEXTURE_2D` per sheet is the simplest port and matches today's one-bind-group-per-atlas
  model; only reach for `TEXTURE_2D_ARRAY` if `layer` is genuinely used for array indexing — check
  before deciding, and record the choice in the tracker.
- `assertTextureWithinLimits` (in `static-layer-pass.ts`, brief 04's file) has a WebGL2 analogue:
  `MAX_TEXTURE_SIZE`. 04 owns it; do not duplicate.

## Out of scope
- The static layer, water, particles, weather, cloud, tint (04–07).
- `WebGl2Renderer` itself, sprite sorting, atlas grouping, ghost/occluder logic — all brief 08.
  This brief delivers batches that a renderer drives, not a renderer.

## Acceptance
- `npm run typecheck` clean; `npm run test -w @engine/core` green.
- Unit tests against a **mock GL object** (pattern: `webgpu/renderer.test.ts`'s fake device), asserting:
  instance floats land at the documented offsets; `begin()` resets `count`; capacity doubling
  preserves already-added instances; `drawRange` issues `drawArraysInstanced` with
  `(TRIANGLES, 0, 6, count)` and the right first-instance offset.
- **A visual proof, not just green tests.** Add a tiny throwaway page or a `?backend` harness that
  draws a handful of atlas frames + one shadow ellipse through the new batches, screenshot it, and
  put the screenshot path in the tracker. Standing project rule: green subagent tests have twice
  hidden inert features. A sprite batch that compiles but draws nothing passes every mock test.
- Nothing under `webgpu/` or `canvas2d/` modified.
