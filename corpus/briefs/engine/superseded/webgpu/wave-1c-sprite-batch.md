# Wave 1c — Sprite Batch Pipeline + Shader

**Agents:** 1 (parallel, worktree-isolated). **Depends on:** Wave 0.

## Goal

Implement the instanced sprite pipeline `SpriteBatch` (`render/webgpu/sprite-batch.ts`) and
its shader (`render/webgpu/shaders/sprite.wgsl`): one draw call per atlas group, with tint
multiply, alpha, rotation, flipX, and z-lift, sampled nearest, premultiplied output.

## Files you own

- `packages/engine/src/render/webgpu/sprite-batch.ts` (fill stub).
- `packages/engine/src/render/webgpu/shaders/sprite.wgsl` (overwrite Wave-0 placeholder).

## Files you must NOT touch

Other `webgpu/*` modules, interface, factory, index. Read `gpu-context.ts` and
`texture-atlas.ts` for the layouts you bind against (do not edit them).

## Contract (from `01-architecture.md §3.3`)

`GpuSpriteInstance` (x,y,w,h,u0,v0,u1,v1,rotation,flipX,r,g,b,a). `SpriteBatch`:
`constructor(ctx, atlasBindGroupLayout)`, `begin()`, `add(inst)`, `flush(pass,
atlasBindGroup, atlasInstances)`.

## Shader (`sprite.wgsl`)

- **Vertex:** draw a unit quad (4 verts via `@builtin(vertex_index)` or a small vertex
  buffer). Per-instance inputs: center `(x, y)`, size `(w, h)`, rotation, flipX, UV rect,
  tint rgba. Build the corner in local space `(±0.5w, ±0.5h)`, apply flipX (`localX *= flip
  ? -1 : 1`), rotate by `rotation` (2×2 matrix), translate to `(x, y)`, then apply the view
  uniform (binding from `GpuContext.viewBindGroupLayout()` at group 0) to get clip space.
  Interpolate UVs across the quad from `(u0,v0)`..`(u1,v1)`.
- **Fragment:** sample the atlas texture (group 1 = texture+sampler, nearest) → `texColor`
  (straight alpha). Multiply rgb by tint rgb, multiply alpha by tint a. Output
  **premultiplied**: `return vec4(rgb * a, a)`. White tint (1,1,1,1) must be a visual no-op.
- **No color hex literals.** All colors arrive via the per-instance tint attribute.

## Pipeline

- Bind group layouts: group 0 = view uniform (from `GpuContext.viewBindGroupLayout()`),
  group 1 = atlas (the `atlasBindGroupLayout` passed in, from `GpuAtlasStore`).
- Blend state for premultiplied alpha:
  `color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }`,
  same for alpha. `topology: "triangle-list"` (or strip), `cullMode: "none"`.
- Instance buffer: a `GPUBuffer` (VERTEX usage, `MAP_WRITE`/`COPY_DST`) holding packed
  `GpuSpriteInstance` floats. Grow (recreate larger) when the batch exceeds capacity; never
  shrink mid-session. Pack with a `Float32Array` view; document the byte layout in a comment.
- `flush(pass, atlasBindGroup, atlasInstances)`: write `atlasInstances` into the buffer,
  set pipeline, set bind groups (0 view — note the view bind group is owned by GpuContext;
  accept it via `pass` already having it set, OR have the orchestrator set group 0 once per
  pass and you only set group 1 + instance buffer; **document which** — prefer: orchestrator
  sets group 0 once, batch sets group 1 + vertex/instance buffers + `draw(4, n)`).

## Notes / pitfalls

- **z-lift / sort:** the *orchestrator* (Wave 2) handles y-sort and converts each
  `Canvas2dSprite` to a `GpuSpriteInstance`, applying `y' = y - z` for the draw center and
  the pixel-snap rounding. Your `add()` just appends; do not sort here.
- **Tint parity:** Canvas2D multiplies RGB then re-masks alpha to avoid bleed into
  transparent padding. With nearest sampling and premultiplied output, multiplying straight
  texColor.rgb by tint then premultiplying by texColor.a (× tint.a) reproduces this without
  an offscreen — verify visually in Wave 3.
- Import WGSL: `import shaderSrc from "./shaders/sprite.wgsl?raw";` (ambient decl from Wave 0).
- No `any`.

## Acceptance & verify

- `npm run typecheck -w @engine/core` clean.
- WGSL self-review: vertex builds correct quad; fragment outputs premultiplied; no hex.

Commit: `webgpu(wave-1c): instanced sprite batch + sprite.wgsl`.
