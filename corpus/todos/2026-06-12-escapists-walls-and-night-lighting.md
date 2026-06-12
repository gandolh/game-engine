---
title: Escapists-style wall rendering + local light sources
created: 2026-06-12
status: open
tags: [render, art, lighting]
---

# Escapists-style wall rendering + local light sources

## Decisions (grilled 2026-06-12)

Three asks were untangled; scope is **#1 + #3**. **#2 already exists.**

### #1 — Escapists-style block walls (NEW WORK)

Walls today are flat edge-bands: `computeWalls()`
([render-systems/](../../packages/sim-core/src/render-systems/)) scans region
tiles and emits an edge band on each ocean-facing side at layer 4. Replace this
with **chunky blocks** echoing *the original The Escapists* (NOT Escapists 2): a
distinct **top face + shaded side face + heavy outline** — depth-without-3D.
Verify against actual original-Escapists screenshots before implementing. New
atlas frames; keep bridge mouths open (edges only cover region tiles, never road
tiles — preserve that invariant).

### #2 — Global night darkening (ALREADY DONE — tuning only)

A full clock-driven day/night wash already exists:
[day-night.ts](../../packages/farm-valley/src/render/day-night.ts) `washFor()` +
`nightnessFor()`, per-season night tint, dawn/dusk smoothstep ramps, peak night
alpha up to 0.42 (winter), applied in `endFrame`. **Nothing to build** unless you
want it tuned darker/recolored. Note it as existing; optional tuning pass.

### #3 — Local light sources (NEW WORK)

No point-lights exist today, only the global wash. Add **warm local lights** that
cut through the night wash around static emitters: forge, campfire, casino neon,
lit windows, lanterns. Render-only, deterministic (keyed to static emitter tiles +
the in-game clock — never wall-clock). EDG32 anchor colors (interpolated tint not
per-pixel palette-locked, same rule as the existing wash). Synergises with #1:
Escapists side-faces give surfaces for lights to warmly shade at night.

## Acceptance

- Walls render as Escapists-style depth blocks (top + side face + outline); bridge
  mouths stay open; palette guard green.
- Local light sources visibly warm emitter neighbourhoods at night, layered over
  the existing global wash; deterministic off the in-game clock.
