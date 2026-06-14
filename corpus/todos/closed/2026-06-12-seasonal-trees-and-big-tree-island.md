---
title: Seasonal trees + a detailed big-tree island
created: 2026-06-12
status: done
tags: [render, world, seasons]
depends_on: [foundation-grow-grid-to-240, foundation-theme-decor-table]
---

# Seasonal trees + a detailed big-tree island

> **DONE 2026-06-12.** **Piece 1:** `seasonalTreeFrame` generalized to a 4-way map
> over bases `structure/{tree,bush,fruit-tree,big-tree}` (suffix: spring `-blossom`,
> summer `` , autumn `-autumn`, winter `-bare`); instant swap. New atlas recipes:
> tree-blossom, bush-blossom/-autumn/-bare, fruit-tree (+ base, which didn't exist)
> /-blossom/-autumn/-bare. `foliageSway` switched to prefix matches so variants sway.
> **Fixed a latent bug:** mature orchard trees rendered as saplings (no frame swap) —
> orchard.ts now sets `sprite.frame = structure/fruit-tree` on maturity, so the
> seasonal remap applies. **Piece 2:** new `big-tree` landmark island (10×10, bridged
> W to the volcano islet — placed by a grid-scan for a spot outside the farm spoke
> web, authored in LIVE/scaled coords). Bespoke 48×64 `structure/big-tree` (+3 season
> variants) baked as a `BIG_STRUCTURES` centerpiece; `pushBuildingSprites` now takes
> `season` and remaps it each frame. 3-tile trunk footprint solids. theme `'big-tree'`.
> Guard test (frames-seasonal.test.ts) + geometry/world guards green; full repo
> **1081 tests** + typecheck + palette guard green.
>
> **Deferred (user, 2026-06-12):** ANIMATED season transitions (cross-fade via the
> animation engine) instead of instant pop — done as a brief-85 consumer follow-up,
> not here. Render-only / determinism-safe. See briefs/game/todo/85-animation-engine.md.

Two coupled pieces: trees change with the season, and a new island whose
centerpiece is one large, detailed tree that also changes with the season.

## Decisions (grilled 2026-06-12)

### Piece 1 — 4-way seasonal trees (PARTIALLY BUILT)

There is already a `seasonalTreeFrame(frame, season)` remap
([frames.ts:193](../../packages/sim-core/src/render-systems/frames.ts)) and the
snapshot already carries `season` — but it only has **two** variants today:
`-autumn` and `-bare` (winter). **Spring and summer both render the same green
tree.** The todo wants four distinct looks.

- **Add `structure/tree-blossom` (spring)** atlas frame and **extend
  `seasonalTreeFrame` to a 4-way map:** blossom (spring) / green (summer) / autumn
  / bare (winter). Pure atlas recipe + ~2-line remap change. EDG32-only.
- **Instant pop at the season boundary** (no cross-fade) — the frame swaps when the
  season changes. Simplest, deterministic, no blend logic.
- **Extend seasonal looks to orchard fruit-trees AND berry bushes too** (grilled
  2026-06-12), not just forest/décor trees — for visual consistency. Orchard trees
  already track `FRUIT_SEASON`; berry bushes are a `tileFeature` "bush" kind. Each
  needs its own seasonal frame variants + remap entries. (More atlas frames than
  the trees-only path.)

### Piece 2 — bespoke multi-tile big-tree island

- **Bespoke multi-tile big-tree sprite** (NOT scaled-up reuse — scaling looks
  blocky for a showpiece). Author a dedicated large tree with its **own 4 seasonal
  frames**, remapped the same way. Use the non-16×16 sprite pipeline already
  proven by the 2×3 forge-house (`recipes.ts` `width`/`height`; `BIG_STRUCTURES`).
- Static `solid` centerpiece on a **new `big-tree` themed island** — a grow-grid
  leaf (rides on [grow-grid-to-240](2026-06-12-00-foundation-grow-grid-to-240.md);
  `big-tree` theme in the [décor table](2026-06-12-00-foundation-theme-decor-table.md)).

## Acceptance

- Regular trees, orchard fruit-trees, and berry bushes all show **four** distinct
  seasonal looks (blossom/green/autumn/bare equivalents), swapping instantly at the
  season boundary.
- A new island exists with a single large, detailed bespoke tree as centerpiece.
- The big tree changes across the four seasons alongside regular trees.
- New island keeps ≥2-tile margin + clean bridge; EDG32 palette guard green;
  determinism preserved.
