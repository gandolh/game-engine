# Brief 14 (engine) — weather + particle shader parity polish

Promoted from [wiki/shader-ideas.md](../../../wiki/shader-ideas.md) (chs. 5, 7, 10; first wave, item 3). A bundle of small, independent WGSL parity fixes — Canvas2D had nicer particles than the WebGPU port in places.

## Tasks (each ~minutes-to-an-hour, independently shippable)

1. **Round snow.** [weather.wgsl](../../../../packages/engine/src/render/webgpu/shaders/weather.wgsl) draws snow as squares; copy the SDF-circle-with-`fwidth` recipe already proven in [particle.wgsl](../../../../packages/engine/src/render/webgpu/shaders/particle.wgsl).
2. **Rain-streak tail taper.** Fade streak alpha head→tail with `smoothstep` along the quad's v coordinate — reads as motion blur.
3. **Per-flake variation.** Hash the instance index for size/alpha twinkle instead of uniform flakes.
4. **Proper 8-point star particle.** particle.wgsl's star is an L1 diamond (brief-4a simplification); the polar method (radius modulated by `atan2(v,u)`) restores Canvas2D's 8-point star in ~5 lines.
5. **Shaped particle fade-out.** Apply `pow()`/`smoothstep` easing to the per-instance linear alpha so sparks die fast and smoke lingers. Alpha-only — zero palette risk.
6. **Soft-edged drop shadows.** [shadow-batch.ts](../../../../packages/engine/src/render/webgpu/shadow-batch.ts) ellipses are hard-edged; `smoothstep` the ellipse SDF over ~1px (`fwidth`).
7. **SDF ring splashes for rain** (brief-81 rain field): GPU expanding-ring SDF (`abs(length(uv)-r) < w`) per splash instance — crisper and cheaper at high drop counts.
8. **Verify-first cleanup:** check whether the CPU particle path ([particles.ts](../../../../packages/engine/src/render/particles.ts) `splice(i,1)` removal; uncapped weather spawns flagged in [wiki/performance.md](../../../wiki/performance.md) Tier-0 #2) is still live post-WebGPU-migration. If live: cap total particles, budget spawns/frame, swap-with-last + `pop()`. If dead: delete instead of fixing.

## Acceptance

- Palette guard green (all effects modulate alpha/coverage of pre-parsed EDG uniforms — never synthesize RGB).
- Render-only — no determinism impact, no baseline move.
- Manual in-browser check across rain/storm/snow (`ticksPerDay` low so weather cycles fast, e.g. the `#c0ffee-64-3c` trick from performance.md).
