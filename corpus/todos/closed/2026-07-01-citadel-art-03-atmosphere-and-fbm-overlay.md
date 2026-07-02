---
title: "Citadel art 03 — atmosphere refine + wire the existing fBm overlay"
created: 2026-07-01
status: done
resolved: 2026-07-02
tags: [citadel, client, render, art, shaders, atmosphere, engine]
---

# Citadel art 03 — atmosphere + fBm overlay

The atmosphere half of the cozy-art upgrade. **Independent of the 2× flip** (touches the
wash / cloud / weather channels, not sprite recipes) — can run in parallel with
[art-02](2026-07-01-citadel-art-02-recipe-fidelity-pass.md). Grounded by the
[survey](2026-07-01-citadel-iso-pixel-art-quality-research.md); rules in the
[style bible](../wiki/citadel-art-style.md#light--atmosphere).

> **Key finding (2026-07-01, re-verified): the fBm overlay already exists.** The engine has
> a production **`CloudShadowPass`** — [cloud-shadow-pass.ts](../../engine/core/src/render/webgpu/cloud-shadow-pass.ts)
> + [cloud.wgsl](../../engine/core/src/render/webgpu/shaders/cloud.wgsl) (brief 15) — a
> world-anchored **3-octave fBm** value-noise overlay, `step()`-quantized to 3 alpha levels
> (pixel-art friendly), colored by a **pre-parsed EDG uniform** (no hex in the shader),
> premultiplied source-over. It's wired into `WebGpuRenderer` via
> **`setCloudOptions(opts)`** ([renderer.ts:247](../../engine/core/src/render/webgpu/renderer.ts))
> and drawn automatically inside `endFrame` when `coverage > 0.001`
> ([renderer.ts:497](../../engine/core/src/render/webgpu/renderer.ts)).
> **Citadel does NOT call `setCloudOptions` today** — it only passes `wash` to `endFrame`.
> So this brief is mostly **wire-up + a fog/vignette variant**, not a from-scratch pass. That
> collapses the risk of the original plan.

`CloudOptions` shape ([cloud-shadow-pass.ts:9](../../engine/core/src/render/webgpu/cloud-shadow-pass.ts)):
`{ shadowColor: EDG rgb floats, coverage: 0..1, driftSpeed: world-px/s, timeSec: number }`.

## Part 1 — Refine the day/night wash + light pools (no engine code)
File: [`atmosphere.ts`](../../games/citadel/client/src/render/atmosphere.ts).
- Rework the wash endpoints (`SeasonWash`) for **warm-biased golden hour** at dawn/dusk and
  a *gentle* cool at night — never a hard blue-black (cozy nights are lamplit). The wash is
  already a pure `mix()`-style blend on `dayFractionOf`/`nightFactorOf`; just retune the EDG
  endpoints + alphas warmer. HSB intuition (Book of Shaders ch.6) informs the hue picks, but
  the wash stays a CPU-computed `WashSpec` fed to TintPass — no shader change.
- Warmer, softer **night light pools** (the sprite-quad glows) → lamplit read at dusk.
- Pure of the snapshot (`tick`/`season`); EDG-only; zero sim/determinism impact.

## Part 2 — Wire the existing fBm cloud/fog overlay into Citadel
1. **Enable cloud shadows.** In the Citadel render loop (the `begin/endFrame` owner, see
   [`citadel-renderer.ts`](../../games/citadel/client/src/render/citadel-renderer.ts)), call
   `renderer.setCloudOptions({ shadowColor, coverage, driftSpeed, timeSec })` before
   `endFrame`, deriving `coverage` from the **season/weather** the snapshot already carries
   (overcast → higher coverage) and `timeSec` from the render clock (render-only; the pass
   world-anchors the fBm so it stays put under pan/zoom). `shadowColor` = an EDG cool
   (`slate`/`navy`) for cloud shade. Pure function of snapshot + render clock.
2. **Cozy fog/haze variant.** `cloud.wgsl` is a *shadow* pass (dark blobs). For cozy morning
   **haze / mist** you want a *light, warm* low-alpha veil. Cheapest path: add a
   `tintColor`/`mode` flag to `CloudOptions` + a warm branch in the shader (lift instead of
   darken), OR a sibling `HazePass` reusing the same `hash21`/`valueNoise`/`fbm3` helpers.
   Keep it EDG-uniform-colored + `step()`-quantized (2–3 alpha levels) so it stays pixel-art
   crisp — the [shader-ideas.md](../wiki/shader-ideas.md) rule. Very low max alpha (≤0.12).
3. **Soft vignette** (optional, cheap cozy framing): a radial darken in the fog/tint pass, or
   folded into the wash. Keep subtle.

> **Prior-art reconcile:** [shader-ideas.md](../wiki/shader-ideas.md) backlogs "GPU day/night
> wash", "cloud-shadow pass", and "fBm mist/fog sheet" — framed for Farm's `packages/engine`.
> The cloud pass already realises the first two in `@engine/core`; this brief realises the
> mist/fog item and **enables all of it for Citadel**. Update shader-ideas.md when done
> (tick the cloud + fog items; note the cross-game `setCloudOptions` API).

## Reuse note (engine layering)
Any shader change lives in `@engine/core` and must stay **generic** (engine never imports a
game — [decisions.md](../wiki/decisions.md)). The cloud pass already proves the pattern; a
fog variant is a param/branch on it, reusable by Farm. Don't regress Farm's render path.

## Acceptance
- Wash/light warm-biased for cozy; EDG-only; render-only (determinism intact).
- Citadel actually renders cloud shadows (+ optional warm haze/vignette) via
  `setCloudOptions`, driven by season/weather; world-anchored (stable under pan/zoom).
- Any shader edit stays generic in `@engine/core`; Farm render path unregressed.
- `npm run typecheck` + `npm run test` green (engine + citadel).
- **Verified in a real browser** (playtest-citadel) across a full day/night cycle — per
  [verify-ui-in-browser-before-done]; before/after screenshots at dawn / noon / dusk / night.
- [shader-ideas.md](../wiki/shader-ideas.md) updated.
