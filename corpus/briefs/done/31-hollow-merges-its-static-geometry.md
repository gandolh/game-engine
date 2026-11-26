# Task 31: Hollow merges its static geometry

**Origin:** step 2 of the [Hollow 3D culling todo](../../todos/closed/2026-11-20-hollow-3d-culling.md), promoted on
2026-11-26 under the owner's rule of 2026-11-23: build light optimizations without waiting for a trigger, so long as
each is not too heavy, complex or wide ([decisions.md](../../wiki/decisions.md) → Frame budget). Step 1 was
[brief 19](../done/19-hollow-culls-what-the-camera-cannot-see.md) (frustum culling); step 3 was answered (framed in
the portal costs nothing more). The plan is [frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Opus ([routing.md](../../routing.md)). It adds the first API that frees GPU objects in
`SceneRenderer3D`, and changes how Hollow's town is drawn, which must look the same afterwards. A leaked or
double-freed buffer shows in no counter and no mocked-GL test, so the lifecycle needs care.

**Depends on:** none. Briefs 19, 24 and 27, which edited the same `frame()`, are done. Read
[brief 24](../done/24-hollow-builds-its-static-draws-once.md)'s outcome before planning: its `static-draws.ts` is
where this brief starts.

## Context

Hollow is the only 3D game. `SceneRenderer3D` (`engine/core/src/render3d/webgl2/renderer3d.ts`) issues one
`drawElementsInstanced` per `DrawCall3d` (a mesh plus its packed instances), after brief 19's per-instance frustum
cull. Each vertex carries its material index (`packMesh` in `engine/core/src/render3d/buffers.ts`: position and
material, 4 floats), and one uniform table holds every material. So one vertex buffer can hold any mix of
materials: the todo's "one buffer per material" means one buffer for all of them here.

Hollow's `frame()` in `games/hollow/client/src/render3d/app.ts` builds these draws every frame:

| Draw | Instances | Changes when |
|---|---|---|
| Ground (`buildGroundMesh`, 65×65 vertices, 8,192 triangles) | 1 | never |
| Territory tiles (`buildTerritoryTileMesh`) | one per territory tile, tinted per community | a community's territory changes (brief 24's `TerritoryInstanceCache` in `static-draws.ts`) |
| Hearth (`buildHearthMesh`), graveyard (`buildGraveyardMesh`) | 1 each, from `latest.hearth` and `latest.graveyard` | never, after the first snapshot that has them |
| Homes (`homeMeshFor(memberCount)` in `household-layout.ts`) | one draw per distinct member count | a household forms, grows or dissolves; positions are frozen by `HomeRegistry` |
| Resource nodes, food and material | scaled by stock | every snapshot |
| Corpses | one per body | every snapshot |
| Agents | one draw per skin × hair × pose variant | every frame |

The first four rows are static or nearly so. On the headless bench (1280×800, seed 42, the orbit scene) Hollow
averages 35.7 GL draw calls a frame (p95 41) and 96 instances (p95 107); the agents account for most of both. Its
GL-call ceiling is 43 ([frame-budget.md](../../wiki/frame-budget.md) → Budgets per scene). On the laptop Hollow holds
its 120 Hz refresh with 2.6–2.8 ms of GPU a frame, and the phone estimate puts its GPU headroom at 3.5–3.8×, just
under the assumed 4× ([real-gpu-readings.md](../../wiki/real-gpu-readings.md)).

**What to expect.** Merging cuts GL calls and per-draw CPU and driver work. It draws the same triangles, so the GPU
time should not move; the laptop reading checks that it does not rise. If the homes take three to six draws, the
saving is about 5 to 8 of the 35.7 calls.

**Two things the code doesn't do today:**

- Nothing frees a mesh. `uploadMesh` creates a VAO, a vertex buffer and an index buffer, and the renderer keeps an
  instance buffer per mesh in `instanceBuffers`; no method deletes any of them. `materials.ts`'s header gives that
  as the reason the territory is instanced and not rebuilt: re-uploading on each change would leak.
- The territory's colour is an instance tint (`territoryTintColor(communityId)`, a mix of grass toward one of the
  eight `COMMUNITY_COLOR_ROLES` in `community-color.ts`) over a neutral white material, `territoryTile`. A merged
  mesh has one white instance, so the colour has to come from the material.

## Files you OWN

- `engine/core/src/render3d/webgl2/renderer3d.ts` and `renderer3d.test.ts` (a `releaseMesh` method and its
  guard)
- `games/hollow/client/src/render3d/static-draws.ts` and `static-draws.test.ts` (the merged meshes and their
  change keys)
- `games/hollow/client/src/render3d/materials.ts` and `materials.test.ts` (the eight territory materials)
- `games/hollow/client/src/render3d/world-meshes.ts` and its test, only if the territory tile mesh changes
- `games/hollow/client/src/render3d/app.ts`: the mesh uploads at boot and the static part of `frame()` (ground,
  territory, hearth, graveyard, homes). Nothing else in it.
- `corpus/verify/<date>-hollow-static-merge/` (bench exports, screenshots, the per-kind draw counts)
- `corpus/` pages for this brief: the outcome, `log.md`, [frame-budget.md](../../wiki/frame-budget.md) (a row for
  31, and the Hollow 3D culling row), and the todo: its status line, then its move to `todos/closed/` with its links
  re-resolved (it sits one level deeper there)

## Files you must NOT touch

- Hollow's sim (`games/hollow/sim-core`), its worker, the snapshot, the research surfaces and the chronicle.
- The agent, resource-node and corpse draws. They change every frame or every snapshot.
- Brief 19's culling (`engine/core/src/render3d/cull.ts`), beyond calling it.
- `packMesh`'s vertex layout, the shaders and `render3d/webgl2/shaders/`: the defaults below need no shader change.
- `games/hollow/client/src/render3d-demo.ts`, the 2D renderer and the other three games.

## Decisions taken for you

These are the controller's calls, from the code and the corpus. If one turns out wrong, stop and report it rather
than switching to another.

1. **The territory colour moves into eight materials**, one per `COMMUNITY_COLOR_ROLES` slot. Each material's colour
   is the RGB of `territoryTintColor` for that slot, so every colour still comes from `HOLLOW_PAL` roles and no hex
   literal appears (`engine/core/src/render/palette.test.ts`). The fragment shader multiplies the lit material colour by
   the instance tint (`scene3d.frag.glsl`), so white material × tint and tint material × white are the same float
   product, and the pixels should not change. Rejected: a per-vertex colour, which changes the vertex
   layout, `packMesh`, the shader and every mesh.
2. **Two merged meshes.** A **fixed** one (ground, hearth, graveyard), built from the first snapshot and rebuilt
   only if the hearth or graveyard position changes; and a **changing** one (territory tiles and homes), rebuilt
   when the territory key (as `TerritoryInstanceCache` builds it) or the homes key (each household id, its frozen
   position and its member count) differs from the last. Compare keys without allocating, as `static-draws.ts` does
   now (home positions are floats, so their key needs a `Float64Array`). Each merged mesh is drawn as one identity instance with `WHITE_TINT`. Rejected: one mesh for everything,
   which would re-pack the 8,192 ground triangles on every territory change.
3. **Release and upload, not a mutable mesh.** `releaseMesh(handle)` deletes the handle's VAO, vertex and index
   buffers and its entry in `instanceBuffers`, and marks the handle released. `render` throws on a released
   handle. When the device is lost, release only forgets the handle. A rebuild uploads the new mesh and
   then releases the old one. Rejected: rewriting buffers in place, which would make `MeshHandle`'s `indexCount` and
   `bounds` mutable.
4. **No chunking.** Each merged mesh is culled whole, by one bounding sphere. At the bench camera, culling saved 3%
   of instances (brief 19), so little is lost; chunks would bring the draws back.

## What to do

1. **Measure before.** On today's tree, run `npm run bench -- <folder> hollow` twice and note `uptime`'s load
   average with each. Record `counters.glDrawCalls` and `counters.drawInstances` (mean and p95) and `timers.frame`.
   Add a count that stays after the change: `profiler.add("draw.static", n)` each frame, where `n` is the number of
   draws `frame()` pushed for the ground, the territory, the hearth, the graveyard and the homes (Farm records
   `draw.sprites` the same way). Also
   record how many times `TerritoryInstanceCache` built over a run. Start `npm run hollow` and take the four
   screenshots with brief 19's script: `node corpus/verify/2026-11-23-hollow-culling/shot.mjs
   http://localhost:5175/ corpus/verify/<date>-hollow-static-merge/before` (it writes `<prefix>-0.png` to `-3.png`).
   **Stop rule:** if `draw.static` averages under 5 (a merge into two would save fewer than 3 calls), stop here.
   Write the numbers in the outcome and close the brief as measured, not built.
2. **`releaseMesh`** in `renderer3d.ts`, with tests on the fake GL in `renderer3d.test.ts`: upload and release ten
   times and the GL objects created equal those deleted; release drops the instance buffer; drawing a released
   handle throws; releasing twice is harmless.
3. **The territory materials** in `materials.ts`, appended to `WORLD_MATERIAL_KEYS` (the agent keys come after the
   world keys, and the combined resolver in `app.ts` picks the new indices up). A test: for community ids 0 to 16,
   the material a tile resolves to has the RGB of `territoryTintColor(id)`.
4. **The two merged meshes** in `static-draws.ts`. Build each with `translate` and `merge` from
   `@engine/core/render3d`, at the same translations `frame()` uses today: tiles at `[gx, gy, groundHeightAt(gx, gy)
   + TERRITORY_TINT_Z_OFFSET]`, the hearth and graveyard at `[gx + 0.5, gy + 0.5, groundHeightAt(gx, gy)]`, homes at
   `[pos.x, pos.y, groundHeightAt(round(pos.x), round(pos.y))]`. Take `uploadMesh` and `releaseMesh` as
   arguments, so the tests can pass fakes. Time each build and upload with `profiler.time("static.merge", …)`. Tests: two frames on one snapshot build each mesh once; a changed tile, tile
   count, community id, household, member count or hearth position rebuilds the right mesh; the old handle is
   released on a rebuild.
5. **Use them in `frame()`.** Push the two merged draws in place of the ground, territory, hearth, graveyard
   and home draws. Remove what becomes unused
   (`TerritoryInstanceCache`, `packGroundInstance`, the separate hearth, graveyard and home draws). `npm run check`
   runs knip, which flags an export nothing reads.
6. **Measure after**, the same way as step 1, at a similar load. Take the screenshots with the prefix `after`.
7. **The rebuild's cost.** Sum `static.merge` over the run and divide by the frames drawn. If that is above
   0.05 ms a frame, take the homes out of the changing mesh (they go back to one draw per member count) and measure
   again. Say which you shipped and why.

## Acceptance

- `counters.glDrawCalls` mean falls by at least 3 against the before runs (at least 2 if step 7 took the homes
  out), and its p95 stays at or under the 43 ceiling. `counters.drawInstances` falls, since the territory tiles and
  homes become one instance. Before and after numbers, with the load average, are in the outcome and the verify
  folder.
- `draw.static` reads 2 after (or 2 plus the home draws, if step 7 took them out), against its before value.
- `static.merge` is recorded: build count, mean and p95, and its cost per frame drawn under 0.05 ms.
- The renderer, materials and static-draws tests above pass.
- The four poses before and after show the same ground, territory colours, houses, hearth and graveyard; nothing
  missing, no z-fighting, no seams. Crop a territory edge at one pose and count the pixels that differ by more
  than one level per channel; put the count in the outcome.
- No hex literal is added (`palette.test.ts` passes). No shader file changes.
- `git diff --stat` shows nothing under `games/hollow/sim-core` or the worker, so the sim baseline cannot move and
  no export diff is needed.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Deploy Hollow from the vps-deploy checkout: `node cli.ts hollow deploy`.
- On the laptop, open Hollow with `?bench&profile` before the deploy and again after it, and send both exports.
  Today: GPU p95 4.4–4.7 ms and interval p95 8.5 ms at 1920×945. The merge should leave the GPU time where it is.

## Owner decisions

- None open. This is a render-only optimization, and it ships if the counters hold and the views match.

## Outcome (2026-11-26)

Built as specified, homes included. Evidence: [2026-11-26-hollow-static-merge](../../verify/2026-11-26-hollow-static-merge/README.md).
brief-board was not available in this session, so the board was not updated.

- **Stop rule.** `draw.static` read 5.00 in every frame of both before runs (ground, territory, hearth, graveyard
  and one home draw: every household had the same member count), not under 5, so the brief went ahead.
- **`releaseMesh`** in `renderer3d.ts` deletes the VAO, the vertex and index buffers and the instance buffer, and
  marks the handle released; `render` throws on a released handle, a second release does nothing, and with the
  device lost it only forgets the handle. While there, `_instanceBufferFor` now deletes the smaller instance buffer
  it replaces when a draw outgrows it (it was dropped without a delete). Tests on the fake GL: ten upload, draw and
  release rounds delete every buffer and VAO they created, the instance buffer goes with the mesh, a released
  handle throws, a double release deletes nothing more, a lost device deletes nothing, a grown buffer is deleted.
- **Eight territory materials**, `territory.<role>` in `COMMUNITY_COLOR_ROLES` order, appended to
  `WORLD_MATERIAL_KEYS`; each colour is `territoryTintColor` for its slot. `territoryTile` (the white material) is
  gone and `buildTerritoryTileMesh` takes its material key. A test checks community ids 0 to 16.
- **Two merged meshes** in `static-draws.ts` (`StaticMeshes`, which takes the upload and release functions):
  fixed (ground, hearth, graveyard) and changing (territory tiles, homes), keyed as the brief says, with no
  allocation to compare. `app.ts` updates them only when a new snapshot arrives, so `householdLayout` and
  `HomeRegistry` now run per snapshot, not per frame; `TerritoryInstanceCache`, `packGroundInstance` and the
  separate hearth, graveyard and home draws are gone.
- **Bench** (two runs each, load 0.05 to 1.6): `glDrawCalls` mean 35.70 and 35.87 before, 32.82 and 32.79 after
  (p95 41 to 38, under the 43 ceiling); `drawInstances` 96.3 and 96.1 to 63.2 and 63.2 (p95 107 to 66);
  `draw.static` 5 to 2; `frame` 0.59 and 0.57 ms to 0.58 and 0.58 ms. **The mean of the GL means fell by 2.98, not
  the 3.00 the acceptance asks for.** A per-kind count (one temporary run each) shows why: the static draws went
  from 5.00 to 2.00 GL calls in every frame (none was culled before), and the agents' draws, which this brief does
  not touch, read 28.77 in the before run and 28.88 in the after run. The saving is exactly 3 a frame; the agents
  move the total by about 0.1 from run to run.
- **`static.merge`**: 14 builds a run after the warm-up (the old territory cache built 11 times; household changes
  add the rest), mean 0.29 to 0.32 ms, p95 0.6 to 0.7 ms, so 0.0024 to 0.0027 ms per frame drawn, well under
  0.05 ms. The homes stay in the changing mesh.
- **Views.** The four poses match before and after. At a fixed tick (300, paused and stepped), 15 pixels of the 3D
  view differ by more than one level outside the agents' run-to-run noise: 10 HUD digits and 5 single pixels on
  house edges (the vertices are now translated on the CPU in double precision). A territory-edge crop differs in 1
  of 1,440 pixels, on an agent's outline at its corner; the tiles themselves do not differ.
- Nothing under `games/hollow/sim-core` or the worker changed, and no shader changed. `palette.test.ts` passes.

Owner steps: deploy with `node cli.ts hollow deploy`, and take the `?bench&profile` laptop reading before and after
it. The GPU time should not move (same triangles).
