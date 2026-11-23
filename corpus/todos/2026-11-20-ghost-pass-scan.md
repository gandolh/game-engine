# Ghost pass scan

status: promoted to brief 17 on 2026-11-23 and built the same day ([17](../briefs/done/17-the-ghost-check-on-a-grid.md)), by the owner's call to
build light optimizations without waiting for a trigger. Its trigger was to promote it when a sub-timer around the occluder ghost check shows it above 1 ms at p95 in
a bench scene.
created: 2026-11-20
context: the 60 fps plan, [frame-budget.md](../wiki/frame-budget.md).

The renderer redraws occludable sprites, such as walls, cliffs and trees, as see-through "ghosts"
when something stands behind them. `_ghostCovered` (`engine/core/src/render/webgl2/renderer.ts`)
checks each candidate against every later sprite in the queue. That is quadratic in the worst case,
and it grows with how much of the world is in view at the widest zoom.

Nobody has timed it alone. Brief 05's profiler makes a named sub-timer cheap. If it is promoted, a
uniform grid over the view (sprites bucketed by cell, each ghost tested against its own cells) makes
the check about linear.
