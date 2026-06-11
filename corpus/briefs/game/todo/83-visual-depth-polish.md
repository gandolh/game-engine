# Brief 83 — Visual depth polish: bridge rope railings, sandy-shore descent, 3D houses, granular island water

**Status:** Todo · **Area:** atlas art (`tools/atlas-builder`) + render-only code (`packages/sim-core` render-systems, `packages/farm-valley` render) · **Drafted:** 2026-06-12

Four user-requested visual asks, all render-only (no sim/determinism impact). Grouped as one polish wave like briefs 60–65. Three of the four need new atlas art — **check for concurrent sessions before rebuilding sheets** (per the 2026-06-11 log entries, simultaneous atlas PNG rebuilds across sessions collide; touch only the sheets you need).

## The asks

- [ ] **1. Bridge rope railings you could hold onto.** Bridges already have twisted-rope rails *baked flat into the deck texture* ([bridge-h.ts](../../../../tools/atlas-builder/src/recipes/assets/tile/bridge-h.ts), shipped 2026-06-11). The ask is ropes on the margins **as railings** — visually raised guard-ropes that read as something a walker grabs so they don't fall in the water. Likely shape: posts at the deck edges + a rope span drawn *above* deck level (a second overlay frame at a higher layer than farmers-on-bridge, or taller deck art with the rail rising above the walk surface). Must follow the existing sway ([pushBridgeSprites](../../../../packages/sim-core/src/render-systems/occluders.ts) — one shared phase, axis by `runsVertical`).
- [ ] **2. Sandy shores descend into the water.** Where the shore band is sand ([computeShores](../../../../packages/sim-core/src/render-systems/) — region edges only, post bridge-sand fix), the island currently meets the ocean as a flat hard edge. Add a visible descent: a beach-slope transition (sand darkening/stepping down toward the waterline, possibly a 1-tile "wet sand" lip) so islands read as rising out of the water, not floating on it. Compose with the existing shallow-water band ([water-depth.ts](../../../../packages/farm-valley/src/render/water-depth.ts) cyan tint) — slope on the land side, shallows on the water side. Pseudo-3D height (brief 81's z-axis) may give the vertical offset for free; check before inventing a new mechanism.
- [ ] **3. Houses with depth, not just a front face.** Brief 77 added building pseudo-3D + the directional cast shadow shipped 2026-06-11, but true **side faces / eaves art** was explicitly deferred then ("needs new atlas art"). Do it now: extend house/building sprites with a shaded side face + roof eave overhang (sun from the same direction the cast shadow implies — lower-right), so buildings read as volumes. Atlas recipes in [tools/atlas-builder/src/recipes/assets/](../../../../tools/atlas-builder/src/recipes/) (buildings sheet); EDG32 only.
- [ ] **4. Granular island water to suggest depth.** The near-shore water is a smooth translucent cyan wash per depth ring ([water-depth.ts](../../../../packages/farm-valley/src/render/water-depth.ts), BFS depth 1–4). Make it granular — dithered/speckled per-tile texture within each depth band (denser/lighter speckle when shallow, sparser/darker when deep) so the banding reads as depth instead of tint. Canvas2D path: bake the dither into the static-layer pass with the seeded hash already used for ground noise. WebGPU path: this is the same territory as [wiki/shader-ideas.md](../../../wiki/shader-ideas.md) (quantized-noise shore foam, water UV-warp, Voronoi caustics) — if the `webgpu-migration` branch lands first, prefer the shader version and fold this item into that backlog.

## Read first
- log.md 2026-06-11 entries: rope-railed bridges (what shipped), coastal shallow-water depth (the band this builds on), and the explicit deferral of house side-faces.
- [wiki/asset-pipeline.md](../../../wiki/asset-pipeline.md) — per-asset recipes, cached sheet builds, the asset-count guard test (bump it with any new frame).
- [wiki/player-and-interaction.md](../../../wiki/player-and-interaction.md) — bridges, plot layout, tile geometry.
- Brief [77](../done/77-building-3d-depth-and-farm-houses.md) — what building pseudo-3D already does.

## Acceptance
- Bridges show raised guard-ropes that sway with the deck; farmers crossing read as *between* the ropes.
- Sand shores slope visibly into the water; no bathtub-ring banding.
- Buildings read as volumes (side face + eaves consistent with the cast-shadow light direction).
- Near-shore water has granular texture that deepens away from land.
- typecheck + suites green (incl. asset-count guard); visual sign-off is the user's. Render-only — no baseline move, no determinism run needed.

## Risks / notes
- **Atlas collisions:** items 1–3 rebuild terrain/props/buildings sheets. Coordinate with any concurrent session; rebuild only the sheets actually touched (recipe cache makes this cheap).
- Item 1's "above the walker" layer ordering needs care: rope overlay must occlude farmers' feet but not their heads — check how the waterfall/cliff occluders handle the same problem before inventing a new layer.
- Item 4 must stay EDG32-compliant — speckles pick from existing palette neighbours (cyan/blue/white), no blended intermediates in the bake.
- Each item is independently shippable; don't block the wave on the hardest one (likely 3).
