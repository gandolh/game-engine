# Task 17: the ghost check on a grid

**Origin:** the [ghost pass todo](../../todos/2026-11-20-ghost-pass-scan.md), promoted by the owner on
2026-11-23 with the rest of the measure-first todos: build light optimizations that are not too heavy,
complex or wide ([decisions.md](../../wiki/decisions.md) → Frame budget). The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** brief 15, which changes the sort in the same `endFrame`. One builder at a time in this file.

## Context

The renderer redraws occludable sprites, such as walls, cliffs and trees, as see-through "ghosts" when
something stands behind them. `_ghostCovered` (`engine/core/src/render/webgl2/renderer.ts`, called from
`endFrame`) checks each candidate against every later sprite in the sorted queue. That is quadratic in the
worst case and grows with how much of the world is in view at the widest zoom.

On the laptop it costs about 0 ms in Farm's bench scene, which draws no ghost groups
([real-gpu-readings.md](../../wiki/real-gpu-readings.md)), and Citadel's whole `render.endFrame` is
0.6–0.8 ms at p95. So this brief is about the worst case, not today's scene: a crowd behind a wall at the
widest zoom.

## Files you OWN

- `engine/core/src/render/webgl2/renderer.ts` (`_ghostCovered`, its callers in `endFrame`, and a
  `ghostMs` on `lastDrawStats`), plus a new helper file beside it if the grid reads better there
- Their tests
- `games/farm/client/src/main/render-loop.ts`, only to record `render.ghost` next to `draw.ghostGroups`
- `corpus/` pages for this brief: the outcome, `log.md`, the todo's status line and
  [frame-budget.md](../../wiki/frame-budget.md)

## Files you must NOT touch

- Which sprites become ghosts and how a ghost looks. The result of every check stays the same.

## What to do

1. **Time it first.** Put the check's milliseconds on `lastDrawStats` as `ghostMs`, record them in Farm as
   `render.ghost`, and write a test scene that makes the worst case: a few hundred occluders and a few
   thousand sprites behind them. Time the current check on it.
2. **Bucket by cell.** Once per frame, put the sprites after each occluder into a uniform grid over the view
   (cell size about one occluder's width), and test each ghost candidate only against the sprites in the
   cells its rectangle touches, still only against sprites later in the queue. Reuse the grid's arrays
   across frames.

## Acceptance

- A test runs the old and the new check on random scenes (several seeds, many overlaps, sprites on cell
  borders) and gets the same answer for every candidate.
- The worst-case test scene runs the check at least 5 times faster. Put both times in the outcome.
- Farm's headless bench shows the same `draw.ghostGroups` before and after, and `render.ghost` recorded.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Deploy the three games that draw through this renderer, from the vps-deploy checkout:
  `node cli.ts farm-valley deploy`, `node cli.ts citadel deploy` and `node cli.ts mathquest deploy`.
