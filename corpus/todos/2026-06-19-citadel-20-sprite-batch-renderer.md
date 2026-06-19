---
title: "Citadel 20 — Batched sprite rendering (WebGPU)"
created: 2026-06-19
status: open
tags: [citadel, engine, render, perf, webgpu]
---

# Citadel 20 — Batched sprite rendering

**Lineage:** tiny-world-builder batches voxel panels via `InstancedMesh` buckets (by geometry +
material, hidden-face stripped). Farm Valley's analogue is the `@engine` WebGPU
[sprite-batch.ts](../../packages/engine/src/render/webgpu/sprite-batch.ts) — one program, many
sprites per draw.

**Depends on:** [citadel-27 (WebGPU port)](2026-06-19-citadel-27-webgpu-renderer-port.md).
**Un-gated by the 2026-06-19 WebGPU-only decision** (was parked on a Canvas2D-vs-WebGPU fork that's now resolved).

## Idea

Render Citadel's buildings / villagers / raiders through the engine `sprite-batch` (batched by
atlas page / material) rather than per-entity draws. Initially batches the placeholder quads
from the port; full value once authored pixel-art sprites + an atlas exist.

## Acceptance

- Building/villager draws go through `@engine` `sprite-batch`; `?profile` shows fewer draw calls than per-entity.
- Render-only; no determinism change; `EDG.*` colours.

## Note

Authored sprites + atlas remain a **separate art workstream** (the Phase-5 atlas brief was never done) — batching works on placeholder quads in the meantime.
