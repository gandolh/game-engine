# Brief 94 — Upscale Citadel units + terrain to match the 4× buildings

> **SUPERSEDED (2026-07-02).** Premise obsolete: buildings never stayed at 4×, so
> units/terrain have nothing to "catch up" to. Moved out of `todo/` during a
> corpus structure audit. History below.

> ⚠️ **Likely OBSOLETE (2026-06-21).** Buildings were reverted from 4× back to
> 32-based (`ISO_ART_SCALE = 1`) — the user judged 32 dense enough in practice
> (see brief [95](../done/95-citadel-building-restyle-reference-look.md)). With buildings
> at 1×, units/terrain no longer need to "catch up," so this brief's premise no
> longer holds. Close/supersede unless a deliberate global upscale is revived.

## Why

Citadel building sprites were rebuilt with distinct medieval forms authored at
**4×** (`ISO_ART_SCALE`, see [iso.ts](../../../games/citadel/client/src/render/iso.ts)
and the 2026-06-21 "Per-building FORMS + 4× detail" log/wiki entries). The
villager/raider/pedestrian figures and the terrain diamonds are still authored at
**1×** (32-based / the 16px tile), so they now read as noticeably lower-detail
than the buildings. The user accepted this mismatch *for now* and asked to upscale
units + terrain to match in a follow-up — this brief.

## Scope

- **Units** ([recipes/units.ts](../../../games/citadel/client/src/render/sprites/recipes/units.ts)):
  `vil/person`, `raider`, `vil/pedestrian`. They're currently asserted 32×32 /
  16×16 (recipes.test.ts). Re-author at higher res (match the building 4× feel —
  likely 64-based for the two main figures) with more medieval detail (tunic,
  belt, tool/weapon), keeping the grey-ramp tint-multiply convention (quads.ts /
  palette.ts) so the per-instance state/strength colouring still works.
- **Terrain** ([terrain-dither.ts](../../../games/citadel/client/src/render/terrain-dither.ts),
  the baked static layer + `fx/diamond`): raise the per-tile detail (texture
  clusters, shore/edge work) so tiles don't look flat next to the buildings.
  Mind the baked-layer texture budget and the EDG32 guard.

## Constraints / gotchas

- **Render-only.** No sim, no determinism impact (terrain dither + sprites are
  pure render). Prove with `CHECK_DETERMINISM` unaffected if any sim-adjacent file
  is touched (it shouldn't be).
- **Atlas size.** 4× units + denser terrain enlarge the packed runtime atlas
  (still one pow2 sheet; the shelf packer handles it). Confirm it stays sane.
- **Anchor convention** (the ⚠️ note in citadel-overview.md): units are anchored
  by CENTRE; keep `isoSpriteDims`/placement in sync if unit sprite dims change.
- **Tests**: update the 32×32/16×16 unit-dims assertions in
  [recipes.test.ts](../../../games/citadel/client/src/render/sprites/recipes.test.ts);
  keep the EDG32 + opaque-fraction guards green.

## Verify

Rasterize unit recipes to PNG for a fast loop; then a Playwright pass on the real
runtime atlas + the actual game (place buildings, spawn villagers/raiders, judge
that figures and terrain now read at the same fidelity as the buildings).
typecheck + `@citadel/client` tests + engine palette test.
