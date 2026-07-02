---
title: "Citadel — isometric pixel-art quality: research + decisions (survey)"
created: 2026-07-01
status: todo
tags: [citadel, client, render, art, isometric, pixel-art, shaders, research]
---

# Citadel iso pixel-art quality — research & decisions

The **survey** that grounds the Citadel cozy-art upgrade: external craft study, a code-
grounded map of what Citadel renders today, and the locked decisions. It is the *why*.

- The **style bible** (durable art-direction rules) → [wiki/citadel-art-style.md](../wiki/citadel-art-style.md).
- The **implementation work** (phased, verifiable) → todo briefs:
  - [art-01 — style bible + 2× scale flip (the gate)](2026-07-01-citadel-art-01-scale-flip-and-palette.md)
  - [art-02 — recipe fidelity pass (buildings / units / terrain / roads)](2026-07-01-citadel-art-02-recipe-fidelity-pass.md)
  - [art-03 — atmosphere + reusable fBm overlay pass](2026-07-01-citadel-art-03-atmosphere-and-fbm-overlay.md)
  - **Wave 2 (2026-07-02, DONE — de-samify + fire; graded PASS via the [critique rubric](../wiki/citadel-asset-critique.md)):**
    - [art-04 — building personality & silhouette de-samification](closed/2026-07-02-citadel-art-04-personality-and-silhouette.md)
    - [art-05 — unit / character personality](closed/2026-07-02-citadel-art-05-unit-personality.md)
    - [art-06 — all-assets showcase page (isometry + fire test harness)](closed/2026-07-02-citadel-art-06-asset-showcase-page.md)
    - [art-07 — fire effects (flame + embers + glow)](closed/2026-07-02-citadel-art-07-fire-effects.md)
  - External reference art (study-only, CC0 manifest): [inspirations/CREDITS.md](../../inspirations/CREDITS.md).

> **Framing:** Citadel is **already true-isometric** (2:1 dimetric, 32×16 tiles, correct
> projection + `x+y` painter's depth, per [true-iso brief 21](2026-06-21-citadel-true-isometric.md)),
> with procedural EDG32 recipes + baked contact shadows. This is a **fidelity + art-
> direction** task, **not** an iso conversion or renderer rewrite.

## Locked decisions (grilled 2026-07-01)

1. **Resolution → 2× outright.** `ISO_ART_SCALE = 2`; re-author to that density. Not an
   A/B, not "keep both." Re-opens the 4×-reverted call from
   [restyle brief 95](../briefs/game/done/95-citadel-building-restyle-reference-look.md) at
   the middle ground the code was always parameterised for. 4× stays a **future** knob if 2×
   underwhelms after polish.
2. **Art direction → cozy medieval storybook** (warm bias, golden hour, soft shadows,
   friendly rounded forms, lived-in). Full rules in the [style bible](../wiki/citadel-art-style.md).
3. **Shaders → both.** Refine the existing overlay channels (day/night wash, light pool,
   weather) **and** light up the reusable full-screen fBm overlay. *(Refined 2026-07-01:
   the fBm pass **already exists** — `CloudShadowPass` /
   [cloud.wgsl](../../engine/core/src/render/webgpu/shaders/cloud.wgsl), 3-octave,
   `step()`-quantized, EDG-uniform — but Citadel never calls `setCloudOptions`. So the work
   is wire-up + a warm fog/haze variant, not a from-scratch pass. See art-03.)*
4. **Scope → focused-quality tone, full-overhaul coverage** (buildings, **units /
   characters**, **roads / networks**, terrain, atmosphere, animation), sequenced by category.

## What Citadel does today (verified 2026-07-01, code-grounded)

Source-of-truth ordering code > done-brief > wiki; all below read from source.

- **Projection** — [`iso.ts`](../../games/citadel/client/src/render/iso.ts): `ISO_TILE_W=32`,
  `ISO_TILE_H=16` (2:1), `ISO_HW=16`, `ISO_HH=8`, `ISO_HEIGHT_STEP=8`/storey. Standard
  formula; multi-tile footprints sort by their FAR corner (`isoFootprintBox`). Nothing to fix.
- **Renderer** — WebGPU-only ([`citadel-renderer.ts`](../../games/citadel/client/src/render/citadel-renderer.ts));
  sprite-batch quads from one procedural atlas; snapshot interpolation. Explicit layer stack.
- **Assets are code** — ASCII `PixelRecipe` grids rasterised at boot into one pow2 shelf-
  packed atlas ([`atlas.ts`](../../games/citadel/client/src/render/sprites/atlas.ts)); no
  committed PNGs; game-local (NOT Farm's committed-PNG stack in
  [asset-pipeline.md](../wiki/asset-pipeline.md)). Recipes in
  [`sprites/recipes/`](../../games/citadel/client/src/render/sprites/recipes/): `buildings.ts`,
  `units.ts`, `fx.ts`, iso primitives in `iso-draw.ts`.
- **Terrain** — flat EDG diamonds + hash-based sub-tile dither + elevation-tinted relief,
  baked via `WindowController` ([`terrain-dither.ts`](../../games/citadel/client/src/render/terrain-dither.ts));
  tiles bake FLAT (a geometric lift was tried & removed). Roads/walls/bridges autotile.
- **Palette** — 32-colour **EDG32**, guard-test enforced; all colours via a `SWATCH` char map.
- **Atmosphere** — [`atmosphere.ts`](../../games/citadel/client/src/render/atmosphere.ts):
  `endFrame(wash, particles, weather, _overlay)` — **`wash` renders** (TintPass), **`weather`
  renders** (WeatherPass), **`_overlay` is a NO-OP on WebGPU**. Day fraction + cosine
  `nightFactorOf` already drive a seasonal wash; night light pool = sprite quads. A separate
  **`CloudShadowPass`** (3-octave fBm, `step()`-quantized, EDG-uniform;
  [cloud.wgsl](../../engine/core/src/render/webgpu/shaders/cloud.wgsl), brief 15) is wired
  into the engine via `setCloudOptions` + drawn in `endFrame` — but **Citadel never enables
  it**. So the fBm overlay is built and unused (→ art-03 wires it + adds a warm fog variant).
- **Craft already present in `iso-draw.ts`** (competent — build on it): committed UL sun,
  baked contact shadows (building + unit), 3-value faces + corner highlight + eave AO,
  terracotta tile-course banding, half-timber framing w/ cross-braces, ashlar coursing,
  distinct per-building silhouettes, 8-frame mill-sail animation.

**Load-bearing finding:** the recipe code + comments were **authored for ≥4×** but
`ISO_ART_SCALE = 1` today — so detail (tile courses, studs, ashlar, windows, props) sits at
the legibility floor (`R(n * ISO_ART_SCALE / 4)` terms round to 1–2px). **Going to 2× recovers
the headroom the code already assumes** — which is exactly why the scale flip gates the polish.

## External craft — filtered takeaways

From SLYNYRD 41/54, Pixel Parmesan, Screaming Brain, Pixnote (sources below):
- 2:1 line ~26.565°, tile W=2×H, cube-based, committed light, top/left/right value order — all
  matched by Citadel.
- **SLYNYRD 54 shading workflow**: base → varying bevels → AA → subtle outline → **minor
  dithering between clusters**. Citadel has faces + AO + outline; **cluster dithering is the
  least-used, highest-leverage low-risk step.**
- **Hue-shift ramps** (shadow cool/deep, highlight warm) — Citadel leans on value steps;
  EDG32 has the warm/cool neighbours to ramp through. Cozy wants warm.
- Outlines are a tradeoff: un-outlined tiles tile cleanest; **audit autotiled seams for "pixel
  tangents."**
- fBm (ch.13): octaves freq ×2 / amp ×0.5 — best as a *continuous overlay* (fog), or baked
  palette-snapped into terrain; **never a live sprite recolour** (breaks the palette guard).

## On downloading free assets — reference-only (decided)

Do **not** commit external CC0 PNGs: Citadel's art is procedural code + palette-guarded + no
import path; external art fails the guard, needs full recolour (= re-authoring), and breaks
the deterministic "assets are code" invariant. Study packs for form/silhouette/shading only.
Best references in the [style bible](../wiki/citadel-art-style.md#references).

## Sources

- [SLYNYRD 41](https://www.slynyrd.com/blog/2022/11/28/pixelblog-41-isometric-pixel-art) ·
  [SLYNYRD 54](https://www.slynyrd.com/blog/2025/1/23/pixelblog-54-isometric-pixel-art) ·
  [Pixel Parmesan](https://pixelparmesan.com/blog/fundamentals-of-isometric-pixel-art) ·
  [Screaming Brain — Iso Grids](https://screamingbrainstudios.com/isometric-grids/) ·
  [Pixnote 2:1](https://pixnote.net/en/learn/isometric/)
- [The Book of Shaders](https://thebookofshaders.com) — [6](https://thebookofshaders.com/06/) ·
  [11](https://thebookofshaders.com/11/) · [12](https://thebookofshaders.com/12/) ·
  [13](https://thebookofshaders.com/13/)
- [Painter's algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Painter%27s_algorithm)
