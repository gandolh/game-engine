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

## Outcome (2026-11-22)

Done. The record is on [mathquest-ui.md](../../wiki/mathquest-ui.md) → *Combat sprites from an atlas*.

- **The recipes.** A new package, [`@mathquest/atlas-recipes`](../../../games/mathquest/atlas-recipes/src/index.ts),
  holds Făt-Frumos and the six enemies as character grids, one pixel per unit `u` of the old drawings. They
  were ported by running each shape drawing at `u = 8` and sampling every unit cell at its centre. At 8× the
  triangles' absolute pixel constants (a 2 px minimum width, a 1 px row overlap) don't fatten the 1-unit
  grid. The drop shadow (ink at alpha 0.28) is skipped and stays a draw-time shape. The ground line is the
  bottom row, and one transparent pixel of margin left, right and on top keeps every corner clear for brief
  11's checks. The enemies face left and the hero right, as before. The one-off port script isn't kept: the
  recipes are now the source, and brief 14 redraws them.
- **Colours.** [palette.ts](../../../games/mathquest/atlas-recipes/src/palette.ts) maps each character to a
  `MATE_PAL` role. The client's [sprites.test.ts](../../../games/mathquest/client/src/ui/sprites.test.ts) pins
  every value to `MATE_PAL`, role for role, and the cook checks them against Resurrect-64 (`"RESURRECT64"`,
  now an engine palette the cook resolves by name). The palette guard already scopes everything under
  `games/mathquest/`, so the new package is covered.
- **The cook** registers MateQuest ([games.ts](../../../tools/atlas-builder/src/games.ts)): one `combat` sheet,
  128×64, and its page, in `games/mathquest/client/public/atlas/`. The layering test now lets the cook, and
  only the cook, import every game's `@<game>/atlas-recipes` package (brief 09 had flagged this); any other
  import of a second game still fails.
- **Drawing.** [sprites.ts](../../../games/mathquest/client/src/ui/sprites.ts) keeps its `(surface, cx, baseY, u)`
  functions. Each now draws its shadow and one `surface.sprite` quad at `max(2, floor(u))`, at whole-pixel
  positions, feet on the ground line and the old `cx` on the recipe's anchor column. So `combat-screen.ts`
  didn't change. The boot and the DEV card load the cooked atlas.
- **Checks.** Brief 11's recipe checks run over the seven recipes and find nothing, so MateQuest's
  allowlist is empty.

**Acceptance.**

- Screenshots of the combat screen with each of the six enemies, before and after, at 1280×800:
  [verify/2026-11-22-mathquest-combat-atlas/](../../verify/2026-11-22-mathquest-combat-atlas/). They were played
  with the bench's move policy on seed 1; Muma Pădurii (a forest elite) needed a run that prefers elite
  nodes. The creatures read as the same creatures, crisper: at this size the enemy draws at 5× (it was 5.6)
  and the hero at 3× (it was 3.9), so each is slightly smaller, and triangles become steps.
- The combat screen's UI quads a frame (`?profile`, a 2 s window on each enemy's first turn):

  | Enemy | Before | After |
  |---|---:|---:|
  | Zmeu (dragon) | 671 | 567 |
  | Strigoi | 609 | 562 |
  | Căpcăun | 599 | 569 |
  | Vârcolac | 618 | 564 |
  | Balaur | 607 | 573 |
  | Muma Pădurii | 703 | 576 |

- The palette guard covers the new package, and brief 11's checks run over its recipes.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

