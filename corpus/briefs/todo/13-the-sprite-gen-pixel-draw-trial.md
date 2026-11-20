# Task 13: the sprite-gen pixel-draw trial

**Origin:** the [sprite-gen research](../../todos/closed/2026-11-20-sprite-gen-research.md) of
2026-11-20, and the owner's pick that day to take the best way for asset work. The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Builder:** opus (pixel art, [routing.md](../../routing.md)).

**Depends on:** brief 11 (the recipe checks), brief 12 (MateQuest has an atlas), and the owner's
step below, which comes first.

## Context

sprite-gen's `pixel-draw` has Claude Opus 5.5 write a sprite as a keyed character grid in a fixed
palette (`grid.txt`), then:

1. repairs broken rows;
2. checks the result for palette, transparency, lone pixels, floor row and safe area;
3. has a vision call pick the best of several candidates.

Its own measurements call 32 px and smaller shippable. Agents in this repo already write recipes
directly. So the question is whether `pixel-draw`'s loop draws better recipes than an agent does.
A blind trial on the same subjects answers it.

sprite-gen is a Python tool and never enters this repo or its build. In the research session, auto
mode refused installing it, and a builder would be refused too. The owner runs it.

## Owner step first

1. In a folder outside the repo, install it: `python3 -m venv .venv`, `source .venv/bin/activate`,
   `pip install git+https://github.com/aldegad/sprite-gen`. Sign `claude` in to the plan.
2. From the repo's `corpus/verify/2026-11-20-pixel-draw-trial/` folder, which already holds the two
   palette files (`mate-pal.hex` from `MATE_PAL`, `edg32.hex` from EDG32), run the two drawings below
   into a `pixel-draw/` folder there.
3. Don't open the pictures. The trial is blind, and you pick between the two methods later. The
   commands print a report, which is safe to read.

   ```bash
   sprite-gen pixel-draw --out-dir pixel-draw/strigoi --size 32 --palette mate-pal.hex --candidates 2 \
     --subject "A strigoi from Romanian folklore: a pale undead figure in a dark ragged cloak, side view facing left, standing."
   sprite-gen pixel-draw --out-dir pixel-draw/apple-icon --kind icon --size 16 --palette edg32.hex --candidates 2 \
     --subject "An inventory icon of a red apple with a small green leaf."
   ```

On an API key the two runs cost about $0.30 to $0.40 each, by sprite-gen's figures. On the Claude
login they count against the plan's usage.

## Files you OWN

- `tools/recipe-import/` (new): `grid.txt` to a recipe `.ts` for a given game
- `corpus/verify/2026-11-20-pixel-draw-trial/` (imported recipes, the comparison sheet,
  the check results)
- `corpus/` pages for this brief: the outcome, `log.md`, and the sprite-gen paragraph of
  [frame-budget.md](../../wiki/frame-budget.md)

## Files you must NOT touch

- Any game's shipped recipes, atlases or code. The trial's recipes live in the verify folder.

## What to do

1. **The importer.** `tools/recipe-import` reads a `grid.txt` and writes a `PixelRecipe` file for a
   named game. Each colour maps to that game's swatch character. Where several characters share a
   colour, as in Farm's `G` and `C`, the first in the swatch table wins. The importer refuses a
   colour outside the palette and crops a square drawing to a given width and height. Unit-test it
   on a fixture grid.
2. **The agent's drawings.** For the same two subjects, sizes and palettes, write two candidate
   recipes each, directly in recipe form, and pick one of each. That is how agents draw here today.
3. **Check all four winners** with brief 11's checks and the palette guard, and record the results.
4. **The blind sheet.** Render the four winners side by side at 1×, 4× and in place: the strigoi on
   MateQuest's combat platform, the apple in Farm's hotbar slot. Label them A and B per subject,
   in a random order recorded in a sealed note in the verify folder.
5. **Record the result** once the owner has picked. Name the winner per subject, unseal the order,
   and write the outcome: adopt `pixel-draw` for drafts (brief 14 uses it), or borrow (brief 14 has
   an agent write recipes). Update the sprite-gen paragraph on [frame-budget.md](../../wiki/frame-budget.md).

## Acceptance

- The importer's tests pass, and it turns both `pixel-draw` winners into recipes that pass the
  palette guard.
- The verify folder holds the owner's run folders, the four recipes, the check results, the blind
  sheet and the sealed order.
- The outcome names the owner's pick per subject and the method brief 14 will use.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- The install and the two runs above, before the brief starts.
- Pick A or B for each subject on the blind sheet.
