# Brief 12 (engine) — GPU day/night wash pass

Promoted from [wiki/shader-ideas.md](../../../wiki/shader-ideas.md) (ch. 6 — flagged there as "likely the highest-leverage item"; first wave, item 1).

## Why

The day/night + seasonal wash still lives on the 2D overlay canvas ([overlay-2d.ts](../../../../packages/engine/src/render/webgpu/overlay-2d.ts)) — composited *over* the WebGPU scene. That blocks every later in-scene pass (Voronoi caustics, cloud shadows — briefs 13/15) from composing **under** the tint, and keeps one of the overlay canvas's last jobs alive.

## Tasks

1. **Full-screen tint pass** in the WebGPU renderer: `mix(scene, washColor, washAlpha)`, with the wash color entering as a **pre-parsed EDG uniform** (the proven [weather-pass.ts](../../../../packages/engine/src/render/webgpu/weather-pass.ts) pattern — CPU parses `EDG.*` hex to floats; the shader never synthesizes RGB).
2. **Remove the overlay wash job** and verify what remains on the overlay canvas still earns its keep.
3. *(Optional, same pass)* per-channel seasonal grading via `mix()` with a `vec3` t, target colors EDG-derived — only if it drops in cleanly; otherwise leave for a follow-up.

## Acceptance

- Visual parity with the current overlay wash across a day cycle + all four seasons (manual in-browser check — WebGPU won't render headless on this box).
- Palette guard test green (no color literals in `.ts`; WGSL gets colors via uniforms).
- Render-only / wall-clock — no determinism impact, no baseline move.
- Keep the engine generic: the pass takes color+alpha; *which* color per time-of-day stays game-side.

## Notes

This brief deliberately ships **before** briefs 13 (caustics half) and 15 (cloud shadows) — they need to compose under the wash.
