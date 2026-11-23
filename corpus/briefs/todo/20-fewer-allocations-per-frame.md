# Task 20: fewer allocations per frame in Farm and MateQuest

**Origin:** the [allocation-free frames todo](../../todos/2026-11-20-allocation-free-frames.md), promoted by
the owner on 2026-11-23 with the rest of the measure-first todos: build light optimizations that are not too
heavy, complex or wide ([decisions.md](../../wiki/decisions.md) → Frame budget). The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** briefs 15 and 16, which rewrite two of Farm's per-frame paths. Profile after them, not
before.

## Context

A game that allocates every frame makes garbage, and the collector pauses at a moment it chooses. On the
laptop every game collects about every 2 s, and two allocate fast: Farm's heap swings between 16 and 55 MB,
MateQuest's between 13 and 69 MB ([real-gpu-readings.md](../../wiki/real-gpu-readings.md), "The heap").
Collection costs Farm only 0.10 ms a frame on the laptop, and no long frame lined up with a drop, but a
slower phone pays more for the same garbage.

ECS query iteration is already pooled and the sprite queue is a persistent array
([performance.md](../../wiki/performance.md), "Already done"). Nobody has looked at the rest of the frame.

## Files you OWN

- Farm's and MateQuest's client render paths (`games/farm/client/src/main/`, `games/farm/client/src/render/`,
  `games/mathquest/client/src/`), `engine/ui/src/` and `engine/core/src/render/`, **only** at the allocation
  sites the profile ranks, and their tests
- `corpus/verify/<date>-allocations/` (the before and after profiles and the ranked sites)
- `corpus/` pages for this brief: the outcome, `log.md`, the todo's status line,
  [frame-budget.md](../../wiki/frame-budget.md) and [real-gpu-readings.md](../../wiki/real-gpu-readings.md)

## Files you must NOT touch

- Sim code (`games/*/sim-core`): allocations there run in the worker or on the server, not in the frame.
- Any public signature used by another game. A fix that would change one is listed in the outcome for a
  later brief instead.

## What to do

1. **Profile the allocations.** Over each game's bench scene in headless Chromium, take a sampling heap
   profile through the DevTools protocol (`HeapProfiler.startSampling`, then `stopSampling`), as the driver
   in `corpus/verify/2026-11-23-real-gpu-baseline/tools/bench-win.mjs` takes a CPU profile. Allocation counts
   are CPU-side, so a headless run measures them faithfully. Rank the allocating functions by bytes, through
   the build's source maps.
2. **Fix the top five sites per game**: closures, temporary arrays and objects, and strings built every
   frame. Reuse arrays and objects across frames, and hoist closures out of the frame.
3. **Profile again.**

## Acceptance

- The ranked sites before and after are in `corpus/verify/<date>-allocations/` and the outcome.
- For each game, the bytes allocated per frame over the bench scene fall by at least a third, and the
  bench's heap `drops` count falls. Put both numbers in the outcome.
- No sprite, panel or screen draws differently: the headless bench's counters (draw groups, UI quads,
  GL draw calls) are unchanged.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Deploy the two games from the vps-deploy checkout: `node cli.ts farm-valley deploy` and
  `node cli.ts mathquest deploy`, plus `citadel` if a shared `engine/` file changed.
