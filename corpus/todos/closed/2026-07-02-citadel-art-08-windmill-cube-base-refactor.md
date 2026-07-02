---
title: "Citadel art-08 — windmill: cubic base → cylindrical tower refactor"
created: 2026-07-02
status: todo
tags: [citadel, client, render, art, isometric, mill, refactor]
depends-on: [art-04]  # builds on the fort round-drum work
scope: BRIEF-ONLY (spec + acceptance)
---

# art-08 — Windmill cubic-base → cylindrical-tower refactor

## Why (code-grounded)

The mill reads as a **cone/spinning-top** — a cylinder that tapers from a wide base to a
near-point, with a thin awkward sail cross — not a windmill. From
[`postMill`](../../games/citadel/client/src/render/sprites/recipes/iso-draw.ts) (~L677):
the body is one tapered cylinder (`baseR`→`topR`) start-to-finish, sitting straight on
the ground diamond with no base structure. It's confirmed in `showcase-noon.png` (the
center-right cone).

Real tower/smock mills are a **broad masonry/timber BASE (a cube/frustum) with a
narrower ROUND tower rising from it**, capped by a domed cap the sails mount on. That's
also the standard iso-pixel construction: build the cubic base volume first, then set the
cylinder on top (see references below).

## Goal / acceptance

- **Cubic base, cylinder up.** The mill is a two-part volume: (1) a **rectangular iso
  base** — the footprint diamond extruded up a wall band with two visible flat faces + a
  hard near corner (reads square, like the fort walls) — then (2) a **round stone/timber
  drum** rising from the base top, tapering only gently, capped by the domed cap. The
  base↔drum transition is a clear ledge, not a smooth taper.
- **Cylinder shading** per the iso references: a bright highlight stripe just off the
  LEFT edge, a dark stripe by the RIGHT edge, mid-band between; serrate/dither the drum's
  vertical edges so they don't read as perfect straight lines. Base faces use the flat
  lit-left/shaded-right wall tones (committed UL sun) so base (flat) vs drum (curved) read
  as different volumes.
- **Sails** read as a bold 4-arm windmill cross with latticed canvas blades (already
  animated by `isoWindmillSails`) mounted on the cap front — sized so they clear the drum
  and read at gameplay zoom, not a thin `X`.
- **Refactor**, not a patch: `postMill` composes a `cubeBase(...)` + `roundDrum(...)`
  (reuse/adapt art-04's `drawRoundDrum`) + the existing cap + sails. Keep the mill's
  animation frames + `heightTiles 3` + 2×2 footprint. Keep it a distinct silhouette
  (silhouette.test.ts stays green — mill must not collapse toward the round tower).
- Palette guard green · typecheck green · `silhouette.test` + `recipes.test` green ·
  **browser-verified** in the showcase (the mill reads as base+tower+sails, not a cone).

## References (study, hand-translate to EDG32 — do not commit external art)

- [SLYNYRD Pixelblog 41 — cube-based iso construction](https://www.slynyrd.com/blog/2022/11/28/pixelblog-41-isometric-pixel-art)
  (complex structures = layered simple geometry off the foundational cube).
- [Pixel Parmesan — fundamentals](https://pixelparmesan.com/blog/fundamentals-of-isometric-pixel-art)
  (cylinder shading: bright stripe off the left edge, dark stripe by the right, serrate
  the verticals).
- itch/YouTube "isometric windmill in Aseprite" for the base+tower+cap+sails massing.
- [inspirations/CREDITS.md](../../inspirations/CREDITS.md).

Graded against the [asset critique rubric](../wiki/citadel-asset-critique.md) A/B/C.
