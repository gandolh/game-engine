---
title: "Citadel — terrain should read as shaped landforms, not flat tiles"
created: 2026-07-15
status: closed (2026-07-16, `b389832` — hillshaded terrain-kind heightfield; NW sun; on-palette)
tags: [citadel, render, terrain]
---

# Citadel: make the terrain look more shaped so landforms are readable

Make the Citadel terrain look more shaped/relief-like, so a player can tell at
a glance what kind of landform a specific zone is (hill, valley, ridge, flat,
shore, etc.).

## Context

- Purely visual readability: shading/hillshading, elevation-banded tinting,
  contour or slope cues — whatever fits the tile renderer. The underlying
  terrain data and sim behavior must not change.
- All colors from `CITADEL_PAL.*` (Apollo-46); no raw hex literals.
- See [wiki/citadel-overview.md](../wiki/citadel-overview.md) for how the
  Citadel map/renderer is put together.

## Acceptance

Looking at any zone of the Citadel map, the landform type is visually apparent
from the terrain rendering alone.

## Resolution (2026-07-16)

Key finding: the sim's TerrainGrid has NO elevation channel (and adding one would touch
determinism); the renderer's prior "relief" (`elevationField`) was client-side fBm noise
uncorrelated with real map features, banded by absolute height only. Fix: new
`render/hillshade.ts` derives a coherent heightfield from data the renderer already has — terrain
KIND per cell (water lowest → rough → grass → forest → stone highest) blended with the existing fBm
rolling — and hillshades it under a fixed NW sun (matching the SE building-shadow convention). Lit
slopes pick the type's LIGHT accent, away-facing its DARK accent, flat the base hue — all from the
existing per-type `DITHER_ACCENTS`, so the Apollo palette guard stays green. `elevationFill` retired
for `landformFill`; 24 unit tests on the pure relief/shade math. Sim data and behavior untouched.
Browser-verified: ridges/shores read; open-grass relief is deliberately subtle — if hills/valleys
in pure grass need to read stronger, tune `SLOPE_GAIN`/`HEIGHT_GAIN` in hillshade.ts. Deferred
minor: `ditherClusters` specks still bias by absolute fBm elevation, not the hillshade band.
