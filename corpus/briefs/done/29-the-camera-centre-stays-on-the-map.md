# Task 29: the camera's centre stays on the map

**Origin:** a side finding of the [Super Mario 64 decompilation research](../../wiki/research-sm64-decomp.md) of
2026-11-23 (the orbit camera note), chosen by the owner in the grilling the same day: the centre of the view may
not leave the world, so at most half a screen of off-map shows at an edge.

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** none.

## Context

None of the three cameras stops at the world's edge, so a player can drag into empty space and lose the map:

- **Farm** (`games/farm/client/src/main/camera.ts`): `applyFocusAndPan` sets the centre to a base (the focused
  farmer, or the middle of the world) plus `panOffset`, which a drag changes without a limit. The world is
  `WORLD_WIDTH` × `WORLD_HEIGHT` tiles of `TILE` units, already imported there.
- **Citadel** (`games/citadel/client/src/main/input.ts`): a drag calls `camera.setCenter` (line 481 on 2026-11-23),
  and zooming at the cursor shifts the centre too (line 505). The minimap (`minimap-wiring.ts`) and the follow
  glide in `render-loop.ts` also set it. The map is isometric, `WORLD_WIDTH` × `WORLD_HEIGHT` tiles (192 × 192,
  `games/citadel/sim-core/src/world/terrain.ts`), so a rectangle in screen space is the wrong shape: the limit
  belongs in tile space.
- **Hollow** (`engine/core/src/render3d/camera3d.ts`): `OrbitCamera.pan` moves `target` along the camera's right
  and up vectors with no limit; `pitch` and `distance` are the only things clamped. `camera-input.ts` wires the
  drag. The follow camera in `app.ts` sets `target` to an agent, which is always on the map. The grid is
  `GRID_SIZE` (64, `games/hollow/sim-core/src/world/grid.ts`).

## Files you OWN

- `games/farm/client/src/main/camera.ts` and its test
- `games/citadel/client/src/main/input.ts`, `minimap-wiring.ts`, and a small clamp helper beside them with a test
- `engine/core/src/render3d/camera3d.ts` and its test; `games/hollow/client/src/render3d/` only to pass the bounds
  where the `OrbitCamera` is built
- `corpus/` pages for this brief: the outcome, `log.md`, and the orbit camera note in
  [research-sm64-decomp.md](../../wiki/research-sm64-decomp.md)

## Files you must NOT touch

- Zoom limits, the follow glides and how a drag feels inside the map: only the edge changes.
- MateQuest, which has no panning camera.
- Any sim code: this is render-side only.

## What to do

1. **Farm.** Clamp the final centre (base + `panOffset`) to the world rectangle, then store
   `panOffset = clamped − base`, so dragging far past the edge leaves no dead zone on the way back.
2. **Citadel.** Write one function that turns a centre into tile coordinates, clamps it to the map and turns it
   back, using the iso helpers the client already has. Call it where the user moves the camera: the drag, the zoom
   at the cursor and the minimap. A follow target is always on the map; leave that path alone.
3. **Hollow.** Give `OrbitCamera` optional bounds for `target`'s x and y (the engine stays generic: the bounds are
   config, not Hollow's numbers). `pan` clamps to them. Hollow passes `0..GRID_SIZE` in its world units; check what
   one unit is before you pass it.
4. Walk each game briefly in the browser: drag hard toward each edge and corner, zoom at a corner, and drag back.
   The view stops with the edge at most half a screen in; the way back responds at once.

## Acceptance

- Tests: Farm's clamp keeps the centre inside the world and stores the clamped offset; Citadel's helper maps a
  centre off each of the diamond's four edges back onto the map, and leaves a centre on the map unchanged;
  `OrbitCamera.pan` stops at its bounds and behaves as today without them.
- The short walk in each game, with one screenshot per game at an edge in the outcome (out of git, in `verify/`
  only if the repo keeps such screenshots).
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Deploy the three games from the vps-deploy checkout: `node cli.ts farm-valley deploy`, `citadel deploy`,
  `hollow deploy`.

## Owner decisions

- Settled on 2026-11-23: the centre stays on the map (half a screen of off-map at most), not the whole screen.

## Outcome (2026-11-24)

The centre of the view stays on the map in all three games. Render only.

- **Farm:** `clampPanOffset` keeps base plus offset inside the world and the clamped offset is stored. Beyond the
  brief: the drag handler also re-anchors its start on the clamped offset, because it recomputed the offset from
  the gesture start and left a dead zone within one drag.
- **Citadel:** `clampCenterToMap` (`camera-bounds.ts`) clamps in continuous tile space and is called from the drag,
  the zoom at the cursor and the minimap seek. Its `input.test.ts` stubs the helper, since that test's fake `iso`
  has no projection.
- **Hollow:** `OrbitCamera` takes optional `targetBounds`; Hollow passes `0..GRID_SIZE` (one world unit is one grid
  cell). **The controller's call:** with bounds set, `pan` moves along the ground plane and never changes
  `target.z`. A vertical drag used to lift the target without limit (z 708 after `pan(0, 1000)` at pitch 45
  degrees), which lost the map even with x and y clamped. Without bounds the code path is unchanged.
- **Captures:** [verify/2026-11-24-camera-edge](../../verify/2026-11-24-camera-edge/README.md), one corner shot per
  game plus Hollow vertical and horizontal drags and the way back. Not taken: a Farm shot that drags past the edge
  and back within one gesture; the re-anchor is covered by logic only.
- Tests: Farm clamp (3), Citadel helper (3), `OrbitCamera` bounds (7 including no bounds and z unchanged).
