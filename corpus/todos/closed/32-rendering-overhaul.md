# Game Brief 32 — Rendering Overhaul

## Status: Done (2026-06-03)

## Summary

Replaced the flat orthographic debug view with a production-quality rendering stack:
Y-sort depth ordering, drop shadows, a particle system, improved pixel-art atlas (48→54 frames),
walk/work/idle-bob character animations, and the pathfinder correctly wired to the sim worker.

## Changes

### Rendering fixes
- **Y-sort**: `Canvas2dRenderer.endFrame` now sorts the dynamic sprite queue by `(layer, y)` so sprites
  with lower Y draw first — overlap creates the depth illusion that defines top-down RPG style.
- **Drop shadows**: `Canvas2dRenderer.pushShadow` queues ground ellipses drawn in a dedicated
  shadow pass before sprites, using `multiply` blend mode to darken the ground naturally.
- **Reverted ySquash / depth-scale**: an earlier attempt at 2.5D perspective (y-squash + sprite
  scale-by-depth) was removed; research confirmed Stardew Valley and the genre use pure orthographic
  projection — depth via overlap, not scale.

### Particle system
- New `ParticleSystem` class in `packages/engine/src/render/particles.ts`. Pure canvas primitives
  (circle / rect / star), alpha-fade lifetime, gravity, two-colour gradient.
- Wired into `Canvas2dRenderer.endFrame(wash?, particles?)` — drawn in world space after sprites,
  before the colour wash.
- Farm-valley emits: coin-burst on gold gain, dirt explosion on shock, ambient leaf floats from
  mature crops.

### Character animations
- **Walk frames**: `pickFarmerFrame` alternates `/walk-a` / `/walk-b` every 2 ticks while
  `farmer.path` is set. Works correctly now that the pathfinder is wired (see brief 34).
- **Work pose**: `resolveFrameAndBob` in `render-systems.ts` switches to `/work` frame when the
  farmer's front intention is `plant` / `harvest` / `water` / `till`.
- **Idle bob**: 1.5 px sine-wave vertical oscillation when standing still, offset by entity id so
  farmers don't all bob in sync.
- **`action` field** added to `SnapshotSprite` — worker emits the front intention kind; main thread
  uses it for pose selection.

### Atlas redesign
- All 16×16 sprites redrawn with proper pixel-art palettes and shading:
  - Tiles: grass (blade detail + dark borders), path (cobblestone grid), dirt (tilled rows), forge
    floor (dark stone + heat-crack glow), wood-plank (grain + nail dots), market floor (warm stone +
    gold diamond inlay), quarry floor (crack network + embedded stone patches).
  - Farmers: four distinct silhouettes per personality, idle + walk-a + walk-b + work poses.
  - Crops: radish (red bulb), wheat (grain heads), pumpkin (orange gourds on vine).
  - Structures: fountain (blue water bowl), tree, stone, blacksmith (forge glow), carpenter
    (workbench + saw), home (farmhouse + windows + chimney), debug player (cyan diamond).
  - Decorations: scarecrow, windmill, flower-bed, fence-art.
  - Items: geode, iron-ore.
  - Particles: coin-a, coin-b, dirt-a, dirt-b, star.

## Key files
- `packages/engine/src/render/canvas2d.ts` — Y-sort, shadow pass, particle hook
- `packages/engine/src/render/particles.ts` — new particle system
- `packages/farm-valley/src/render-systems.ts` — drop shadows, work/bob animation, backdropFrame
- `packages/farm-valley/src/worker/snapshot.ts` — added `action` field to `SnapshotSprite`
- `packages/farm-valley/public/atlas/main.png` + `main.json` — rebuilt atlas
