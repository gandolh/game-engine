# Sprite sort only on change

status: closed 2026-11-26. Promoted to brief 15 on 2026-11-23, done the same day ([15](../../briefs/done/15-the-sprite-sort-under-1-ms.md)).
Its trigger, the per-frame sprite sort above 1 ms at p95 on a reference device, fired on the laptop:
`compareSprite` alone takes 1.07 ms per frame on average in Farm's bench scene
([real-gpu-readings.md](../../wiki/real-gpu-readings.md)).
created: 2026-11-20
context: the 60 fps plan, [frame-budget.md](../../wiki/frame-budget.md).

The WebGL2 renderer sorts its whole sprite queue with `compareSprite` every frame
(`engine/core/src/render/webgl2/renderer.ts`, `endFrame`). The sorted order also decides how many
draw groups a frame costs, so a stale order would split batches silently, not only draw sprites in
the wrong order. The 2026-06-12 real-GPU profile never showed the sort
([performance.md](../../wiki/performance.md)), so this stays a todo until a number says otherwise.

If it is promoted, the usual answers are:

- a numeric sort key packed from layer, y and texture, sorted with a typed-array sort;
- sorting only when the set of sprites or a sort field changed, with a test that the order matches a
  full sort.
