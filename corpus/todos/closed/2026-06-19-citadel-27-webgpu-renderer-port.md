---
title: "Citadel 27 — Port Citadel renderer to WebGPU (drop Canvas2D) [FOUNDATIONAL]"
created: 2026-06-19
status: open
tags: [citadel, engine, render, webgpu, foundational]
---

# Citadel 27 — WebGPU renderer port

**Decision (grilled 2026-06-19):** Citadel goes **WebGPU-only**, dropping its Canvas2D
renderers. This is the **foundational lead of the render track** and is prioritized. The
sim-side **depth pass (07–10) is renderer-agnostic and runs in parallel** — it does not wait
on this.

**Lineage:** not a tiny-world feature — a strategic alignment with **Farm Valley's** renderer
so the entire `@engine` WebGPU stack + FV's proven passes become directly reusable (instead of
reimplementing them in Canvas2D).

## What already exists (consume directly — no farm-valley import)

`@engine/core/render/webgpu` already ships: [renderer.ts](../../packages/engine/src/render/webgpu/renderer.ts),
`gpu-context`, `tint-pass`, `weather-pass`, `cloud-shadow-pass`, `static-layer-pass`,
`sprite-batch`, `particle-batch`, `shadow-batch`, `texture-atlas`, `overlay-2d`, and the
`tint/weather/cloud/sprite/particle/water` WGSL shaders. Farm Valley already runs WebGPU-only
on this stack; Citadel will too.

## Scope

- Replace the citadel client's Canvas2D [terrain-renderer.ts](../../packages/citadel/src/render/terrain-renderer.ts)
  + [building-renderer.ts](../../packages/citadel/src/render/building-renderer.ts) with the engine
  WebGPU renderer (force the WebGPU backend at runtime, the FV pattern).
- Bake the terrain backdrop via `static-layer-pass`; draw buildings/villagers/raiders as
  `sprite-batch` quads. **Placeholder `EDG.*` rectangles become solid quads** — no authored art
  required to land the port.
- Keep `Canvas2dRenderer` available in `@engine` for **headless tests** (engine already keeps it;
  Citadel forces WebGPU only at runtime).
- HUD/ghost overlays via `overlay-2d`.

## Determinism / palette

- **Render-only — zero sim/determinism impact** (the sim is untouched).
- All colours via `EDG.*`; WGSL passes are EDG-safe by construction (FV precedent). Extend the
  palette guard (see [citadel-07](2026-06-19-citadel-07-tier-lock-enforcement.md)) to citadel render/WGSL.

## Caveat

**WebGPU can't render headless on this box** (per wiki/status). Visual verification needs the
user's real GPU — same as FV's pending visual passes. Plan a real-GPU eyeball into acceptance.

## Unblocks

[11](2026-06-19-citadel-11-adjacency-autotiling.md) · [13](2026-06-19-citadel-13-subtile-terrain-variation.md) ·
[15](2026-06-19-citadel-15-daynight-wash-light-pool.md) · [16](2026-06-19-citadel-16-weather-particle-fx.md) ·
[17](2026-06-19-citadel-17-placement-idle-easing.md) · [18](2026-06-19-citadel-18-instanced-ambient-crowd.md) ·
[20 sprite-batch](2026-06-19-citadel-20-sprite-batch-renderer.md) · [24 wear](2026-06-19-citadel-24-wear-decay-shader-overlay.md).

## Acceptance

- Citadel renders via WebGPU (terrain bake + batched building/villager quads); the Canvas2D render path is removed from the citadel client.
- Tests green headless (via `Canvas2dRenderer`); typecheck green; user visual-checks on a real GPU.
