# Task 12: MateQuest draws its combat sprites from an atlas

**Origin:** the owner, 2026-11-20: pick the best way for asset work. MateQuest's design page plans
pixel art "via the atlas-recipe pipeline". The plan is [frame-budget.md](../../wiki/frame-budget.md).

**Builder:** opus. This brief draws pixel art, and [routing.md](../../routing.md) sends pixel-art
chunks to opus.

**Depends on:** brief 09 (the cook takes a game's config) and brief 10 (one page per game).

## Context

MateQuest's combat screen draws Făt-Frumos and six enemies (`dragon`, `balaur`, `strigoi`,
`varcolac`, `capcaun`, `muma`) from rectangles and triangles every frame
(`games/mathquest/client/src/ui/sprites.ts`, called from `combat-screen.ts`). Each creature is
dozens of UI quads.

Its scale `u` is continuous: `heroU = max(2.4, playH × 0.34 / 28)`, and the enemy's grows with its
HP. So the "pixels" land on fractional screen positions and come out uneven. Pixel-art games scale
by whole numbers so every art pixel is the same size on screen.

MateQuest registers only the font atlas today. `@engine/ui`'s `UISurface.sprite(x, y, w, h,
atlasId, frame)` already draws an atlas frame, so the engine side is ready.

This brief moves the plumbing and keeps today's look. Brief 14 redraws the art.

## Files you OWN

- `games/mathquest/atlas-recipes/` (new package: recipes, a swatch table on `MATE_PAL` colours, the
  atlas config for the cook)
- `games/mathquest/client/public/atlas/` (cooked output), the client's boot (registering the atlas),
  `src/ui/sprites.ts` and `src/ui/combat-screen.ts` (drawing and scale), and `src/card.ts` if the
  portal card draws the same sprites
- The cook's registered-game list, root workspace entries, and the palette guard's MateQuest scope
  for the new package
- `corpus/` pages for this brief: the outcome, `log.md`, [mathquest-ui.md](../../wiki/mathquest-ui.md)
  and the Art line on [mathquest-overview.md](../../wiki/mathquest-overview.md)

## Files you must NOT touch

- `games/mathquest/sim-core`: the `EnemySprite` ids stay as they are.
- The map screen's scenery and its own small hero. They stay shape-drawn in this brief.

## What to do

1. **Port each creature to a recipe,** one pixel per unit `u` of today's drawing. Use today's shapes
   and `MATE_PAL` roles, with fractional units rounded to whole pixels. The enemies face left and
   the hero faces right, as now. Keep each creature's ground line on the recipe's bottom row, and keep
   the drop shadow as a draw-time shape, not part of the recipe.
2. **Cook MateQuest's atlas** with brief 09's cook and brief 10's page step, against the `MATE_PAL`
   colours, a subset of Resurrect 64.
3. **Draw with `surface.sprite`** at a whole-number scale. Take today's `u`, round it down, with a
   minimum of 2. Bigger enemies still look bigger, in whole steps. Use nearest sampling.
4. **Check the recipes** with brief 11's checks. A creature that breaks a rule on purpose goes on the
   allowlist with its reason.

## Acceptance

- Screenshots of the combat screen with each of the six enemies, before and after, at 1280×800, are
  saved under `corpus/verify/` for this brief. The creatures read as the same creatures. They are
  allowed to be crisper.
- The combat screen's UI quad count drops (`?profile`, `ui.quads`). Put before and after in the
  outcome.
- The palette guard covers the new package, and brief 11's checks run over its recipes.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- Look at the six screenshots.
- Deploy: `node cli.ts mathquest deploy` from the vps-deploy checkout (static client only).
