# Brief 16 (engine) — vertex-shader wind sway for foliage

Promoted from [wiki/shader-ideas.md](../../../wiki/shader-ideas.md) (ch. 8 — 2D matrices).

## Why

Bridge sway is CPU-side today (per-frame sprite re-push — see log 2026-06-11), and crops/trees/orchards don't sway at all. A per-instance sway attribute moves the whole effect to the vertex stage: whole-map foliage motion with **zero per-frame CPU work**, which also retires the bridge's per-frame re-push.

## Tasks

1. **Per-instance attributes** `swayPhase` + `swayAmp` in [sprite-batch.ts](../../../../packages/engine/src/render/webgpu/sprite-batch.ts) (default amp 0 = rigid; existing callers unaffected).
2. **Vertex-stage shear/rotation about the sprite's base** in [sprite.wgsl](../../../../packages/engine/src/render/webgpu/shaders/sprite.wgsl) — the rotation-matrix plumbing already exists there. Sway only the top vertices (shear), not a whole-quad rotation, so roots stay planted.
3. **Game-side wiring** (farm-valley, not engine): give crops/trees/orchard sprites a small amp with per-sprite phase derived from position (deterministic, no `Math.random`); migrate the bridge guard-rope sway off its CPU path if it maps cleanly — if the organic bridge motion (brief 83) doesn't reduce to shear, leave it and say so.
4. **Wind gusts (optional):** a global time-varying wind-strength uniform multiplying all amps — one knob, whole-map gust waves.

## Acceptance

- Geometry-only displacement — no color math, palette guard green by construction.
- Render-only / wall-clock; no determinism impact.
- Engine stays game-agnostic: engine adds the attribute + shader path; *which sprites sway* is decided in farm-valley.
- Manual in-browser check: foliage sway visible but subtle at zoom 2; no swimming/shimmer on static structures (amp 0 must be exactly rigid).
