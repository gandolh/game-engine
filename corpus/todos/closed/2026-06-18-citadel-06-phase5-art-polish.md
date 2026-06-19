---
title: "Citadel Phase 5 — settlement tiers + art + polish (sprites, save/load)"
created: 2026-06-18
status: open
tags: [citadel, phase5, tiers, progression, art, polish, save]
---

# Phase 5 — Settlement tiers + art + polish

The game is already playable by end of Phase 4. This phase gives the no-win sandbox a
progression spine (tiers) and makes it look and feel finished. Non-blocking for
"is it a game"; sequenced last.

## Scope
- **Settlement tiers (the progression spine).** The citadel advances through named tiers — **Hamlet → Village → Town → Citadel → Fortress-City** — gated by population / building count / defense strength. Each tier: unlocks new buildings + decrees, and visibly **renames + re-crests** the settlement. Replaces the old flat "milestone unlocks" item; milestones ARE the tier gates. Gives direction + pride without a win screen.
- **Authored EDG32 sprites** swapped in for placeholder rectangles, via the existing `atlas-builder` pipeline: ground/terrain, the building set (house, farm, woodcutter, storehouse, quarry, chapel, market, walls, gate, tower, garrison, keep), villagers + carts/haulers, raiders. Within the 32-color palette; guard test stays green.
- **Save/load UX:** persist + restore the **command log** (the canonical save artifact from Phase 1); load replays it deterministically to reconstruct state. Surface in a menu.
- **Polish:** HUD/UI pass, home/loading screens, audio hooks (if any), event-feed styling, day/season visual wash (reuse engine day/night tinting if desired).

## Decisions (grilled 2026-06-18)
- **Settlement tiers** are the progression spine (Hamlet→…→Fortress-City), folding the old flat milestone-unlock item into a named, identity-bearing ladder (APR #29).
- Prestige score + end-of-run summary (Farm Valley recap tech) is available as a LATER add, NOT committed to v1 (APR #29).
- EDG32 pixel-art via existing atlas pipeline; build-with-placeholders-first means this is purely a swap-in (APR #10).
- Save = persisted command log + deterministic replay (APR #4, #13) — no separate serialization format needed.

## Done when
- All placeholder rects replaced by EDG32 sprites; palette guard green; no visual regressions in placement/render.
- Save → quit → load reconstructs an identical citadel via command-log replay.
- Milestones gate the building catalog and surface in UI.
- Typecheck + full test pass at this milestone.
