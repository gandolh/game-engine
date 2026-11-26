# Task 20: fewer allocations per frame in Farm and MateQuest

**Origin:** the [allocation-free frames todo](../../todos/closed/2026-11-20-allocation-free-frames.md), promoted by
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

## Outcome (2026-11-23)

Built in two runs (the owner paused the first after its first step). Numbers, ranked sites and the profiler are
in [the verify folder](../../verify/2026-11-23-allocations/README.md).

- **Farm:** 2.75 MB a frame before, 1.54 MB after (-44%, -50% without the wire decode). The bench's heap `drops`
  fell from 15 to 8. Fixed: Farm's bridge and wall sprites are static or pooled (`occluders.ts`), the text
  layout is cached per string, `drawText` builds no intermediate array, the UI quads come from a pool
  (`UISurface.quad`, reset at `begin()`), and `_packSprite` and the quad pack loop make no tuples or uv objects.
- **MateQuest:** the map screen's keyline now uses one mutable painter (no 8 painters and closures per prop),
  the depth-sorted props are cached with the ground (keyed with `playTop` and `playBottom`) and filtered in a loop,
  and `render` builds its painter once. Per map frame the map-screen sites went from about 3.0 MB to about
  0.6 MB (-80%). The whole-scene figure fell from 854 KB to 203 KB a frame in the first pass; the last run was
  map-heavy (30 map, 30 combat frames, 424 KB) because the machine was loaded, so the mix differs and the
  per-map-frame figure is the fair one. The bench's `drops`: 12 before over 270 mixed frames, 10 after over 30
  all-map frames; not comparable per frame.
- **Counters unchanged.** Farm: draw groups 1, UI quads 1,778 and GL draw calls 93.6 before (rerun at the same
  load) and after. The first "before" (1,821 and 135) was taken at a different load. MateQuest: UI quads p95
  20,583 (a map frame) before and after.
- **Missed or partial.** MateQuest's bench "drops" cannot be compared because the screen mix differs. What is
  left of the MateQuest map cost is argument boxing across ~10,000 rects a frame; fewer rects is a drawing change.
- **Deviation.** `games/farm/sim-core/src/render-systems/occluders.ts` changed although the brief fences off
  sim-core: Farm's render pushes live there and run on the client. Only render pushes changed; `@farm/sim-core`'s
  tests pass.
- **Left for a later brief.** Farm's `ws.onmessage` JSON decode (about 310 KB a frame, the wire format);
  `pushSnapshotSprites` (135 KB, needs a pool the renderer can hold); wealth-graph `detectCrossings` Map and Set
  (65 KB); batching MateQuest's triangle rows.
