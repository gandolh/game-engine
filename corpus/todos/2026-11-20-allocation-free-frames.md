# Allocation-free frames

status: built as brief 20 on 2026-11-23 ([20](../briefs/done/20-fewer-allocations-per-frame.md)), promoted by the owner's call to
build light optimizations without waiting for a trigger. Its trigger was to promote it when a bench export shows long frames that line up with drops in the JS heap,
which mark garbage collections.
created: 2026-11-20
context: the 60 fps plan, [frame-budget.md](../wiki/frame-budget.md).

A JavaScript game that allocates every frame makes garbage. The collector then takes a pause at a
moment it chooses, and the frame it lands in is late. The usual practice is no allocation in the
frame loop: pooled arrays, reused objects and no closures or temporary arrays per sprite. ECS query
iteration here is already pooled ([performance.md](../wiki/performance.md), "Already done"), and the
sprite queue is a persistent array. Nobody has checked the rest of the frame.

Brief 05 records `performance.memory` once a second in Chrome. A sawtooth with long frames at the
drops is the trigger. Then take an allocation profile in Chrome DevTools (Memory, "Allocation
sampling") over the bench scene and remove the allocations it ranks highest. Allocation counts are
CPU-side, so a headless run measures them faithfully.
