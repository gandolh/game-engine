---
title: "Citadel 22 — Incremental build queue + per-frame budget"
created: 2026-06-19
status: deferred
tags: [citadel, engine, render, perf, premature]
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

## ⚠️ PREMATURE — capture only, do not implement now

This is tied to **ghost-world streaming** ([citadel-21](2026-06-19-citadel-21-render-windowed-grid.md))
and large maps, neither of which we're building. Citadel bakes its small static layer once and
re-bakes placements cheaply — there is **no current hitch to fix**. Implement only when a
streaming or large-world consumer exists. Keep the *pattern* (budgeted incremental work) in
mind; the engine scheduler already proves the general idea.

## Acceptance (only if unblocked)

- Heavy geometry rebuilds drain on a per-frame budget; panning a streaming world stays smooth.
- Render-only; deterministic order if it ever feeds anything sim-visible.
