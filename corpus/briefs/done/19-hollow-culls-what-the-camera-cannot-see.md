# Task 19: Hollow culls what the camera cannot see

**Origin:** the [Hollow 3D culling todo](../../todos/closed/2026-11-20-hollow-3d-culling.md), promoted by the owner
on 2026-11-23 with the rest of the measure-first todos: build light optimizations that are not too heavy,
complex or wide ([decisions.md](../../wiki/decisions.md) → Frame budget). The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** none.

## Context

Hollow is the only 3D game. `engine/core/src/render3d/webgl2/renderer3d.ts` draws repeated meshes with
`drawElementsInstanced` and culls back faces, but it draws every instance whether the camera sees it or not:
each `DrawCall3d` carries a mesh, a packed `Float32Array` of instances and their count.

On the laptop Hollow holds 120 fps with 2.6–2.8 ms of GPU a frame, framed in the portal or not
([real-gpu-readings.md](../../wiki/real-gpu-readings.md)). The phone estimate puts its GPU just under the
assumed 4×, so fewer instances drawn is worth having. The bench scene orbits the town, so part of it is
always off screen.

The todo lists three steps. The third, the portal gap, was answered: there is none. The second, merging
static geometry into one buffer per material, is the larger change and is left for a later brief. This brief
is the first: frustum culling.

## Files you OWN

- `engine/core/src/render3d/webgl2/renderer3d.ts` and the render3d buffer helpers (`packInstances` in
  `engine/core/src/render3d/buffers.ts`), a new culling helper beside them, and their tests
- `games/hollow/client/src/render3d/app.ts`, which builds the draw calls, only to give each mesh its
  bounding sphere
- `corpus/` pages for this brief: the outcome, `log.md`, the todo's status line and
  [frame-budget.md](../../wiki/frame-budget.md)

## Files you must NOT touch

- Hollow's sim, its research surfaces and the chronicle.
- The 2D renderer.

## What to do

1. **A bounding sphere per mesh**, computed once from its vertices when the mesh is created.
2. **Six frustum planes per frame** from the view-projection matrix (the standard Gribb–Hartmann
   extraction).
3. **Cull before packing.** Keep only the instances whose transformed sphere is inside or crossing the
   frustum, packed into the same reused buffer, and draw that count. A draw call left with no instances is
   skipped.

## Acceptance

- Unit tests: a sphere fully outside each of the six planes is culled, one crossing a plane is kept, one
  inside is kept.
- Hollow's headless bench (`npm run bench -- <folder> hollow`) records fewer `drawInstances` on average
  than today's 99 at 1280×800, with the same scene. Put both numbers in the outcome.
- A screenshot of the orbit at the same moment before and after shows nothing missing at the frame's
  edges.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Deploy Hollow from the vps-deploy checkout: `node cli.ts hollow deploy`.

## Outcome (2026-11-23)

Built as specified, with one placement change: the culling runs inside `SceneRenderer3D.render`, on the packed
instance rows, instead of in `app.ts` before `packInstances`. That left Hollow's `app.ts` and
`render3d-demo.ts` untouched and gave every caller of the renderer the same cull.

- `engine/core/src/render3d/cull.ts`: `boundingSphereOf(mesh)` (bounding-box centre, radius to the farthest
  vertex), `extractFrustumPlanes(viewProj)` (Gribb-Hartmann, normalised; near is row 2 alone, because
  `perspective()` maps depth to [0, 1]), `sphereInFrustum`, and `cullInstances`, which reads each packed row's
  model matrix, moves the sphere centre through it, scales the radius by the matrix's largest axis scale, and
  copies the survivors in order into a reused scratch buffer.
- `MeshHandle.bounds` is computed once in `uploadMesh`. `render()` extracts the planes once per frame, culls
  each draw into `cullScratch` (grown, never shrunk), skips a draw with no survivors, and draws and counts the
  kept rows. The GL instance buffer is still sized for the whole draw, so a changing kept count never
  reallocates it.
- Hollow has one camera and no shadow pass, so there is nothing to cull against a second matrix.
- Conservative: a radius slack of 0.001, and a NaN or all-zero matrix keeps everything.
- Tests: `cull.test.ts` (each of the six planes: outside is culled, crossing is kept, inside is kept; a scaled
  instance whose unscaled sphere is outside but whose scaled sphere crosses the right plane is kept; an
  off-centre mesh sphere) and one in `renderer3d.test.ts` (draw counts and `lastDrawStats`).
- Bench (`npm run bench -- <folder> hollow`, 1280x800, load average about 20, seed 42):
  `drawInstances` mean 98.46 to 95.63 (p95 109 to 107); `glDrawCalls` mean 35.40 to 35.57 (p95 41 both). The
  saving is 3% because the default camera frames almost the whole town, so little is off screen; GL calls did
  not fall because few draws lost every instance. There is no GPU number: SwiftShader's frame times are
  stamped `gpu-not-real`. The `frame` CPU timer read 1.51 ms before and 1.77 after, within load noise.
- Screenshots at the same four camera poses before and after are in
  `verify/2026-11-23-hollow-culling/`; the static geometry at the frame's edges matches, nothing missing.
- `npm run check`: every step passed (lint 3570 warnings, ceiling 3573) except one Farm live-sim test that
  timed out in its 180 s hook under load 20 to 98 (`coral-fishing.integration.test.ts`); it passes alone in 71 s.
