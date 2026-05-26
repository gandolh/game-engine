# Engine Task 01 — Chunked Tilemap Renderer

## Context

This is a TypeScript game engine for a Stardew-Valley-like multi-agent farming sim ("Farm Valley"). The engine uses raw WebGPU, miniplex ECS, a fixed-step 20Hz sim with interpolated render, and a build-time procedural sprite atlas.

You are adding a **chunked tilemap renderer** to the engine. Today the renderer only draws individual sprites via the existing `SpriteBatch`. We need a tilemap layer that can efficiently render large grids of tiles (thousands of tiles, ~64×64 chunked) without one draw call per tile.

## Files you OWN (create or modify)

- `packages/engine/src/render/tilemap.ts` (create) — Tilemap class, chunk management, draw API
- `packages/engine/src/render/tilemap-shader.ts` (create) — WGSL shader for tilemap
- `packages/engine/src/render/index.ts` (modify — ADD exports, don't remove existing ones)

## Files you must NOT touch

- `packages/engine/src/index.ts` (don't add exports here — I integrate later)
- `packages/engine/src/render/sprite-batch.ts` and `sprite-shader.ts` (don't modify)
- `packages/engine/src/render/device.ts`, `camera.ts`, `renderer.ts` (don't modify; renderer.ts may be extended later — leave alone)
- Anything outside `packages/engine/src/render/`
- `packages/farm-valley/**` (game code — out of scope)

## What to build

1. **`Tilemap`** class. Constructor takes `{ gpu, atlas, chunkSize, tileSizePx, layers }`. Stores tile data per layer.
2. **Chunking.** Divide the world into NxN chunks (e.g. 16×16 tiles). Each chunk holds its own GPU vertex/index buffer (or storage buffer of tile instances). Re-upload only when the chunk is dirty.
3. **Tile data model.** Per tile: atlas frame name (or numeric id), optional flags. Provide:
   - `setTile(layer: number, tileX: number, tileY: number, frame: string | null)` — sets and marks chunk dirty
   - `getTile(layer, tileX, tileY)` — read
   - `fill(layer, x0, y0, x1, y1, frame)` — bulk fill (mark all affected chunks dirty)
4. **Frustum culling.** Given a camera (`Camera2D` exists at `render/camera.ts`), draw only chunks whose AABB intersects the visible area.
5. **Render API.** `draw(pass: GPURenderPassEncoder, camera: Camera2D)` issues one draw call per visible chunk.
6. **Shader.** WGSL shader sampling from the atlas texture (`rgba8unorm`), nearest-neighbour filtering, premultiplied alpha blending matching `SpriteBatch`. The shader can use the same atlas as `SpriteBatch`.
7. **Tests.** Add `packages/engine/src/render/tilemap.test.ts` with at least:
   - chunk dirty tracking (only changed chunks are re-uploaded)
   - bulk fill marks all chunks correctly
   - culling: chunks outside camera bounds are not drawn (use a spy/mock GPUDevice or just test the culling predicate as a pure function — extract it)

## Acceptance criteria

- `npm run typecheck` passes
- `npm run test` passes for engine (including your new tests)
- API exposed via `packages/engine/src/render/index.ts`
- No `.js` extensions in imports
- No `^`/`~` in any version you pin (you should not be adding deps)

## Engine API quick reference

```ts
import type { GpuContext } from "./device";
import type { LoadedAtlas } from "../assets";
import type { Camera2D } from "./camera";
// GPUDevice/GPURenderPassEncoder are global (WebGPU types)
```

## Difficulty & subagent split

**HARD** — WebGPU pipeline creation, buffer management, frustum culling, shader correctness all in one slice.

Recommended: spawn **one senior (opus) subagent** for the whole slice. The pieces are tightly coupled (shader format ↔ buffer layout ↔ draw call); splitting risks integration bugs. If you want to delegate, have the senior write all production code and a **junior (sonnet) subagent** write only the unit tests (against the senior's extracted pure-function culling predicate).

## How to delegate (if you delegate)

Use the Agent tool, subagent_type="claude", model="opus" for senior, model="sonnet" for junior. Give the subagent a precise file list and acceptance criteria. After it returns, verify by reading the actual files (not just trusting the summary), then run `npm run typecheck` and `npm run test`.
