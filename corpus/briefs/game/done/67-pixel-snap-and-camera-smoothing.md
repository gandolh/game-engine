# Brief 67 — Pixel-snapped sprite draws + camera smoothing

**Status:** Done (2026-06-11) · **Area:** `packages/engine` (canvas2d renderer, camera) + `packages/farm-valley` (main/camera) · **Drafted:** 2026-06-10

Two structural game-feel fixes from the 2026-06-10 research pass (see [performance.md](../../../wiki/performance.md) Tier 3): sub-pixel sprite draws shimmer under nearest-neighbor scaling, and the camera *snaps* (focus jumps, wheel-zoom recenters hard) instead of easing. Render-only; **zero sim/determinism impact**.

## Read first

- [corpus/wiki/player-and-interaction.md](../../../wiki/player-and-interaction.md) — focus camera / pan / zoom behaviour.
- Briefs 60 + 63 ([60–65 render-polish wave](60-65-render-polish-wave.md)) — both touch the same camera/wheel code; coordinated merge order at the time.

## Current state (verified against code 2026-06-10)

- Renderer: [packages/engine/src/render/canvas2d/renderer.ts](../../../../packages/engine/src/render/canvas2d/renderer.ts), `imageSmoothingEnabled = false` (nearest-neighbor) — fractional canvas-space draw coords therefore *jitter* between pixel columns as a sprite lerps (the shimmer).
- Farmer sprites arrive already world-lerped from `SimClient.getInterpolatedSprites()` — interpolation itself stays in floats; only the final draw should snap.
- Camera: [packages/engine/src/render/camera.ts](../../../../packages/engine/src/render/camera.ts) (`Camera2D`, world↔screen transform) and [packages/farm-valley/src/main/camera.ts](../../../../packages/farm-valley/src/main/camera.ts) (pan-drag, wheel zoom, focus-follow). Focus-follow sets the camera target directly per frame → hard snap on focus change.

## Tasks

- [ ] **1. Pixel-snap at draw time.** In the canvas2d renderer, round the final *screen-space* x/y (and ensure integer w/h) for sprite/tile draws: `Math.round(screenX)` after the camera transform, never in world space (would break interpolation smoothness). Gate behind a renderer option if any draw path (e.g. particles) looks worse snapped.
- [ ] **2. Camera smoothing.** Ease the camera toward its target with frame-rate-independent exponential smoothing: `pos += (target - pos) * (1 - Math.exp(-k * dtMs / 1000))`, k ≈ 8–12. Apply to focus-follow re-centers and zoom-point anchoring; direct pan-drag stays 1:1 (dragging through a lerp feels like mud).
- [ ] **3. Snap-to-rest.** When `|target - pos|` falls under half a screen pixel, set `pos = target` so the camera doesn't asymptote forever (and so the static backdrop blit stays cacheable on integer offsets).
- [ ] **4. Verify no regressions:** hover-tooltip picking (screen↔world transforms must use the *smoothed* camera position), the baked-backdrop blit alignment, and focus-follow on a walking farmer (smooth, no rubber-band overshoot).
- [ ] **5. Tests:** unit test the smoothing function (converges, frame-rate independent: 1×32 ms step ≈ 2×16 ms steps) and the snap-to-rest threshold. Manual shimmer check in `npm run dev` at 2–3× zoom on a walking farmer.
- [ ] **6.** `npm run typecheck` + `npm run test`.

## Acceptance

- A walking farmer at 3× zoom shows no column shimmer; diagonal walks look stable.
- Switching focus between two farmers glides (~0.3 s) instead of teleporting; pan-drag remains exact.
- All colors untouched (no palette interaction); existing render tests pass.

## Risks / notes

- **Engine-layer change** — `@engine/core` stays game-agnostic: the smoothing helper + snap option belong in the engine camera/renderer, the *policy* (k value, when to follow) stays in farm-valley.
- Rounding the backdrop blit offset and the sprite draws must agree, or sprites will swim ±1px against the ground.
