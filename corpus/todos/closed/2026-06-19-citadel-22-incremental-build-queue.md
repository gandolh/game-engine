---
title: "Citadel 22 — Incremental build queue + per-frame budget"
created: 2026-06-19
status: open
tags: [citadel, engine, render, perf, multiplayer]
---

# Citadel 22 — Incremental build queue with a per-frame budget

**Lineage:** tiny-world-builder drains a `pendingGhostBoards` queue with a **small per-frame
budget**, and `maybeEnsureGhostBoardsAroundTarget()` gates enqueue work so panning never
triggers a synchronous rebuild. Static geometry only rebuilds when underlying cells change.

**Target:** engine + Citadel render.

## Idea

A generic per-frame work budget for incremental geometry/bake builds, so heavy rebuilds
(re-bake on placement, future terrain streaming) are spread across frames and never hitch
on a pan.

## ✅ UN-PARKED (2026-06-19) — spine item K

Was parked: tied to ghost-world streaming ([citadel-21](2026-06-19-citadel-21-render-windowed-grid.md))
and large maps with no consumer. The **256×256 MP world**
([citadel-29](2026-06-19-citadel-29-world-256-townhall.md)) is now the committed consumer, so
this is **un-parked**. Spine position **K (depends on
[29](2026-06-19-citadel-29-world-256-townhall.md))**, paired with brief 21.

## Acceptance

- Heavy geometry rebuilds drain on a per-frame budget; panning a streaming world stays smooth.
- Render-only; deterministic order if it ever feeds anything sim-visible.

## ✅ INTEGRATION SHIPPED (2026-06-19) — paired with brief 21; GPU runtime acceptance pending

Shipped together with [21](2026-06-19-citadel-21-render-windowed-grid.md) (see its
status for the full write-up). The `IncrementalQueue` (22) is the re-bake gate in
`RenderWindowController`: each frame the controller computes the desired camera
window; if it changed it coalesces (clear + enqueue the latest — only the newest
window matters) and drains `REBAKE_BUDGET=1` re-bake. So a fast pan enqueues work
that drains on the NEXT frame at the budget cap — never a synchronous re-bake in
the input handler (the brief's "panning never triggers a synchronous rebuild").
`drain` is FIFO, so if the budget is ever raised the order stays deterministic.

**Verified headless** (engine + controller tests, typecheck) per brief 21.
**Remaining (real-GPU only):** the actual per-frame smoothness under a streaming
pan — verifiable only in the browser, deferred to the user.
