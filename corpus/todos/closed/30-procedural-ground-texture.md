# Game Task 30 — Procedural Ground Texture (Noise)

## Context

The rendered world reads as a debug view: flat solid-color tiles (uniform green grass, brown dirt, tan path), no surface variation (Playwright 2026-06-03, `fv-02-running.png`). The renderer already bakes the static backdrop once into an offscreen canvas (`Canvas2dRenderer.bakeStaticLayer` — tiles + fences + plot dirt) and blits it under the per-frame dynamic queue. Adding noise-based per-tile variation to that bake costs nothing per frame.

Inspiration: *The Book of Shaders* Random + Noise chapters (hash randomness, value/Perlin noise, fBm). **The book targets GPU GLSL; this project is Canvas2D, and the book's code is "all rights reserved"** — so we reimplement the *math* (a hash/value-noise function) in JS, not its code.

## Goal

Break up the flat solid-color ground with **subtle per-tile value-noise variation** in brightness, baked once into the static layer, deterministic from the sim seed.

## Design decision (locked 2026-06-03)

**Subtle per-tile variation only** — the smallest scope that kills the flatness. No tile-edge blending, no procedural terrain features (those were considered and deferred). Value noise modulates each tile's fill brightness slightly so grass/dirt/path gain texture without changing the layout, the tile grid, or any sim state.

## Implementation notes

- Reimplement a small **value-noise / hash** helper in JS (e.g. `fract(sin(dot(...)))`-style hash → smoothed value noise). Seed it from the **sim seed** (thread the seed to the renderer, or derive a render-only seed deterministically) so the same run looks the same — and so a shared run URL reproduces the same ground.
- Apply during `bakeStaticLayer`: for each tile, jitter the base fill lightness by a small noise-derived delta before drawing. Keep amplitude restrained — texture, not noise-storm.
- This is a **one-time bake**, not per-frame — no CPU per-pixel work in the render loop.

## Files in scope

- `packages/engine/src/render/canvas2d.ts` — `bakeStaticLayer` applies the per-tile brightness jitter.
- `packages/farm-valley/src/render/ground-noise.ts` — NEW: pure value-noise/hash helper (reimplemented math).
- Thread the sim seed (or a derived render seed) to the renderer.
- `packages/farm-valley/src/render/ground-noise.test.ts` — NEW: noise is deterministic on `(seed, x, y)`, bounded amplitude, smooth (neighbors differ by small amounts).

## Files you must NOT touch

- Any sim system, agent, protocol, the tile grid, or the walkable grid — this is purely cosmetic and must not change layout or sim outcomes.

## Determinism guarantee

Ground texture is a pure function of `(seed, tile coords)`. No `Date.now`/`Math.random`. Sim outcomes for a seed are unchanged (pixels only). A shared run URL reproduces the same ground.

## Acceptance

- Grass/dirt/path show subtle surface variation instead of flat fills; layout unchanged.
- No measurable per-frame cost (the variation lives in the one-time bake).
- `npm test` / `npm run typecheck` green.
