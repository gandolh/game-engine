# Game Briefs 60–65 — Render-polish wave

**Status:** Done (2026-06-10).
> Merged on 2026-06-13; original specs in git history.

A wave of small render/UX polish items shipped together: camera zoom range, island floor art, water rendering fixes, and topography. Brief 61 (continuous Pip movement) is the only one that touches sim behaviour; the remaining five are strictly render-only with zero sim/determinism impact.

## 60 Max zoom-in

- Raised `MAX_ZOOM` from 3 to 6; nearest-neighbor upscale stays crisp (16px tile → 96 canvas px at 6×).
- Extracted `MIN_ZOOM`/`MAX_ZOOM` constants shared between `packages/engine/src/render/camera.ts` (`Camera2D.setZoom`) and the wheel handler in `packages/farm-valley/src/main/camera.ts`, eliminating duplicated literals.
- Switched the wheel step from a fixed `±0.1` to multiplicative (e.g. `zoom *= 1.1`) so zooming feels uniform across the full range.

## 61 Continuous Pip movement

- Converted Pip's authoritative position from tile-committed-with-glide to continuous float (velocity = `1 / PLAYER_STEP_TICKS` tiles/tick); deleted `glideFromX/Y`, `stepCooldown`, and the easing block from `packages/sim-core/src/components/farmer.ts` and `player-control/system.ts`.
- Root cause of the teleport: mid-glide reversal reset `glideFromX` to a tile already behind `renderPos`, producing a backward jump in the snapshot stream that the main-thread lerp amplified. Continuous movement eliminates the whole class.
- AABB collision (0.6×0.6 tile inset, X then Y independently) keeps wall-slide feel; sim consumers of Pip's tile position apply `Math.round` at the call site.

## 62 Heritage floor variety

- Authored three distinct floor recipes in `tools/atlas-builder/src/recipes/base-recipes.ts`: `tile/heritage-floor-stones` (mossy turf/slabs, `greenDark`/`green`/`slate`), `tile/heritage-floor-ruin` (cracked brick, `rust`/`clay`/`bark`), `tile/heritage-floor-statue` (pale flagstone, `slate`/`steel`/`cyan` lichen).
- Split the collapsed `if`-cascade in `packages/sim-core/src/render-systems/static-layer.ts` `backdropFrame()` into three per-region returns.

## 63 Zoom-out water artifact

- Root cause confirmed: at zoom < 1 the effective canvas scale `sx < 1`; nearest-neighbor downsampling drops pattern rows/columns inconsistently and the per-frame sub-pixel scroll changes the dropped set each frame, causing shimmer/moiré.
- Fix: set `ctx.imageSmoothingEnabled = true` scoped tightly around the water `fillRect` when `sx < 1`, then restore `false`; land tiles and sprites remain crisp pixel-art at all zooms.

## 64 Subtle water waves

- Added a swell-pulse pass in `packages/engine/src/render/canvas2d/renderer.ts`: after the base water `fillRect`, a second pattern fill at a small offset with `globalAlpha` ~0.06–0.10 oscillating on a ~6–9 s sine (`nowMs`-driven, never tick-derived).
- Synced shoreline foam alpha to the same swell phase in `packages/farm-valley/src/main/render-loop.ts`: `alpha = 0.45 + 0.25 * sin(swellPhase + tilePhase)`, preserving zoom-stride thinning. Landed after brief 63 so the swell is tuned against the fixed baseline.

## 65 Island cliffs/topography

- New atlas frames `tile/cliff-face`, `tile/cliff-face-left`, `tile/cliff-face-right` (and `-a/-b` variants), EDG stone family (`slate`/`navy`/`bark` with waterline darkening).
- `TALL_ISLANDS: ReadonlyArray<{region: RegionId; rows: 1|2}>` data table + `computeCliffs()` sibling of `computeShores()` in `packages/sim-core/src/render-systems/geometry.ts`; emitted into the static layer at L2. Selected 3–5 islands (including `heritage-ruin`, waterfall island, shrine, and one quarry).
- Cliff emission skips bridge-approach tiles and dock/boat tiles; foam bubbles filtered off cliff tiles. Walkable grid asserted byte-identical before/after (cliffs sit on non-walkable ocean tiles).
