---
title: "Farm Valley art — improve big-asset quality (houses, trees, stones, NPC decorative items), using Citadel's assets as the quality bar"
created: 2026-07-15
status: closed (2026-07-16, `96ec2f0` — 23 recipes, Citadel techniques on EDG32, frames unchanged)
tags: [farm, art, atlas, quality]
---

# Improve the quality of Farm Valley's big assets, taking Citadel as the example

Citadel's assets set a higher visual bar. Bring Farm Valley's big assets up to
that level: houses, trees, stones, and the decorative items around the
different NPC farms.

## Context

- Farm sprites are baked from per-asset pixel recipes in
  [@farm/atlas-recipes](../../games/farm/atlas-recipes/) via
  `npm run atlas` ([@tool/atlas-builder](../../tools/atlas-builder/));
  `npm run preview` renders the world to a PNG for quick review.
- **Palette constraint:** Farm/engine assets must stay on EDG32 (`EDG.*`) —
  Citadel's Apollo-46 palette is *not* available to Farm (locked decision, see
  [wiki/decisions.md](../wiki/decisions.md) and the palette guard test). "Take
  the example from Citadel" means its techniques/quality (shading, silhouettes,
  detail density), not its palette.

## Acceptance

Houses, trees, stones, and NPC decorative assets visibly improved (compare
before/after via `npm run preview`), still EDG32-only, palette guard test green.

## Resolution (2026-07-16)

23 recipes reworked using Citadel's *techniques* on EDG32 only: NW-sun directional light
(matching Citadel's shading convention), 3+ hue-shifted value bands, silhouette-first reads, and
coursed/clustered detail replacing speckle noise. Cottages got shingled gable courses, a lit/shadow
wall split, reflective windows, and a warm lamplit door — per-personality roof hues preserved, and
the five cottage files are generated from one shared wall+roof spec (regenerate together if a wall
changes; they remain plain literal recipes so hand-edits still work). Trees: rounded canopies with
NW highlight cluster + SE occlusion pocket. Stones/cairn: 5-band boulders. NPC decor (scarecrow,
flower-bed, fence-art, windmill + 8 farmyard props): readable silhouettes. No frame sizes changed —
atlas layout contract untouched; regenerated committed atlas artifacts are in the same commit.
Before/after: compare `npm run preview` at `96ec2f0` vs its parent. Gates: palette guard 8/8,
farmer-frames green against the new atlas, in-browser world check clean.
