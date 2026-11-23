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

## Outcome (2026-11-23)

- **What.** `GhostGrid` (`engine/core/src/render/webgl2/ghost-grid.ts`) replaces the scan in `_ghostCovered`.
  Once a frame, when the plain scan's estimated work is at least `GHOST_GRID_MIN_WORK` (see the controller review below), it buckets every sprite that can cover a ghost
  (not occludable, below the UI layer) into a uniform grid over the view: one cell about the mean occluder's
  width, at most 128 cells along an axis, in compressed rows reused between frames. A candidate is tested only
  against the entries in the cells its rectangle touches. A binary search over each cell's ascending queue
  indices skips the sprites at or before the candidate, so "only later sprites" holds. The old scan stays as
  `ghostCoveredLinear` in the same file, as the reference the tests compare to.
- **Timing.** `lastDrawStats.ghostMs` times the whole ghost pass (grid build, the checks and packing the
  covered ghosts) under the `profileUi` flag; Farm records it as `render.ghost`.
- **Worst case** (`ghost-grid.test.ts`: 300 occluders sorted ahead of 4,000 sprites on a 2,400 square, the
  plain scan's worst case, in Node): the plain check 100.9 ms, the grid (build plus every check) 2.4 ms,
  about 43 times faster. The test asserts at least 5 times.
- **Same answers.** The test compares the grid to the plain scan on eight seeds of 400 sprites (half snapped
  to an 8-unit lattice so edges sit on cell borders, some lifted with `z`, some on UI layers, a third
  occludable), on a queue with sprites before and after an occluder, on an empty queue, and on arrays reused
  over three frames of growing size.
- **Farm bench** (headless, SwiftShader, 1280x800): `draw.ghostGroups` 0 before and after; `render.ghost`
  recorded, mean 0.47 ms and p95 1.5 ms. Farm's scene has occluders but nothing covers them, so that is the
  grid build plus the checks with no ghost drawn. The before run had no timer to compare with, and the two
  runs differ in length (90 and 180 frames). Draw groups 1 in both.
- **Checks.** `npm run check` exits 0; `bash corpus/lint.sh` passes.

### Controller review

The first version built the grid whenever the queue held an occludable sprite. Farm's occluders have few
sprites after them, so the old scan was nearly free and the build was not. Ghost pass in Farm's headless
bench (mean): old linear scan 0.003 ms (timed by the controller on 2b901117), grid only 0.78 ms (p95 3.5 ms),
hybrid 0.007 ms (p95 0.1 ms, the timer's step; 227 frames, `draw.ghostGroups` 0). The fix: `endFrame` first
estimates the scan's work, the sum over candidates of the sprites after each (`ghostLinearWork`, O(candidates)),
and builds the grid only at 20,000 sprite tests or more (`GHOST_GRID_MIN_WORK`), else uses
`ghostCoveredLinear`. The constant is a judgement from two points: Farm's scene is far below it, and the 300 x
4,000 scene (about 1.2 million tests) is far above it, where the grid is 43 times faster. The renderer exposes
`ghostUsesGrid` for tests, which pin the choice for a small scene and for a crowd behind 150 occluders. The
equivalence suite compares the grid to the plain scan directly, so both paths give the same answers.
