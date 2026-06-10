# Brief 60 — Increase the maximum zoom-in level

**Status:** done (merged 2026-06-10) · **Area:** `packages/engine` (camera) + `packages/farm-valley` (wheel input) · **Drafted:** 2026-06-10

Spectators can currently zoom in only to **3×**. We want a closer view of Pip and individual farmers — raise the zoom-in ceiling. Render-only; zero sim/determinism impact.

## Read first

- [corpus/wiki/player-and-interaction.md](../../../wiki/player-and-interaction.md) — camera/focus behaviour context.
- Root [CLAUDE.md](../../../../CLAUDE.md) — EDG32 palette + rendering layout. No sim code is touched here.

## Current state (verified against code 2026-06-10)

Zoom is clamped to `[0.5, 3]` in **two duplicated places** — both must change together:

1. [packages/engine/src/render/camera.ts](../../../../packages/engine/src/render/camera.ts) — `Camera2D.setZoom` (~line 39-43): `this.zoom = Math.max(0.5, Math.min(3, z))`, then derives `worldUnitsX/Y = baseUnits / zoom`.
2. [packages/farm-valley/src/main/camera.ts](../../../../packages/farm-valley/src/main/camera.ts) — the `wheel` handler (~line 129-136) re-clamps with the same literals: `zoom = Math.max(0.5, Math.min(3, zoom + delta))`, step `±0.1`.

Rendering is nearest-neighbor (`imageSmoothingEnabled = false` in [renderer.ts](../../../../packages/engine/src/render/canvas2d/renderer.ts) ~lines 59/118/271), so 16×16 pixel-art upscales crisply at any zoom — no sprite-resolution ceiling. Culling is zoom-aware (cull rect shrinks as zoom rises), and the screen↔world transforms in [tooltip.ts](../../../../packages/farm-valley/src/main/tooltip.ts) (~36-42) and the pan-drag handler derive from `worldUnitsX/Y`, so they need **no** changes. There are currently **no camera/zoom unit tests**.

## Tasks

- [ ] **1. Extract the clamp into shared constants.** Add `MIN_ZOOM` / `MAX_ZOOM` exported from the engine camera module (or accept them as `Camera2D` constructor params) so the engine clamp and the farm-valley wheel handler stop duplicating literals. The wheel handler should import/reuse the same bounds.
- [ ] **2. Raise `MAX_ZOOM` to 6.** At 6× a 16px tile is 96 canvas px — still crisp under nearest-neighbor. Keep `MIN_ZOOM` at 0.5 (brief 63 owns the zoom-out end; don't touch it here).
- [ ] **3. Scale the wheel step with zoom.** A fixed `±0.1` step that feels right at 1× is glacial at 5×. Make the step multiplicative (e.g. `zoom *= e.deltaY > 0 ? 1/1.1 : 1.1`) or proportional (`delta = 0.1 * zoom`) so zooming feels uniform across the range.
- [ ] **4. Manual verification at max zoom:** hover tooltips still pick the right entity, pan-drag distance still feels 1:1, focus-follow (brief 11 camera) still centers correctly, and the foam-bubble stride logic in [render-loop.ts](../../../../packages/farm-valley/src/main/render-loop.ts) (~146-147, keyed on `zoom >= 1`) still behaves (it only thins below 1×, so it's unaffected — confirm).
- [ ] **5. Add the missing test.** A small unit test for `Camera2D.setZoom` clamping + `worldUnits` derivation (there are none today — [canvas2d.test.ts](../../../../packages/engine/src/render/canvas2d.test.ts) is atlas-only).
- [ ] **6.** `npm run typecheck` + `npm run test`.

## Acceptance

- Wheel-zoom reaches 6× and back; no constant literal `3` remains as a zoom bound anywhere.
- Tooltip picking and pan feel correct at 6× (manual check in `npm run dev`).
- New camera clamp test passes.

## Risks / notes

- **Low risk overall** — zoom is orthogonal to sim state.
- Watch for any other hardcoded `Math.min(3, …)` zoom clamps (grep before declaring done — e.g. playback/focus code).
- Coordinate with brief 63 (zoom-out water artifact): both touch the same wheel handler. Land whichever first; the other rebases trivially.
