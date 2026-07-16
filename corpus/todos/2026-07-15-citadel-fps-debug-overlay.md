---
title: "Citadel — FPS counter + debug corner overlay like Farm Valley's"
created: 2026-07-15
status: open
tags: [citadel, ui, debug]
---

# Citadel: FPS counter and debug readouts in a corner, like Farm Valley

Add the corner FPS counter and the other debug readouts Farm Valley shows to
the Citadel client, so the two games have the same at-a-glance perf/debug
overlay.

## Context

- Farm Valley already renders this overlay in its client — find it there and
  reuse/port it (ideally by hoisting anything shareable into `@engine/ui` or
  `@engine/core` rather than copy-pasting, per the engine-never-imports-game
  layering).
- All colors must come from `CITADEL_PAL.*` (Apollo-46) on the Citadel side —
  the palette guard test is per-scope.
- See [wiki/citadel-overview.md](../wiki/citadel-overview.md) and
  [wiki/performance.md](../wiki/performance.md) for what's already measured.

## Acceptance

Citadel client shows the same corner overlay (FPS + the other readouts Farm
Valley has) in a corner of the screen.
