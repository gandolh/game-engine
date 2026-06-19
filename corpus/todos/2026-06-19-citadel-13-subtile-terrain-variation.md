---
title: "Citadel 13 — Sub-tile coordinate-hash terrain variation"
created: 2026-06-19
status: open
tags: [citadel, render]
---

# Citadel 13 — Sub-tile terrain variation (dither)

**Lineage:** tiny-world-builder renders each terrain cell with a hash-derived visual
variant so same-type tiles don't look stamped (grass gets scattered darker pixels, stone
gets crack marks, water gets shimmer accents). The variation is **computed from the cell's
global coordinate** so it's identical every frame and **never persists in save data**.

**Target:** Citadel render — terrain backdrop baked into the WebGPU `static-layer-pass` texture
([citadel-27](2026-06-19-citadel-27-webgpu-renderer-port.md)). **Bake-time render-only; uses the
existing seed — no new randomness, no sim impact.** Depends on the WebGPU port.

## Idea

The 96×96 baked terrain is flat colour blocks; biome boundaries are hard to read. Add a
deterministic dither pass at bake time (1–3 darker/lighter pixel clusters per tile, hashed
from `(tx, ty, type)` using the **existing `SeededNoise` permutation table** in
[terrain.ts](../../packages/citadel-sim-core/src/world/terrain.ts) — no new RNG). Farm Valley
already does this (procedural ground texture, game brief 30) — port the pattern.

## Decisions to settle in-brief

- Per-pixel dither (expensive) vs a fixed small per-type pattern stamp (faster, more pixel-art-authentic).

## Acceptance

- Same-type tiles no longer look stamped; identical every frame; zero per-frame cost (baked once).
- Uses the existing permutation table; no new randomness; `EDG.*` colours only.
- Typecheck + citadel tests green.
