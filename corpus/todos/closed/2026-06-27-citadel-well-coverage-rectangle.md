---
title: "Citadel — well coverage area is an 8×6 rectangle, not a Manhattan diamond"
created: 2026-06-27
status: done
resolved: 2026-06-27
tags: [citadel, sim, render, fire, well, coverage, ux]
---

> **Done 2026-06-27.** The well's reach was a Manhattan **radius 5** (a diamond);
> it is now an **8-wide × 6-tall rectangle** centred on the well. Added
> `SERVICE_RECTS` + a `coversRect(type, cx, cy, px, py)` helper in
> [building.ts](../../../games/citadel/sim-core/src/entities/building.ts) (single
> source of truth; even spans anchor the extra col/row to +x/+y → cols cx-4…cx+3,
> rows cy-3…cy+2) and removed `well` from `SERVICE_RADII`. The fire system's
> `_hasWellNear` ([fire-system.ts](../../../games/citadel/sim-core/src/systems/fire-system.ts))
> now tests `coversRect("well", …)`. Client-side, `rectCatchmentTiles` +
> `serviceCatchment(type, cx, cy)` ([coverage.ts](../../../games/citadel/client/src/render/coverage.ts))
> dispatch on shape so the placement ring previews the well's rectangle (and
> diamond services keep their Manhattan ring); [main.ts](../../../games/citadel/client/src/main.ts)
> uses the unified accessor. New `coversRect` unit test + `rectCatchmentTiles` /
> `serviceCatchment` client tests. RNG-free → determinism preserved; on-palette
> (overlay reuses existing tints). See [log.md](../../log.md).

# Citadel — well coverage is a rectangle, not a diameter-based shape

## Problem

The well's fire-suppression reach was a Manhattan **radius** (`SERVICE_RADII.well
= 5`), which renders as a **diamond** in tile space — corners clipped, edges
tapered. The wanted area is a plain **rectangle**.

## Wanted

The well covers a **rectangle: 8 tiles wide × 6 tiles tall**, centred on the
well, with crisp straight edges (corners included, unlike a diamond).

## Notes

- Wells are *fire mitigation*, not a need (`needs-happiness` doesn't score them),
  so the only gameplay consumer is `fire-system._hasWellNear`. The placement ring
  is the only visual (wells aren't in the `C` coverage overlay, which is the three
  needs).
- Kept one source of truth: `SERVICE_RECTS` + `coversRect` in sim-core; the client
  re-derives the same rectangle geometry (no second authority). Future rectangular
  services just add a `SERVICE_RECTS` entry.

## Acceptance

- A well suppresses fire ignition across an 8×6 rectangle (corners included),
  verified by the `coversRect` unit test and the existing well-mitigation
  phase-4.5 tests (still green).
- The placement ring previews the rectangle, not a diamond.
- Determinism unchanged (pure geometry, no RNG).
