---
title: "Farm Valley art — improve big-asset quality (houses, trees, stones, NPC decorative items), using Citadel's assets as the quality bar"
created: 2026-07-15
status: open
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
