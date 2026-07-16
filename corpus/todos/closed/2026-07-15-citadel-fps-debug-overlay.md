---
title: "Citadel — FPS counter + debug corner overlay like Farm Valley's"
created: 2026-07-15
status: closed (2026-07-16, `43617b9` — reused the already-engine-hoisted DebugOverlay; bottom-right, dev-only)
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

## Resolution (2026-07-16)

The hoisting the todo asked for already existed: `engine/core/src/debug/overlay.ts` is the
game-agnostic overlay Farm wires in `main/panels.ts`. Citadel now instantiates the same component
(`main/debug-overlay-wiring.ts`) with the same 5 rows — fps, ms, tick, alpha, ents — where `alpha`
is the render-delay interp phase driving villager glide and `ents` = buildings+villagers+raiders.
Two deviations, both deliberate: (1) dev-only via `import.meta.env.DEV` (Citadel's established dev
idiom; Farm's overlay is ungated); (2) placed bottom-right, because Citadel's top-left is occupied
by the resource + siege HUDs — an additive `OverlayCorner` option landed on the engine overlay with
a default that keeps Farm pixel-identical. Browser-verified in the integrated build.
