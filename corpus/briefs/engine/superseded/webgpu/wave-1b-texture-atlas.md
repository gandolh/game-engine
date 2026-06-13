# Wave 1b — GPU Texture Atlas Store

**Agents:** 1 (parallel, worktree-isolated). **Depends on:** Wave 0.

## Goal

Implement `GpuAtlasStore` (`render/webgpu/texture-atlas.ts`): upload atlas `ImageBitmap`s
to GPU textures, expose per-frame UV rects, and provide texture+sampler bind groups. Keep
the original `LoadedAtlasImage` in CPU memory so `getAtlas()` still works for UI icon code.

## Files you own

- `packages/engine/src/render/webgpu/texture-atlas.ts` (fill the Wave-0 stub).

## Files you must NOT touch

Other `webgpu/*` modules, interface, factory, index. Read-only is fine.

## Contract (from `01-architecture.md §3.2`)

`GpuAtlasStore`: `constructor(device)`, `add(atlas)`, `get(id)`, `uv(atlasId, frame)`,
`bindGroup(atlasId)`, `bindGroupLayout()`. `AtlasUV = { u0, v0, u1, v1, layer }`.

## Implementation steps

1. Keep two maps: `id -> LoadedAtlasImage` (for `get`/`getAtlas`) and `id -> { texture,
   bindGroup, width, height }`.
2. `add(atlas)`:
   - Store the `LoadedAtlasImage`.
   - Create a `GPUTexture` sized to the bitmap (`atlas.bitmap.width/height`), usage
     `TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT`, format `"rgba8unorm"`.
   - `device.queue.copyExternalImageToTexture({ source: atlas.bitmap }, { texture },
     [w, h])`.
   - Build the bind group (binding 0 = texture view, binding 1 = sampler).
   - If an atlas with the same id already exists, replace it (mirror `addAtlas` semantics:
     "replacing a sheet takes effect next frame"). Destroy the old `GPUTexture`.
3. **Sampler (critical for pixel-art):** one shared sampler, `magFilter: "nearest"`,
   `minFilter: "nearest"`, `addressModeU/V: "clamp-to-edge"`. (The *water* tile needs a
   `repeat` + optional `linear` sampler — that is Wave 1e's concern, not here.)
4. `uv(atlasId, frame)`: look up the `LoadedAtlasImage.frameRect(frame)` (gives px x,y,w,h),
   divide by the sheet's width/height to get `u0=x/W, v0=y/H, u1=(x+w)/W, v1=(y+h)/H`.
   Set `layer: 0`. Throw a clear error if the atlas or frame is missing (match the existing
   `drawSprite` error wording: `atlas sheet "<id>" not loaded` / `frame not found`).
5. `bindGroupLayout()`: a stable layout (texture: float 2d, sampler: filtering) shared by
   the sprite pipeline. Create it once in the constructor.

## Notes / pitfalls

- `copyExternalImageToTexture` expects the bitmap created with default orientation. The
  existing loader uses `createImageBitmap(blob)` (no flip) — UVs are top-left origin, which
  matches WebGPU texture coords (v=0 at top). Do NOT add `imageOrientation: "flipY"`.
- Premultiplied alpha: the canvas is configured `alphaMode: "premultiplied"` (Wave 1a), and
  the sprite shader (1c) outputs premultiplied. Source atlases are straight-alpha PNGs;
  the shader handles premultiply. You do not need `premultipliedAlpha` on the copy.
- Keep CPU bitmaps alive — do not close/transfer them; `getAtlas()` consumers need
  `frameRect` and the `ImageBitmap`.
- No `any`.

## Acceptance & verify

- `npm run typecheck -w @engine/core` clean.
- Self-review the UV math against `loader.ts` `frameRect` shape (`{x,y,w,h}` px).

Commit: `webgpu(wave-1b): GpuAtlasStore texture upload + UV lookup`.
