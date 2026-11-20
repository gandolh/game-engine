# Sprite sort only on change

status: open. Promote when a bench scene shows the per-frame sprite sort above 1 ms at p95 on a
reference device.
created: 2026-11-20
context: the 60 fps plan, [frame-budget.md](../wiki/frame-budget.md).

The WebGL2 renderer sorts its whole sprite queue with `compareSprite` every frame
(`engine/core/src/render/webgl2/renderer.ts`, `endFrame`). The sorted order also decides how many
draw groups a frame costs, so a stale order would split batches silently, not only draw sprites in
the wrong order. The 2026-06-12 real-GPU profile never showed the sort
([performance.md](../wiki/performance.md)), so this stays a todo until a number says otherwise.

If it is promoted, the usual answers are:

- a numeric sort key packed from layer, y and texture, sorted with a typed-array sort;
- sorting only when the set of sprites or a sort field changed, with a test that the order matches a
  full sort.
