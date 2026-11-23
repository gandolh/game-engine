# Hollow's per-frame allocations (brief 24)

Hollow's heap bytes allocated per frame over the `?bench` scene, before and after the brief. Seed 42, 1280x800,
headless Chromium with SwiftShader, load average 15 to 23 from unrelated processes. Commit `27b9722d`.

## Tools

`heap.mjs` is brief 20's profiler (a copy lives in [2026-11-23-allocations](../2026-11-23-allocations/)): start
`npm run hollow`, then `node ../2026-11-23-allocations/heap.mjs "http://localhost:5175/?bench&profile" out.json`.
`shot.mjs` is brief 19's script, unchanged: `node shot.mjs http://localhost:5175/ <prefix>`.

## Bytes a frame, ranked

| Before (451 K, 1,059 frames) | After (269 K, 1,004 frames, -40%) |
|---|---|
| 112 K `boundsOf` (called by `instanceAABB` for every agent) | 50 K `separateCircles` |
| 34 K `queryRadius` | 30 K `agentModelMatrix` |
| 30 K `separateCircles` | 23 K `onMessage` (snapshot receive, untouched) |
| 30 K `agentModelMatrix` | 18 K `frame` |
| 23 K `instanceAABB` | 13 K `queryRadiusInto` |
| 22 K `onMessage` | 12 K `translation` |
| 20 K `frame` | 10 K `multiply` |
| 15 K `translation` (territory tiles and households) | 8 K `householdLayout` |

A second run of the old code (`hollow-before-rerun-heap.json`) gives 448 K, so the before number is steady. The
after sites moved up the list because the top ones left, not because they grew. Inlining by the JIT shifts bytes
between `separateCircles` and `queryRadiusInto` from run to run; their sum is about 60 K in both after runs.

## Fixes

1. Territory and ground instances: built when the territory changes (`static-draws.ts`), the packed buffer kept.
2. Agent bounds: the mesh's local bounds found once, no corner arrays (`agent-bounds.ts`).
3. `separateCircles`: one hash for its four passes (`reset()` keeps the buckets), neighbours queried into one
   array (`queryRadiusInto`), the hash's unused position map removed.
4. `separatedAgentPositions`: its body objects reused.
5. `SpatialHash.insert` and the query computed their cell without a tuple per call.

## Bench counters (same code paths, five runs)

| Run | `glDrawCalls` mean | `drawInstances` mean | heap `drops` | display ticks |
|---|---|---|---|---|
| before | 35.51 | 95.69 | 8 | 1322 |
| before, rerun (old code restored) | 35.65 | 95.98 | 12 | 1491 |
| after | 35.72 | 96.25 | 19 | 1447 |
| after 2 | 35.74 | 96.01 | 18 | 1510 |
| after 3 | 35.59 | 95.75 | 18 | 1465 |

The counters move by 0.2 from run to run with the old code too (the sim keeps running, so agents are at other
places and culling keeps a few more or fewer). Drops are not lower, see the outcome.

`before-N.png` and `after-N.png` are the views of brief 19's script; the ground, houses, trees and the hearth are
identical, the agents differ because the sim keeps running.
