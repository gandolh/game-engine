# Hollow 3D culling

status: step 1 (frustum culling) built as brief 19 on 2026-11-23 ([19](../briefs/done/19-hollow-culls-what-the-camera-cannot-see.md)); step 3 answered (no portal gap); step 2 (merging static geometry) promoted on 2026-11-26 to brief 31 ([31](../briefs/todo/31-hollow-merges-its-static-geometry.md)), whose closeout moves this todo to `todos/closed/`. Promoted by the owner's call to
build light optimizations without waiting for a trigger. Its trigger was to promote it when Hollow's bench breaks the bar on the reference laptop, or runs clearly
slower framed in the portal than opened directly.
created: 2026-11-20
context: the 60 fps plan, [frame-budget.md](../wiki/frame-budget.md).

Hollow is the only 3D game. `engine/core/src/render3d/webgl2/renderer3d.ts` already draws repeated
meshes with `drawElementsInstanced` and culls back faces, but it draws every instance whether the
camera sees it or not. On 2026-11-03, Hollow framed in the portal ran 50 ms per frame against 33 ms
direct, on SwiftShader under load ([portal.md](../wiki/portal.md)). That number says nothing about a
real GPU, and brief 07 reads it on one.

If it is promoted, the standard steps in order:

1. Frustum-cull instances against the camera's planes on the CPU, using a bounding sphere per mesh.
2. Merge static geometry that never moves, such as ground and buildings, into one buffer per
   material.
3. Find out why the frame costs more inside the portal's iframe. Check the canvas size against the
   iframe size and the DPR, and whether the portal page itself animates.
