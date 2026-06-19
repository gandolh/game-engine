---
title: "Citadel 12 — BFS building clustering into composite silhouettes"
created: 2026-06-19
status: open
tags: [citadel, render, speculative]
---

# Citadel 12 — BFS building clustering

**Lineage:** tiny-world-builder's `bfsHouseCluster` + `tryComposite` + `trySquare` — detects
adjacent house cells and renders them as a single larger unified shape (L, T, +, or 2×2
square) instead of N separate footprints, producing organic village street patterns
automatically from how the player places buildings.

**Target:** Citadel render only — [building-renderer.ts](../../packages/citadel/src/render/building-renderer.ts),
over the building snapshot array. **Render-only, zero determinism impact.**

## Idea

Flood-fill adjacent same-type buildings (start with houses), then draw the cluster as one
composite silhouette rather than repeated identical footprints. Reads as a real village
block, not a grid of stamps.

## Caveat (priority)

Speculative — only pays off if housing density actually becomes visually busy, and it
overlaps with the not-yet-built **tier visual differentiation** work. Lower priority than
[citadel-11 autotiling](2026-06-19-citadel-11-adjacency-autotiling.md), which serves the
load-bearing connectivity system. Capture now; schedule after the higher-leverage render items.

## Acceptance

- Adjacent house clusters draw as one composite L/T/+/square shape; single buildings unchanged.
- No sim change; deterministic from snapshot data; `EDG.*` colours; typecheck + tests green.
