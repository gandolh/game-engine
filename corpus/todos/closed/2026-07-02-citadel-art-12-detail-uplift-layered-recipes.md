---
title: "Citadel art-12 — detail/realism uplift + layered composite (hi-res) recipes"
created: 2026-07-02
status: todo
tags: [citadel, client, render, art, isometric, detail, atlas, layering, research]
depends-on: [art-08, art-11]  # after the windmill refactor + roof fix (they touch the same shared FORMs)
scope: BRIEF-ONLY (spec + acceptance)
---

# art-12 — Detail/realism uplift + layered composite recipes

## Why

The set reads clean but a bit **flat/simple** — the ask is "more detailed and realistic,"
with an explicit invitation to **compose multiple bake recipes into one higher-resolution
asset**. Today each building is ONE monolithic `IsoGrid` recipe rasterised whole; detail is
bounded by `ISO_ART_SCALE = 2` and by everything living in a single generator function.

Two levers, from iso-pixel best practice (refs below): **(a) raise authoring density**, and
**(b) build complex assets as LAYERED modular pieces** — "complex structures break down into
simple geometry off the foundational cube, composited piece-by-piece" (SLYNYRD 41). Our
recipe system is already halfway there (accents compose over a base FORM); this brief makes
composition a first-class, higher-fidelity path.

## Goal / acceptance

Pick the achievable slice; this is a QUALITY pass, not a rewrite.

1. **Layered composite recipes (the headline).** Introduce a way to author one asset as a
   STACK of sub-recipes (base volume + roof + trim + props), each a small focused generator,
   composited (painter-ordered, transparent-aware) into the final atlas frame — so a
   building's detail isn't capped by one function's complexity and pieces are reusable
   (a chimney/dormer/awning module drops onto any base). Keep the output a single atlas
   frame per type (no runtime layer cost); the layering is an AUTHORING convenience baked at
   boot. Prove reuse by rebuilding ≥2 existing types from shared modules.
2. **Higher effective resolution.** Either bump `ISO_ART_SCALE` (2→3 or 4 — the code was
   authored for ≥4×; art-01 chose 2 as the middle ground) OR let composite pieces author at
   a higher local density than the base, so added detail (roof tiles, timber studs, window
   muntins, stone coursing, ground texture) reads crisply. Re-audit the per-recipe detail
   terms (`R(n * ISO_ART_SCALE / 4)`) so nothing rounds to mush at the chosen scale.
3. **Concrete detail wins** (apply the density where it shows): individually-read roof
   shingles/thatch texture, timber-frame studs + wattle infill, window muntins + sills +
   shutters, stone coursing with cornerstones, ground-contact detail (a cobble/dirt apron,
   grass tufts at the base), and a subtle ambient-occlusion darkening where volumes meet.
4. **Guardrails hold:** EDG32 only (palette guard); deterministic (no RNG/wall-clock in
   recipes); the atlas stays pow2 shelf-packed and within a sane size budget (watch the
   frame-count × dimension growth — record the atlas delta); `silhouette.test` +
   `recipes.test` + depth test stay green; every touched type **browser-verified** in the
   showcase at the new density.

## Approach notes / research

- **Layering ≠ runtime layers.** Composite at BAKE time into one frame (keeps the sprite-
  batch cheap + the "assets are code / one atlas" invariant). A `composite([baseFn, roofFn,
  …])` helper that paints each onto the shared `IsoGrid` in order is the minimal shape;
  accents already work this way — generalise + formalise it.
- **Watch the atlas budget.** Higher `ISO_ART_SCALE` multiplies every frame's px; with the
  mill/unit/lit/flame frame families that adds up. Measure `packShelf` output before/after;
  if it balloons, prefer per-piece local density over a global scale bump.
- **Determinism + palette are non-negotiable** (auto-FAIL in the critique rubric).

## References (study, hand-translate — no external art in the build)

- [SLYNYRD Pixelblog 41](https://www.slynyrd.com/blog/2022/11/28/pixelblog-41-isometric-pixel-art)
  (layered piece-by-piece construction off the cube) ·
  [Pixelblog 54](https://www.slynyrd.com/blog/2025/1/23/pixelblog-54-isometric-pixel-art)
  (shading workflow: bevels → AA → outline → cluster dither) ·
  [Pixel Parmesan fundamentals](https://pixelparmesan.com/blog/fundamentals-of-isometric-pixel-art)
  (readability, cylinder shading) ·
  [Modular Isometric Pixel Art tutorial (YouTube)](https://www.youtube.com/watch?v=YN7X0NfxjPc)
  (modular composite pieces) · [inspirations/CREDITS.md](../../inspirations/CREDITS.md).

## Out of scope

- The specific windmill (art-08) + roof (art-11) fixes land FIRST (this depends on them so
  the shared FORMs are correct before the density bump amplifies them).

Graded against the [asset critique rubric](../wiki/citadel-asset-critique.md) B (depth) + G (cohesion);
this is the one most likely to move the "feels premium" needle.
