# Wave 4 — GPU Particles & Weather (optional, perf)

**Agents:** 2 (parallel, worktree-isolated). **Depends on:** Wave 3 green & parity accepted.
**Do not start unless the orchestrator confirms Waves 0–3 are merged and verified.**

## Why optional

v1 (Waves 0–3) renders particles + weather on the 2D overlay, which is correct and cheap
enough for the current counts (ParticleSystem pool + RainField capped at 900 drops). This
wave moves them onto the GPU only if profiling in Wave 3 showed the overlay 2D path as a
bottleneck. If Wave 3 reported the overlay as fine, **skip this wave** and keep the overlay
— simplicity wins.

## 4a — GPU particles
### Files you own
- `packages/engine/src/render/webgpu/particle-batch.ts` (new)
- `packages/engine/src/render/webgpu/shaders/particle.wgsl` (new)
- A new `drawGpu(...)` method on `ParticleSystem` is NOT allowed (engine purity / keep the
  Ctx2D path). Instead, add an OPTIONAL adapter: read the particle pool via a public
  iterator/snapshot the renderer can consume. If `ParticleSystem` lacks a public read API,
  propose the minimal addition in your report and let the orchestrator approve before
  editing `particles.ts`.
### Approach
Instanced quads (circle/rect/star via SDF or a tiny atlas), per-instance position/size/
color/alpha. Colors arrive as floats (no hex literals). Wire into `WebGpuRenderer.endFrame`
behind a flag, falling back to overlay if unavailable.

## 4b — GPU weather
### Files you own
- `packages/engine/src/render/webgpu/weather-pass.ts` (new)
- `packages/engine/src/render/webgpu/shaders/weather.wgsl` (new)
### Approach
Rain = instanced line segments (streaks); snow = instanced squares with sway. Read the
`RainField` drop pool via a public read API (propose minimal addition if absent — get
approval first). Reproduce the alpha curtain + bilinear-at-zoom anti-shimmer where relevant.

## Shared rules
- Keep the 2D overlay code intact as the fallback; gate GPU paths behind a capability/flag.
- Wash stays on the overlay (screen-space full-frame fill is trivial; not worth a pass).
- No hex literals in WGSL/TS; EDG colors enter as float uniforms/attributes.
- No `any`. Typecheck + render tests green. Browser parity re-checked (reuse Wave 3b method).

## Acceptance
Particles + weather visually match the overlay version; measurable fps improvement under a
heavy-weather scene; overlay fallback still works when GPU path is disabled.

Commits: `webgpu(wave-4a): GPU particle batch`, `webgpu(wave-4b): GPU weather pass`.
