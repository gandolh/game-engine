---
title: "Citadel 24 — Procedural wear/decay shader overlay (WebGPU)"
created: 2026-06-19
status: open
tags: [citadel, engine, render, shader, webgpu]
---

# Citadel 24 — Procedural wear/decay overlay

**Lineage:** tiny-world-builder's `applyWear(material, opts)` injects procedural damage (cracks,
staining, erosion) via `onBeforeCompile`, driven by a `wear` uniform, with reusable
`fxHash`/`fxNoise`/`fxFbm`. The `@engine` analogue is [tint-pass.ts](../../packages/engine/src/render/webgpu/tint-pass.ts)
+ the WGSL noise in the shader stack (engine shader wave 12–16).

**Depends on:** [citadel-27 (WebGPU port)](2026-06-19-citadel-27-webgpu-renderer-port.md).
**Un-gated by the 2026-06-19 WebGPU-only decision.**

## Idea

A procedural wear/age overlay on buildings — cracks, soot near forges, erosion as a building
ages or takes fire damage — driven by an `age`/`wear` uniform, reusing the engine tint-pass +
WGSL noise rather than new materials. Ties naturally into the fire hazard (burnt buildings
visibly scarred). Farm Valley could also adopt it (already WebGPU).

## Acceptance

- A `wear`/`age` uniform drives procedural cracks/soot/erosion over buildings without per-state re-bake.
- EDG32-safe by construction; render-only; no determinism change.
