---
title: "Citadel art-11 — fix reversed / weird roof slope shading"
created: 2026-07-02
status: todo
tags: [citadel, client, render, art, isometric, roof, shading, bug]
scope: BRIEF-ONLY (spec + acceptance)
---

# art-11 — Fix reversed / weird roof slope shading

## Why (code-grounded — a real shading bug)

Several roofs read "weird / reversed" — the lit and shaded facets don't agree with the
committed upper-left sun. Root cause in
[`drawGableRoof`](../../games/citadel/client/src/render/sprites/recipes/iso-draw.ts) (~L246):
the roof is shaded on TWO independent axes that fight each other:

- **side:** `lit = x < cx` (left half lit, right half shaded) — correct.
- **slope:** `onFar = y < eaveUpperY` (back slope) → darkened; front slope → lit.

Combined, a hipped roof's four facets get: front-left = `roofLight` (brightest),
back-left = `roof` (darker), front-right = `roof`, back-right = `roofDark`. But under an
**upper-left sun the BACK-LEFT facet faces the light and should be the brightest**, while
the front-left slopes away and should be a touch darker. The current code makes front-left
the brightest → the roof reads tipped/reversed, and on the lean-to + some hips the ridge
highlight lands on the wrong side. (Visible on the orange cottages + lean-to sheds in
`showcase-noon.png`.)

## Goal / acceptance

- **Facet shading agrees with the UL sun.** For a hip/gable, order the four facets by how
  much each faces the upper-left light: **back-left (brightest) → {front-left, back-right}
  (mid) → front-right (darkest)**. Fix the `onFar`/`lit` combination so the ridge highlight
  sits on the SUNWARD (back-left) crest, not the front. Verify against a plain grey test
  swatch that the brightest roof pixel is up-and-left of the darkest.
- **Lean-to (`drawLeanToRoof`) too:** its single slope must read lit on the sunward side;
  re-check the `lit ? roofLight : roof` assignment there for the same inversion.
- **No banding regression:** keep the tile-course grooves + cluster dither, just on the
  corrected value order. Ridge cap + warm kiss stay on the sunward ridge.
- **Regression guard:** extend `silhouette.test.ts` (or a new small roof test) with a
  "roof light gradient points up-left" invariant — the mean position of the brightest roof
  band is above-and-left of the mean position of the darkest — so a future edit can't
  re-invert it. (B5 in the critique rubric, made testable.)
- Palette guard green · typecheck green · depth test (≥3 values) still green ·
  **browser-verified** (roofs read consistently lit from the upper-left across the set).

## Notes

- This touches the SHARED `drawGableRoof` (cottage/church/warehouse/healer/bakery all use
  it) — one fix corrects the whole set, but re-verify each in the showcase since the value
  order shifts. `drawHippedRoof` (boxBuilding/quarry-era) + `drawFlatCrenellatedTop` use
  simpler `dyAbs<0`/`x<cx` splits — sanity-check they're not also inverted while here.

Graded against the [asset critique rubric](../wiki/citadel-asset-critique.md) B5 (committed sun).
