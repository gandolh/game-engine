# Brief 64 — Subtle animated waves on the water

**Status:** done (merged 2026-06-10) · **Area:** `packages/farm-valley` (render loop) + `packages/engine` (renderer, optional) · **Drafted:** 2026-06-10

The ocean already drifts (a scrolled pattern) but reads as flat. Add **subtle ambient wave motion** — a gentle brightness/swell pulse plus livelier shoreline foam. Strictly render-only, wall-clock-driven (like the existing forge fire / waterfall overlays); the sim never sees it.

**Ordering: land brief 63 (zoom-out water artifact) first** — waves must be tuned against the fixed water baseline, and both touch the same pattern/scroll code.

## Read first

- [corpus/wiki/performance.md](../../../wiki/performance.md) — render frame is ~1.4ms of a 16.6ms budget; ample headroom, but don't squander it.
- Root [CLAUDE.md](../../../../CLAUDE.md) — **EDG32 palette enforced**: any new shimmer/foam colors must be `EDG.*` constants.

## Current state (verified against code 2026-06-10)

- Water = one 48×48 repeating `CanvasPattern` (`bakeWaterPattern` in [renderer.ts](../../../../packages/engine/src/render/canvas2d/renderer.ts) ~131-170), scrolled per-frame via sin/cos drift (`setWaterScroll`, [render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts) ~124-135), filled under the baked static layer (~renderer.ts 287-300).
- All existing ambient animation is **overlay-based in the render loop** (wall-clock, render-only): shoreline foam bubbles (~render-loop.ts 137-173, 1800ms A→B→C cycle, viewport-culled, zoom-strided, per-tile phase `tx*3 + ty*5`), forge fire/smoke, waterfall cascade, campfire, weather particles. The static layer is baked once and never re-rasterized — **do not** introduce per-frame chunk re-rasterization.
- Shoreline data already exists: `COASTLINE_BUBBLE_TILES` (ocean tiles touching land) and `computeShores()` in [render-systems/geometry.ts](../../../../packages/sim-core/src/render-systems/geometry.ts) (~182-206, ~314-328).

## Design (two layered effects, both cheap)

1. **Swell pulse on the open water.** A slow whole-pattern modulation synced to the existing drift: after the water `fillRect`, draw a second pass — the same pattern at a small offset with low `globalAlpha` (e.g. 0.06-0.10) oscillating on a ~6-9s sine, or equivalently modulate a translucent `EDG`-blue overlay. Goal: the water appears to gently rise/fall rather than only slide. Implementation seam: either extend the water block in `renderer.endFrame()` (engine) behind a small API (`setWaterSwell(alpha, offsetX, offsetY)`), or keep the engine untouched and do it as the first thing the render loop pushes — prefer the engine seam since the water fill lives there.
2. **Foam synced to the swell.** Modulate the existing foam bubbles' alpha (currently fixed ~0.6) by the same swell phase plus their per-tile phase, so shorelines brighten as the swell "arrives": `alpha = 0.45 + 0.25 * sin(swellPhase + tilePhase)`. One-file change in render-loop.ts; reuses everything.

Tuning words from the request: **subtle**. The effect should be invisible until you look for it, and must not fight the day/night wash (drawn later, screen-space) or read as flicker at min zoom (verify post-63).

## Tasks

- [ ] **1.** Implement the swell pass (design pt 1). Wall-clock `nowMs` only — same pattern as the waterfall overlay; never tick-derived, never touching sim-core.
- [ ] **2.** Sync foam alpha to the swell (design pt 2) in [render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts) ~137-173, preserving the zoom-stride thinning.
- [ ] **3.** Palette compliance: any new color literal must be `EDG.*`; the guard test ([palette.test.ts](../../../../packages/engine/src/render/palette.test.ts)) must stay green.
- [ ] **4.** Verify at zoom 0.5 / 1 / max, DPR 1 and 2, and across day/night: no shimmer regression (this is why 63 lands first), no visible banding from the alpha overlay.
- [ ] **5.** Perf check: frame time before/after on a full-archipelago zoom-out view; the swell adds ~1 pattern fill — should be well under +0.5ms. Note numbers in the PR and update [performance.md](../../../wiki/performance.md).
- [ ] **6.** `npm run typecheck` + `npm run test`.

## Acceptance

- Open water visibly (but subtly) swells; shore foam breathes in sync.
- Zero sim/snapshot/determinism impact (pure render loop — no sim-core diffs at all, ideally).
- Frame time increase < 0.5ms at min zoom; palette guard green.

## Risks / notes

- The two-pass pattern fill doubles water fill cost — it's one big `fillRect` with a pattern, historically cheap, but measure rather than assume (task 5).
- Avoid per-tile sprite pushes for open water (the researched "Strategy C") — hundreds of pushes/frame for marginal visual gain; rejected.
- If brief 63 chose a smoothed/min-zoom water variant, make sure the swell pass uses the same variant selection.
