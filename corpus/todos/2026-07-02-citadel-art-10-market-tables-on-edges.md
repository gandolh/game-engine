---
title: "Citadel art-10 — market: stalls on the plot edges"
created: 2026-07-02
status: todo
tags: [citadel, client, render, art, isometric, market]
scope: BRIEF-ONLY (spec + acceptance)
---

# art-10 — Market stalls on the plot edges

## Why (code-grounded)

The market stalls cluster in the **middle** of the plot, leaving the plot rim bare and
reading as a lump rather than a market square. From
[`marketStalls`](../../games/citadel/client/src/render/sprites/recipes/iso-draw.ts):
the two stalls are placed at `stall(cx ± halfW*0.34, midY ± diaH*small)` — near the
diamond CENTRE. Visible in `showcase-noon.png` (the striped-awning market).

A market square reads best with **stalls/tables around the EDGES** of the cobbled plot and
the centre kept open (the gathering space), like a real market square.

## Goal / acceptance

- **Stalls on the rim, centre open.** Move the stalls out to the plot's diamond EDGES —
  e.g. one along the near-left edge and one along the near-right edge (or all four rim
  segments if legible), tables/awnings facing inward, leaving the cobbled centre clear.
  Keep them within the footprint (transparent-corner invariant holds; no clipping).
- Preserve the existing stall art (posts + table + piled goods + striped awning + fringe)
  and the cobble ground diamond; only their PLACEMENT changes.
- Depth: stalls nearer the camera (front-rim) must sort in front of the back-rim ones so
  they don't overlap incorrectly — place the front stall lower on the diamond.
- Keep `market` a distinct silhouette + its LOW_FLOOR opaque exemption (open form).
- Palette guard green · typecheck green · recipes.test + silhouette.test green ·
  **browser-verified** (market reads as an edged square with an open centre).

## Notes

- Consider 3–4 stalls (one per rim edge) if the 2×2 footprint has room and it stays
  legible — a fuller market — but 2 on the near edges is the minimum fix.

Graded against the [asset critique rubric](../wiki/citadel-asset-critique.md) A/G.
