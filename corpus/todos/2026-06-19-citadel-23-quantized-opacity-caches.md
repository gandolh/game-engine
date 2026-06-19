---
title: "Citadel 23 — Quantized opacity material caches — WON'T DO (moot under WebGPU)"
created: 2026-06-19
status: superseded
tags: [citadel, render, wontdo]
---

# Citadel 23 — Quantized opacity caches — WON'T DO

**Lineage:** tiny-world-builder buckets per-particle opacity into shared quantized material
caches to skip a Three.js material re-upload per opacity step (the Canvas2D analogue is
`ctx.globalAlpha` churn).

## Why this is cut (2026-06-19)

This was a **Canvas2D micro-optimization**. The 2026-06-19 decision makes Citadel
**WebGPU-only** ([citadel-27](2026-06-19-citadel-27-webgpu-renderer-port.md)), where per-particle
alpha flows through the `@engine` [particle-batch](../../packages/engine/src/render/webgpu/particle-batch.ts)
via per-instance attributes — there is **no `globalAlpha` state churn to coalesce**. The premise
no longer exists, so this brief is **superseded**.

If a WebGPU particle-perf issue ever surfaces, it would be a different, engine-level optimization
(instance buffer packing), filed fresh against `@engine`.
