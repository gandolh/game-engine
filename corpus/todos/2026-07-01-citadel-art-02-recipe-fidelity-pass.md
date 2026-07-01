---
title: "Citadel art 02 — recipe fidelity pass (buildings / units / terrain / roads)"
created: 2026-07-01
status: todo
tags: [citadel, client, render, art, isometric, pixel-art, cozy]
---

# Citadel art 02 — recipe fidelity pass

The cozy-storybook fidelity pass over the sprite recipes, on the confirmed 2× base.
**Blocked by** [art-01 (2× flip gate)](2026-07-01-citadel-art-01-scale-flip-and-palette.md).
Rules: [style bible](../wiki/citadel-art-style.md). Consumes art-01's palette-role audit table.
Each sub-phase is independent and separately browser-verifiable, so ship them one at a time.

## Shared techniques (concrete — apply across sub-phases)

**Cluster dithering between two value bands.** Not a full 50% checker (reads as noise) — a
*boundary* dither only on the 1–2 rows where two bands meet, so faces round without speckle:
```ts
// on the transition row(s) between band A (lighter) and band B (darker):
const useA = ((x + y) & 1) === 0;   // 50% on the seam row only
g.set(x, y, useA ? bandA : bandB);
// softer/sparser: ((x + 2*y) % 3 === 0) ≈ 33% ; ((x ^ y) & 3) === 0 ≈ 25%.
```
One seam row for cozy. Reuse the idiom already in the code (`(x^y)&2` cobble, `(x+y)&1`
shadow feathering). Reference: SLYNYRD 54 "minor dithering between clusters."

**Hue-shifted 3-band ramps (concrete EDG32 swaps).** Never same-hue-darker — pick a warm/cool
neighbour:
| surface | lit | mid | shadow (becomes) |
|---|---|---|---|
| terracotta roof | `salmon` P | `clay` r | `rust`/`bark` (not clay-dim) |
| plaster wall | `cream` c | `tan` t | `wood`/`bark` |
| stone | `silver` l | `slate` S | `navy`/`ink` (not `steel`-dim) |
| thatch/wood | `tan` t | `wood` w | `woodDark`/`ink` |
art-01's palette-role audit produces the exact per-`IsoPalette` swap list; this is the target.

**Palette-snapped fBm for terrain (Sub-phase D).** Don't invent a noise fn — port the engine's
canonical value-noise + 3-octave fBm from
[cloud.wgsl](../../engine/core/src/render/webgpu/shaders/cloud.wgsl) to CPU (Book of Shaders
ch.11/13, already tuned + shipped): `hash21(p)=fract(sin(dot(p,(127.1,311.7)))*43758.5453)`,
cubic-Hermite `valueNoise`, `fbm3` (amp 0.5→0.25→0.125, freq ×2, normalize /0.875). Sample per
cell (deterministic on `tx,ty`), then **`step()`-quantize to 2–3 EDG shades** (like the shader's
alpha tiers) — large soft tonal drift snapped to palette, never a continuous gradient. Layers a
low-freq fBm term on top of `terrain-dither.ts`'s existing high-freq `(tx,ty,type)` clusters.

## Sub-phase B — Buildings (biggest visual surface)
Files: [`iso-draw.ts`](../../games/citadel/client/src/render/sprites/recipes/iso-draw.ts),
[`buildings.ts`](../../games/citadel/client/src/render/sprites/recipes/buildings.ts).
- **Cluster dithering** between lit/mid/shaded bands in `drawWalls`, `drawGableRoof`, the
  `postMill` cylinder, `drawAshlarCourses` — a sparse 1px checker on `(x+y)&1` for one
  transition row. Subtle (cozy, not gritty).
- **Hue-shifted ramps** (art-01 audit): swap straight-darker steps for the warm/cool EDG32
  neighbours per the [style bible](../wiki/citadel-art-style.md#palette-bias-edg32-roles).
- **Warm ridge/corner kiss** (`salmon`/`gold`) on lit roof ridges + the near vertical corner.
- **Warm dusk window glow**: give `drawWindow` glass a `gold`/`yellow` variant the renderer
  can select by night factor (thread via the existing wash/night signal — render-only).
- **Richer ground props** (`isoGroundProps`): more variety — flower boxes, wood stacks,
  laundry lines — for the lived-in read; keep deterministic on `groundSeed`.
- Keep each FORM's silhouette distinct; re-run the recipe opaque-fraction test.

## Sub-phase C — Units / characters
File: [`units.ts`](../../games/citadel/client/src/render/sprites/recipes/units.ts) (32×32
villager/raider/pedestrian, multiply-tinted grey ramps).
- At 2× add a 4th ramp value + warmer skin/cloth; keep the darkest chars for the multiply-
  tint contract (outline stays dark, white body takes the tint).
- Softer/feathered contact shadow (`footShadow`) matching the building shadows.
- **Idle sway + 1–2 walk frames**, cycled on the render clock like the mill sails (render-
  only, no sim/determinism impact) so figures stop reading as static cutouts. Add frame
  names + a `*FrameAt(clockMs)` selector mirroring `millFrameAt`; budget atlas cost.

## Sub-phase D — Terrain + fields
File: [`terrain-dither.ts`](../../games/citadel/client/src/render/terrain-dither.ts) + the
open-field/market/plaza ground diamonds in `iso-draw.ts`.
- Warmer earth tones; **cluster-not-speckle** dither; palette-snapped noise variation (Book
  of Shaders ch.11–12, baked into the recipe/dither, deterministic) so the ground breathes.
- Keep tiles **flat** (the geometric lift stays removed — it desyncs roads/bridges/picking).
- Give field furrows / market cobble / plaza paving the same warmth pass.

## Sub-phase E — Roads / networks / walls
File: [`autotile.ts`](../../games/citadel/client/src/render/autotile.ts) + network quads.
- Cozy warm cobble/dirt tones.
- **Audit outlined-tile "pixel tangents"** at diamond abutments (per the style bible /
  survey) — ensure autotiled seams don't double-outline; roads/bridges read soft, not harsh.

## Acceptance (per sub-phase)
- EDG32 palette guard green; recipes deterministic; **no projection/depth math changed**.
- `npm run typecheck` + `npm run test -w @citadel/client` green.
- **Verified in a real browser** (playtest-citadel) at real zoom — per
  [verify-ui-in-browser-before-done]; before/after screenshot vs the art-01 baseline.
- Silhouettes still distinct; nothing clips its quad.
